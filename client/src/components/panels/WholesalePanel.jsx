import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { postAction } from '../../api/client.js';
import { WS_MIN_REP, WS_MIN_STORAGE, VOL_TIERS } from '@shared/constants/wholesale.js';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { getVolTier } from '@shared/helpers/wholesale.js';
import { getCap } from '@shared/helpers/inventory.js';
import { hapticsMedium } from '../../api/haptics.js';

const TIRE_KEYS = Object.keys(TIRES);

export default function WholesalePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(false);

  // Add-client form state
  const [clientName, setClientName] = useState('');
  const [clientTire, setClientTire] = useState(TIRE_KEYS[0]);
  const [clientMin, setClientMin] = useState(10);
  const [clientMax, setClientMax] = useState(50);

  const unlockWholesale = async () => {
    setBusy(true);
    const res = await postAction('unlockWholesale');
    if (res.ok) { hapticsMedium(); refreshState(); }
    setBusy(false);
  };

  const addClient = async () => {
    if (!clientName.trim()) return;
    setBusy(true);
    const res = await postAction('addWsClient', {
      name: clientName.trim(),
      preferredTire: clientTire,
      minOrder: clientMin,
      maxOrder: clientMax,
    });
    if (res.ok) {
      refreshState();
      setClientName('');
      setClientMin(10);
      setClientMax(50);
    }
    setBusy(false);
  };

  // --- Unlock gate ---
  if (!g.hasWholesale) {
    const hasRep = g.reputation >= WS_MIN_REP;
    const totalCap = getCap(g);
    const hasStorage = totalCap >= WS_MIN_STORAGE;
    const canUnlock = hasRep && hasStorage;

    return (
      <>
        <div className="card">
          <div className="card-title">Wholesale Channel</div>
          <div className="text-sm text-dim" style={{ lineHeight: 1.5, marginBottom: 8 }}>
            Open a B2B wholesale channel to supply tires in bulk to fleet operators,
            dealerships, and other commercial clients.
          </div>
        </div>

        <div className="card">
          <div className="card-title">Requirements</div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Reputation</span>
            <span className={`font-bold ${hasRep ? 'text-green' : 'text-red'}`}>
              {g.reputation.toFixed(1)} / {WS_MIN_REP}
            </span>
          </div>
          <div className="row-between mb-4">
            <span className="text-sm text-dim">Storage Capacity</span>
            <span className={`font-bold ${hasStorage ? 'text-green' : 'text-red'}`}>
              {fmt(totalCap)} / {fmt(WS_MIN_STORAGE)}
            </span>
          </div>
          <button
            className="btn btn-full btn-green"
            disabled={!canUnlock || busy}
            onClick={unlockWholesale}
          >
            {busy ? 'Opening...' : canUnlock ? 'Open Wholesale Channel' : 'Requirements Not Met'}
          </button>
        </div>
      </>
    );
  }

  // --- Unlocked view ---
  const tier = getVolTier(g.monthlyPurchaseVol || 0);
  const clients = g.wsClients || [];

  return (
    <>
      {/* Volume Tier Card */}
      <div className="card">
        <div className="card-title">Volume Tier</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Current Tier</span>
          <span className="font-bold text-accent">{tier.label}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Monthly Volume</span>
          <span className="font-bold">{fmt(g.monthlyPurchaseVol || 0)} tires</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Discount</span>
          <span className="font-bold text-green">{(tier.disc * 100).toFixed(0)}%</span>
        </div>

        {/* Tier progression */}
        <div className="text-xs text-dim" style={{ marginTop: 4 }}>
          {VOL_TIERS.map((t, i) => {
            const active = tier.label === t.label;
            return (
              <span key={i} style={{ marginRight: 8 }}>
                <span className={active ? 'font-bold text-accent' : ''}>{t.label}</span>
                {i < VOL_TIERS.length - 1 && ' / '}
              </span>
            );
          })}
        </div>
      </div>

      {/* Client List */}
      <div className="card">
        <div className="card-title">B2B Clients ({clients.length})</div>
        {clients.length === 0 && (
          <div className="text-sm text-dim">No clients yet. Add your first wholesale client below.</div>
        )}
        {clients.map((client) => {
          const tire = TIRES[client.preferredTire];
          return (
            <div key={client.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <div className="row-between mb-4">
                <span className="font-bold text-sm">{client.name}</span>
                <span className="text-xs text-dim">Joined day {client.joinedDay}</span>
              </div>
              <div className="row-between text-xs">
                <span className="text-dim">Preferred: {tire?.n || client.preferredTire}</span>
                <span className="text-dim">Order range: {client.minOrder}&ndash;{client.maxOrder}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Client Form */}
      <div className="card">
        <div className="card-title">Add Client</div>
        <div className="text-xs text-dim mb-4">
          Register a new B2B wholesale client.
        </div>
        <div style={{ marginBottom: 8 }}>
          <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Client Name</label>
          <input
            type="text"
            className="autoprice-offset"
            style={{ width: '100%', textAlign: 'left' }}
            placeholder="e.g. Metro Fleet Services"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Preferred Tire</label>
          <select
            className="autoprice-select"
            style={{ width: '100%' }}
            value={clientTire}
            onChange={(e) => setClientTire(e.target.value)}
          >
            {TIRE_KEYS.map(key => (
              <option key={key} value={key}>
                {TIRES[key].n}
              </option>
            ))}
          </select>
        </div>
        <div className="row gap-8" style={{ marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Min Order</label>
            <input
              type="number"
              className="autoprice-offset"
              style={{ width: '100%', textAlign: 'left' }}
              min={1}
              value={clientMin}
              onChange={(e) => setClientMin(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="text-xs text-dim" style={{ display: 'block', marginBottom: 4 }}>Max Order</label>
            <input
              type="number"
              className="autoprice-offset"
              style={{ width: '100%', textAlign: 'left' }}
              min={1}
              value={clientMax}
              onChange={(e) => setClientMax(Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>
        <button
          className="btn btn-full btn-green"
          disabled={!clientName.trim() || clientMin < 1 || clientMax < clientMin || busy}
          onClick={addClient}
        >
          {busy ? 'Adding...' : 'Add Client'}
        </button>
      </div>
    </>
  );
}
