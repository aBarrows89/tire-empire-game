import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { STORAGE } from '@shared/constants/storage.js';
import { TIRES } from '@shared/constants/tires.js';
import { CITIES } from '@shared/constants/cities.js';
import { fmt } from '@shared/helpers/format.js';
import { getCap, getInv, getLocInv, getLocCap, getStorageCap } from '@shared/helpers/inventory.js';
import { postAction } from '../../api/client.js';
import { hapticsMedium } from '../../api/haptics.js';

export default function StoragePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);
  const [txFrom, setTxFrom] = useState('warehouse');
  const [txTo, setTxTo] = useState('');
  const [txTire, setTxTire] = useState('');
  const [txQty, setTxQty] = useState(1);
  const [retreadGrade, setRetreadGrade] = useState('junk');
  const [retreadQty, setRetreadQty] = useState(5);

  const buy = async (type) => {
    setBusy(type);
    await postAction('buyStorage', { type });
    hapticsMedium();
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
        {(() => {
          const totalMonthlyRent = g.storage.reduce((a, s) => a + (STORAGE[s.type]?.mo || 0), 0);
          if (totalMonthlyRent <= 0) return null;
          const discounted = g.isPremium ? totalMonthlyRent * 0.5 : totalMonthlyRent;
          return (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Monthly Rent</span>
              <span>
                {g.isPremium ? (
                  <>
                    <span style={{ textDecoration: 'line-through', color: 'var(--text-dim)', marginRight: 6 }}>${fmt(totalMonthlyRent)}</span>
                    <span className="font-bold text-green">${fmt(discounted)}</span>
                    <span className="text-xs text-green" style={{ marginLeft: 4 }}>PRO 50% off</span>
                  </>
                ) : (
                  <span className="font-bold">${fmt(totalMonthlyRent)}/mo</span>
                )}
              </span>
            </div>
          );
        })()}
        <div className="text-sm text-dim">Storage units:</div>
        {g.storage.map((s, i) => {
          const st = STORAGE[s.type];
          const sellValue = Math.round((st?.c || 0) * 0.5);
          const canSell = s.type !== 'van' && st;
          const displayCap = s.type === 'van' && (g.cosmetics || []).includes('premium_van') ? 80 : st?.cap;
          return (
            <div key={i} className="row-between text-sm mt-8">
              <span>{st?.ic} {st?.n}{s.type === 'van' && (g.cosmetics || []).includes('premium_van') && <span className="premium-van-badge">PREMIUM</span>}</span>
              <div className="row gap-8">
                <span className="text-accent">{displayCap} cap</span>
                {canSell && (
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ color: 'var(--red)' }}
                    disabled={busy === `sell-${s.id}`}
                    onClick={async () => {
                      if (!window.confirm(`Sell ${st.n} for $${fmt(sellValue)} (50% of purchase price)?\n\nMake sure you have enough remaining capacity for your inventory.`)) return;
                      setBusy(`sell-${s.id}`);
                      const result = await postAction('sellStorage', { storageId: s.id });
                      await refreshState();
                      setBusy(null);
                      if (result?.error) alert(result.error);
                    }}
                  >
                    {busy === `sell-${s.id}` ? '...' : `Sell $${fmt(sellValue)}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
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
              onFocus={e => e.target.select()}
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

      {/* Tire Retreading */}
      <div className="card">
        <div className="card-title">Tire Retreading</div>
        <div className="text-xs text-dim mb-4">
          Upgrade tire quality by retreading. Junk becomes Poor, Poor becomes Good. Takes 3 days.
        </div>
        <div className="mb-4">
          <div className="text-xs text-dim mb-4">Grade to retread</div>
          <select
            className="autoprice-select"
            style={{ width: '100%' }}
            value={retreadGrade}
            onChange={e => setRetreadGrade(e.target.value)}
          >
            <option value="junk">Junk &rarr; Poor ({g.warehouseInventory?.used_junk || 0} available)</option>
            <option value="poor">Poor &rarr; Good ({g.warehouseInventory?.used_poor || 0} available)</option>
          </select>
        </div>
        <div className="mb-4">
          <div className="text-xs text-dim mb-4">Quantity</div>
          <input
            type="number"
            className="autoprice-offset"
            style={{ width: '100%' }}
            min={1}
            max={retreadGrade === 'junk' ? (g.warehouseInventory?.used_junk || 0) : (g.warehouseInventory?.used_poor || 0)}
            value={retreadQty}
            onChange={e => setRetreadQty(Math.max(1, Number(e.target.value)))}
            onFocus={e => e.target.select()}
          />
        </div>
        <div className="text-xs text-dim mb-4">
          Cost: ~${retreadQty * (retreadGrade === 'junk' ? 5 : 10)} &middot; Success rate: ~{retreadGrade === 'junk' ? 70 : 85}%
        </div>
        <button
          className="btn btn-full btn-sm btn-green"
          disabled={retreadQty <= 0 || busy === 'retread'}
          onClick={async () => {
            const tireKey = retreadGrade === 'junk' ? 'used_junk' : 'used_poor';
            const available = g.warehouseInventory?.[tireKey] || 0;
            const costEach = retreadGrade === 'junk' ? 5 : 10;
            const totalCost = retreadQty * costEach;
            const gradeLabel = retreadGrade === 'junk' ? 'Junk → Poor' : 'Poor → Good';
            if (!window.confirm(
              `Retread ${retreadQty} ${gradeLabel} tires?\n\nCost: $${totalCost}\nAvailable: ${available}\nTime: 3 days\n\nTires will be removed from inventory during retreading.`
            )) return;
            setBusy('retread');
            const result = await postAction('retreadTires', { tire: tireKey, qty: retreadQty });
            await refreshState();
            setBusy(null);
            if (result?.error) {
              alert(`Retread failed: ${result.error}`);
            } else {
              alert(`Retreading started! ${retreadQty} tires queued. They'll be ready in 3 days.`);
            }
          }}
        >
          {busy === 'retread' ? 'Processing...' : 'Start Retread'}
        </button>
      </div>

      {/* Active Retread Queue */}
      {(g.retreadQueue || []).length > 0 && (
        <div className="card">
          <div className="card-title">Retread Queue</div>
          {g.retreadQueue.map((job, i) => {
            const day = g.day || 1;
            const daysLeft = Math.max(0, (job.completionDay || job.doneDay || 0) - day);
            const totalDays = 3;
            const progressPct = totalDays > 0 ? Math.min(100, ((totalDays - daysLeft) / totalDays) * 100) : 100;
            const tireName = TIRES[job.tire]?.n || job.tire || TIRES[job.type]?.n || job.type || 'Unknown';
            return (
              <div key={i} className="queue-item">
                <div>
                  <div className="text-sm font-bold">{tireName} x{job.qty || 1}</div>
                  <div className="text-xs text-dim">
                    {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining` : 'Complete!'}
                    {job.successRate != null && ` \u00B7 ${Math.round(job.successRate * 100)}% success`}
                  </div>
                  <div className="progress-bar" style={{ width: 80, marginTop: 4 }}>
                    <div className="progress-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
          {(() => {
            const pendingCount = (g.retreadQueue || []).filter(r => (g.day || 1) < r.completionDay).length;
            if (pendingCount === 0) return null;
            const tcCost = pendingCount * 30;
            const canAfford = (g.tireCoins || 0) >= tcCost;
            return (
              <button
                className="btn btn-full btn-sm"
                style={{ marginTop: 8, background: canAfford ? 'linear-gradient(135deg, #f0c040, #d4a020)' : undefined, color: canAfford ? '#000' : undefined }}
                disabled={!canAfford || busy === 'instantRetread'}
                onClick={async () => {
                  if (!window.confirm(`Instantly complete ${pendingCount} retread${pendingCount !== 1 ? 's' : ''} for ${tcCost} TC?`)) return;
                  setBusy('instantRetread');
                  const result = await postAction('instantRetread', {});
                  await refreshState();
                  setBusy(null);
                  if (result?.error) alert(result.error);
                }}
              >
                {busy === 'instantRetread' ? 'Completing...' : `Instant Complete (${tcCost} TC)`}
              </button>
            );
          })()}
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
                ${fmt(st.c)} upfront · {g.isPremium ? (
                  <><span style={{ textDecoration: 'line-through' }}>${fmt(st.mo)}</span> <span className="text-green">${fmt(Math.round(st.mo * 0.5))}/mo rent</span></>
                ) : (
                  <>${fmt(st.mo)}/mo rent</>
                )}
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
