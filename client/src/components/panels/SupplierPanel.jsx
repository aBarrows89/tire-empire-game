import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { SUPPLIERS } from '@shared/constants/suppliers.js';
import { TIRES } from '@shared/constants/tires.js';
import { SUPPLIER_REL_TIERS, getSupplierRelTier } from '@shared/constants/supplierRelations.js';
import { fmt } from '@shared/helpers/format.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';
import { postAction } from '../../api/client.js';

export default function SupplierPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);
  const [orderTire, setOrderTire] = useState('allSeason');
  const [orderQty, setOrderQty] = useState(20);
  const [importTire, setImportTire] = useState('allSeason');
  const [importQty, setImportQty] = useState(10);
  const [exportTire, setExportTire] = useState('');
  const [exportQty, setExportQty] = useState(1);

  const unlock = async (index) => {
    setBusy(`u${index}`);
    await postAction('buySupplier', { index });
    refreshState();
    setBusy(null);
  };

  const order = async (supplierIndex) => {
    setBusy(`o${supplierIndex}`);
    const sup = SUPPLIERS[supplierIndex];
    // Validate orderTire is valid for this supplier
    const validTires = Object.entries(TIRES).filter(([, t]) => {
      if (t.used) return false;
      if (sup.ag && !t.ag) return false;
      if (!sup.ag && t.ag) return false;
      return true;
    }).map(([k]) => k);
    const tire = validTires.includes(orderTire) ? orderTire : validTires[0];
    await postAction('orderTires', { tire, qty: orderQty, supplierIndex });
    refreshState();
    setBusy(null);
  };

  const newTireTypes = Object.entries(TIRES).filter(([, t]) => !t.used);
  const freeSpace = getCap(g) - getInv(g);

  const tierLabels = { 0: 'New', 1: 'Regular', 2: 'Preferred', 3: 'Key Account', 4: 'Strategic', 5: 'Elite' };
  const tierColors = { 0: 'var(--text-dim)', 1: '#c0c0c0', 2: 'var(--gold)', 3: '#e5e4e2', 4: 'var(--accent)', 5: 'var(--green)' };

  return (
    <>
      <div className="card">
        <div className="card-title">Suppliers</div>
        <div className="text-sm text-dim">
          Unlock supplier accounts to order NEW tires. Free space: {freeSpace}
        </div>
      </div>

      {SUPPLIERS.map((sup, index) => {
        const unlocked = (g.unlockedSuppliers || []).includes(index);
        const locked = sup.rr > 0 && g.reputation < sup.rr;
        const cantAfford = g.cash < sup.c;
        const rel = (g.supplierRelationships || {})[sup.key || index] || {};
        const totalPurchased = rel.totalPurchased || 0;
        const currentTier = getSupplierRelTier(totalPurchased);
        const nextTierIdx = SUPPLIER_REL_TIERS.findIndex(t => t.level === currentTier.level) + 1;
        const nextTier = nextTierIdx < SUPPLIER_REL_TIERS.length ? SUPPLIER_REL_TIERS[nextTierIdx] : null;
        const progressPct = nextTier
          ? Math.min(100, Math.round(((totalPurchased - currentTier.min) / (nextTier.min - currentTier.min)) * 100))
          : 100;

        return (
          <div key={index} className="card">
            <div className="row-between mb-4">
              <div>
                <span style={{ marginRight: 6 }}>{sup.ic}</span>
                <span className="font-bold">{sup.n}</span>
              </div>
              <div className="row gap-8">
                {unlocked && (
                  <span
                    className="text-xs font-bold"
                    style={{ color: tierColors[currentTier.level] || 'var(--text-dim)' }}
                  >
                    {currentTier.label}
                  </span>
                )}
                {unlocked && <span className="text-green text-xs font-bold">UNLOCKED</span>}
              </div>
            </div>
            <div className="text-xs text-dim mb-4">
              Min order: {sup.min} {'\u00B7'} Discount: {(sup.disc * 100).toFixed(0)}%
              {sup.rr > 0 ? ` \u00B7 Rep ${sup.rr}+` : ''}
              {sup.desc ? ` \u00B7 ${sup.desc}` : ''}
            </div>

            {/* Loyalty Progress */}
            {unlocked && totalPurchased > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div className="row-between text-xs mb-4">
                  <span className="text-dim">Purchased: {totalPurchased} tires</span>
                  {currentTier.discBonus > 0 && (
                    <span className="text-green">+{(currentTier.discBonus * 100).toFixed(0)}% bonus disc</span>
                  )}
                </div>
                {nextTier && (
                  <>
                    <div className="text-xs text-dim mb-4">
                      Next: {nextTier.label} at {nextTier.min} tires ({nextTier.min - totalPurchased} more)
                    </div>
                    <div className="loyalty-progress-bar">
                      <div className="loyalty-progress-fill" style={{ width: `${progressPct}%` }} />
                    </div>
                  </>
                )}
                {!nextTier && (
                  <div className="text-xs text-green font-bold">MAX TIER</div>
                )}
              </div>
            )}

            {!unlocked ? (
              <button
                className="btn btn-full btn-sm"
                disabled={locked || cantAfford || busy === `u${index}`}
                onClick={() => unlock(index)}
              >
                {locked ? `Need Rep ${sup.rr}` : cantAfford ? `Need $${fmt(sup.c)}` : `Unlock ($${fmt(sup.c)})`}
              </button>
            ) : (
              <div className="col gap-8">
                <select
                  value={orderTire}
                  onChange={(e) => setOrderTire(e.target.value)}
                  style={{
                    padding: 8, borderRadius: 6, background: 'var(--surface)',
                    color: 'var(--text)', border: '1px solid var(--border)', minHeight: 40
                  }}
                >
                  {newTireTypes.map(([k, t]) => {
                    if (sup.ag && !t.ag) return null;
                    if (!sup.ag && t.ag) return null;
                    return <option key={k} value={k}>{t.n} (${t.bMin}-${t.bMax})</option>;
                  })}
                </select>
                <div className="row gap-8">
                  <input
                    type="number"
                    value={orderQty}
                    onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    style={{
                      flex: 1, padding: 8, borderRadius: 6, background: 'var(--surface)',
                      color: 'var(--text)', border: '1px solid var(--border)', minHeight: 40
                    }}
                  />
                  <button
                    className="btn btn-sm btn-green"
                    disabled={orderQty < sup.min || busy === `o${index}`}
                    onClick={() => order(index)}
                  >
                    {orderQty < sup.min ? `Min ${sup.min}` : 'Order'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Import from Manufacturer */}
      <div className="card">
        <div className="card-title">Import from Manufacturer</div>
        <div className="text-xs text-dim mb-4">
          Order tires directly from overseas manufacturers. Cheaper but longer lead time (5-7 days).
        </div>
        <div className="mb-4">
          <select
            className="autoprice-select"
            style={{ width: '100%' }}
            value={importTire}
            onChange={e => setImportTire(e.target.value)}
          >
            {newTireTypes.map(([k, t]) => (
              <option key={k} value={k}>{t.n}</option>
            ))}
          </select>
        </div>
        <div className="row gap-8 mb-4">
          <input
            type="number"
            className="autoprice-offset"
            style={{ flex: 1, width: 'auto' }}
            min={1}
            value={importQty}
            onChange={e => setImportQty(Math.max(1, Number(e.target.value)))}
          />
          <button
            className="btn btn-sm btn-green"
            disabled={importQty <= 0 || busy === 'import'}
            onClick={async () => {
              setBusy('import');
              await postAction('importOrder', { tire: importTire, qty: importQty });
              refreshState();
              setBusy(null);
            }}
          >
            {busy === 'import' ? '...' : 'Import'}
          </button>
        </div>
        <div className="text-xs text-dim">Lead time: 5-7 days</div>
      </div>

      {/* Pending Imports */}
      {(g.pendingImports || []).length > 0 && (
        <div className="card">
          <div className="card-title">Pending Imports</div>
          {g.pendingImports.map((imp, i) => {
            const day = g.day || 1;
            const daysLeft = Math.max(0, (imp.arrivalDay || 0) - day);
            return (
              <div key={i} className="queue-item">
                <div>
                  <div className="text-sm font-bold">{TIRES[imp.tire]?.n || imp.tire || TIRES[imp.type]?.n || imp.type} x{imp.qty}</div>
                  <div className="text-xs text-dim">
                    {daysLeft > 0 ? `Arrives in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : 'Arriving today!'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Export Excess */}
      <div className="card">
        <div className="card-title">Export Excess</div>
        <div className="text-xs text-dim mb-4">
          Sell excess inventory at 85% of default price. Ships immediately.
        </div>
        <div className="row gap-8 mb-4">
          <select
            className="autoprice-select"
            style={{ flex: 1 }}
            value={exportTire}
            onChange={e => setExportTire(e.target.value)}
          >
            <option value="">Select tire type...</option>
            {Object.entries(g.warehouseInventory || {}).filter(([, qty]) => qty > 0).map(([k, qty]) => (
              <option key={k} value={k}>{TIRES[k]?.n || k} ({qty})</option>
            ))}
          </select>
          <input
            type="number"
            className="autoprice-offset"
            style={{ width: 64 }}
            min={1}
            max={(g.warehouseInventory || {})[exportTire] || 1}
            value={exportQty}
            onChange={e => setExportQty(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <button
          className="btn btn-full btn-sm btn-green"
          disabled={!exportTire || exportQty <= 0 || busy === 'export'}
          onClick={async () => {
            setBusy('export');
            await postAction('exportTires', { tire: exportTire, qty: exportQty });
            refreshState();
            setBusy(null);
          }}
        >
          {busy === 'export' ? 'Exporting...' : 'Export'}
        </button>
      </div>
    </>
  );
}
