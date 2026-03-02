import React from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { postAction } from '../../api/client.js';
import { WS_MIN_REP, WS_MIN_STORAGE, VOL_TIERS } from '@shared/constants/wholesale.js';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { getVolTier } from '@shared/helpers/wholesale.js';
import { getCap } from '@shared/helpers/inventory.js';
import { hapticsMedium } from '../../api/haptics.js';

export default function WholesalePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = React.useState(false);

  const unlockWholesale = async () => {
    setBusy(true);
    const res = await postAction('unlockWholesale');
    if (res.ok) { hapticsMedium(); refreshState(); }
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
            dealerships, and other commercial clients. Clients will approach you
            automatically as your reputation grows.
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
  const nextTier = VOL_TIERS.find(t => t.min > (g.monthlyPurchaseVol || 0));

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
          <span className="text-sm text-dim">Your Discount</span>
          <span className="font-bold text-green">{(tier.disc * 100).toFixed(0)}%</span>
        </div>
        {nextTier && (
          <div className="text-xs text-dim" style={{ marginTop: 4 }}>
            Next: {nextTier.label} at {fmt(nextTier.min)} tires/month
          </div>
        )}

        {/* Tier progression */}
        <div className="text-xs text-dim" style={{ marginTop: 8 }}>
          {VOL_TIERS.map((t, i) => {
            const active = tier.label === t.label;
            return (
              <span key={i} style={{ marginRight: 8 }}>
                <span className={active ? 'font-bold text-accent' : ''}>{t.label.split(' ')[0]}</span>
                {i < VOL_TIERS.length - 1 && ' / '}
              </span>
            );
          })}
        </div>
      </div>

      {/* How it works */}
      <div className="card">
        <div className="card-title">How Wholesale Works</div>
        <div className="text-xs text-dim" style={{ lineHeight: 1.6 }}>
          B2B clients approach you automatically based on your <strong>reputation</strong>.
          Each client orders weekly. Keep stock of their preferred tires or they'll leave.
          Higher reputation = more clients (up to 1 per 10 rep).
          <br /><br />
          Max clients at your rep ({Math.round(g.reputation)}): <strong>{Math.floor(g.reputation / 10)}</strong>
        </div>
      </div>

      {/* Client List */}
      <div className="card">
        <div className="card-title">B2B Clients ({clients.length})</div>
        {clients.length === 0 && (
          <div className="text-sm text-dim" style={{ lineHeight: 1.5 }}>
            No clients yet. Keep building your reputation and stocking your warehouse
            — clients will find you automatically each week.
          </div>
        )}
        {clients.map((client) => {
          const tire = TIRES[client.preferredTire];
          const satisfaction = client.satisfaction ?? 100;
          const satColor = satisfaction >= 70 ? 'text-green' : satisfaction >= 40 ? 'text-gold' : 'text-red';
          return (
            <div key={client.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <div className="row-between mb-4">
                <span className="font-bold text-sm">{client.name}</span>
                <span className={`text-xs font-bold ${satColor}`}>{satisfaction}% happy</span>
              </div>
              <div className="row-between text-xs">
                <span className="text-dim">Wants: {tire?.n || client.preferredTire}</span>
                <span className="text-dim">{client.minOrder}&ndash;{client.maxOrder}/order</span>
              </div>
              <div className="row-between text-xs" style={{ marginTop: 2 }}>
                <span className="text-dim">Total ordered: {fmt(client.totalOrdered || 0)}</span>
                <span className="text-dim">Since day {client.joinedDay}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
