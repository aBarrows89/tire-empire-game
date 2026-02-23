import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { STORAGE } from '@shared/constants/storage.js';
import { TIRES } from '@shared/constants/tires.js';
import { CITIES } from '@shared/constants/cities.js';
import { fmt } from '@shared/helpers/format.js';
import { getCap, getInv, getLocInv, getLocCap, getStorageCap } from '@shared/helpers/inventory.js';
import { postAction } from '../../api/client.js';

export default function StoragePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);
  const [txFrom, setTxFrom] = useState('warehouse');
  const [txTo, setTxTo] = useState('');
  const [txTire, setTxTire] = useState('');
  const [txQty, setTxQty] = useState(1);

  const buy = async (type) => {
    setBusy(type);
    await postAction('buyStorage', { type });
    refreshState();
    setBusy(null);
  };

  const transfer = async () => {
    if (!txFrom || !txTo || !txTire || txQty <= 0 || txFrom === txTo) return;
    setBusy('transfer');
    await postAction('transferTires', { from: txFrom, to: txTo, tire: txTire, qty: txQty });
    refreshState();
    setBusy(null);
  };

  const inv = getInv(g);
  const cap = getCap(g);
  const whInv = Object.values(g.warehouseInventory || {}).reduce((a, b) => a + b, 0);
  const whCap = getStorageCap(g);

  // Build transfer location options
  const transferNodes = [
    { id: 'warehouse', label: `Central Storage (${whInv}/${whCap})` },
    ...g.locations.map(loc => {
      const city = CITIES.find(c => c.id === loc.cityId);
      return { id: loc.id, label: `${city?.name || loc.cityId} (${getLocInv(loc)}/${getLocCap(loc)})` };
    }),
  ];

  // Available tires at source
  const srcInv = txFrom === 'warehouse'
    ? (g.warehouseInventory || {})
    : (g.locations.find(l => l.id === txFrom)?.inventory || {});
  const availTires = Object.entries(srcInv).filter(([, v]) => v > 0);

  return (
    <>
      <div className="card">
        <div className="card-title">Total Storage ({inv}/{cap} tires)</div>
        <div className="progress-bar mb-4">
          <div className="progress-fill" style={{ width: `${cap > 0 ? (inv / cap) * 100 : 0}%` }} />
        </div>
        <div className="text-sm text-dim">Storage units:</div>
        {g.storage.map((s, i) => (
          <div key={i} className="row-between text-sm mt-8">
            <span>{STORAGE[s.type]?.ic} {STORAGE[s.type]?.n}</span>
            <span className="text-accent">{STORAGE[s.type]?.cap} cap</span>
          </div>
        ))}
      </div>

      {/* Central Storage (warehouse) inventory breakdown */}
      <div className="card">
        <div className="card-title">Central Storage ({whInv}/{whCap})</div>
        <div className="progress-bar mb-4">
          <div className="progress-fill" style={{ width: `${whCap > 0 ? (whInv / whCap) * 100 : 0}%` }} />
        </div>
        <div className="text-xs text-dim mb-4">
          Sourced and ordered tires arrive here. Transfer to shops to sell.
        </div>
        {Object.entries(g.warehouseInventory || {}).map(([k, qty]) => {
          if (qty <= 0) return null;
          return (
            <div key={k} className="row-between text-sm mb-4">
              <span>{TIRES[k]?.n || k}</span>
              <span className="font-bold">{qty}</span>
            </div>
          );
        })}
        {whInv === 0 && <div className="text-sm text-dim">Empty</div>}
      </div>

      {/* Per-location inventory */}
      {g.locations.length > 0 && (
        <div className="card">
          <div className="card-title">Shop Inventory</div>
          {g.locations.map((loc, i) => {
            const city = CITIES.find(c => c.id === loc.cityId);
            const li = getLocInv(loc);
            const lc = getLocCap(loc);
            return (
              <div key={i} style={{ borderBottom: i < g.locations.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: 8, marginBottom: 8 }}>
                <div className="row-between text-sm mb-4">
                  <span className="font-bold">{city?.name}, {city?.state}</span>
                  <span className={`text-xs ${li >= lc ? 'text-red font-bold' : 'text-dim'}`}>{li}/{lc}</span>
                </div>
                {Object.entries(loc.inventory || {}).map(([k, qty]) => {
                  if (qty <= 0) return null;
                  return (
                    <div key={k} className="row-between text-xs mb-4" style={{ paddingLeft: 12 }}>
                      <span className="text-dim">{TIRES[k]?.n || k}</span>
                      <span>{qty}</span>
                    </div>
                  );
                })}
                {li === 0 && <div className="text-xs text-dim" style={{ paddingLeft: 12 }}>No inventory</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Transfer UI */}
      {(g.locations.length > 0 || whInv > 0) && transferNodes.length >= 2 && (
        <div className="card">
          <div className="card-title">Transfer Tires</div>
          <div className="text-xs text-dim mb-4">Move tires between central storage and shops.</div>

          <div className="mb-4">
            <div className="text-xs text-dim mb-4">From</div>
            <select className="autoprice-select" style={{ width: '100%' }} value={txFrom} onChange={e => { setTxFrom(e.target.value); setTxTire(''); }}>
              {transferNodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <div className="text-xs text-dim mb-4">To</div>
            <select className="autoprice-select" style={{ width: '100%' }} value={txTo} onChange={e => setTxTo(e.target.value)}>
              <option value="">Select destination...</option>
              {transferNodes.filter(n => n.id !== txFrom).map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <div className="text-xs text-dim mb-4">Tire Type</div>
            <select className="autoprice-select" style={{ width: '100%' }} value={txTire} onChange={e => setTxTire(e.target.value)}>
              <option value="">Select tire...</option>
              {availTires.map(([k, qty]) => (
                <option key={k} value={k}>{TIRES[k]?.n || k} ({qty} available)</option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <div className="text-xs text-dim mb-4">Quantity</div>
            <input
              type="number"
              className="autoprice-offset"
              style={{ width: '100%' }}
              min={1}
              max={srcInv[txTire] || 1}
              value={txQty}
              onChange={e => setTxQty(Math.max(1, Number(e.target.value)))}
            />
          </div>

          <button
            className="btn btn-full btn-sm btn-green"
            disabled={!txFrom || !txTo || !txTire || txQty <= 0 || txFrom === txTo || busy === 'transfer'}
            onClick={transfer}
          >
            {busy === 'transfer' ? 'Transferring...' : 'Transfer'}
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-title">Upgrade Storage</div>
        {Object.entries(STORAGE).map(([type, st]) => {
          if (st.c === 0) return null; // skip van
          const cantAfford = g.cash < st.c;
          return (
            <div key={type} className="card" style={{ background: 'var(--surface)' }}>
              <div className="row-between mb-4">
                <span className="font-bold">{st.ic} {st.n}</span>
                <span className="text-accent">{st.cap} cap</span>
              </div>
              <div className="text-xs text-dim mb-4">
                ${fmt(st.c)} upfront · ${fmt(st.mo)}/mo rent
                {st.staff > 0 ? ` · ${st.staff} staff required` : ''}
              </div>
              <button
                className="btn btn-full btn-sm"
                disabled={cantAfford || busy === type}
                onClick={() => buy(type)}
              >
                {cantAfford ? `Need $${fmt(st.c)}` : busy === type ? 'Buying...' : `Buy ($${fmt(st.c)})`}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
