import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { SUPPLIERS } from '@shared/constants/suppliers.js';
import { TIRES } from '@shared/constants/tires.js';
import { SUPPLIER_REL_TIERS, getSupplierRelTier } from '@shared/constants/supplierRelations.js';
import { fmt } from '@shared/helpers/format.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';
import { FACTORY } from '@shared/constants/factory.js';
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
  const [autoTire, setAutoTire] = useState({});
  const [autoQty, setAutoQty] = useState({});
  const [autoThreshold, setAutoThreshold] = useState({});
  const [importMsg, setImportMsg] = useState(null);

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

  const newTireTypes = Object.entries(TIRES).filter(([, t]) => !t.used && (!t.premium || g.isPremium));
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

      {/* Your Factory */}
      {g.hasFactory && g.factory && (
        <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
          <div className="card-title">Your Factory</div>
          <div className="text-xs text-dim mb-4">
            Branded tires produced here appear in your warehouse inventory.
          </div>
          <div className="row-between text-sm mb-4">
            <span className="text-dim">Production Lines</span>
            <span className="font-bold">{g.factory.lines || 1}</span>
          </div>
          <div className="row-between text-sm mb-4">
            <span className="text-dim">Daily Output</span>
            <span className="font-bold">{g.factory.dailyOutput || 0} tires/day</span>
          </div>
          {g.factory.currentTire && TIRES[g.factory.currentTire] && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Producing</span>
              <span className="font-bold">{TIRES[g.factory.currentTire].n}</span>
            </div>
          )}
          {(() => {
            const brandedInStock = Object.entries(g.warehouseInventory || {})
              .filter(([k, qty]) => qty > 0 && k.startsWith('branded_'))
              .map(([k, qty]) => ({ key: k, name: TIRES[k]?.n || k, qty }));
            if (brandedInStock.length === 0) return null;
            return (
              <>
                <div className="text-xs text-dim mb-4" style={{ marginTop: 4 }}>Branded tires in stock:</div>
                {brandedInStock.map(t => (
                  <div key={t.key} className="row-between text-xs mb-4">
                    <span>{t.name}</span>
                    <span className="font-bold">{t.qty}</span>
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      )}

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
              <>
                <div className="col gap-8">
                  <select
                    value={orderTire}
                    onChange={(e) => setOrderTire(e.target.value)}
                    className="input"
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
                      className="input"
                      style={{ flex: 1 }}
                      value={orderQty}
                      onChange={(e) => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))}
                      onFocus={e => e.target.select()}
                      min={1}
                    />
                    <button
                      className="btn btn-sm btn-green"
                      disabled={orderQty < sup.min || busy === `o${index}`}
                      onClick={() => order(index)}
                    >
                      {orderQty < sup.min ? `Min ${sup.min}` : 'Order'}
                    </button>
                  </div>
                  {(() => {
                    const ot = TIRES[orderTire];
                    if (!ot) return null;
                    const mktMult = (g._supplierPricing || {})[orderTire] || 1.0;
                    // Check for active contract
                    const contract = (g.supplierContracts || []).find(c => c.supplierIndex === index && c.tire === orderTire && c.expiresDay > (g.day || 0));
                    const effectiveMult = contract ? contract.lockedMult : mktMult;
                    const perTire = Math.round(ot.bMin * effectiveMult * (1 - sup.disc) * 100) / 100;
                    const relDisc = currentTier.discBonus || 0;
                    const effectivePerTire = Math.round(perTire * (1 - relDisc) * 100) / 100;
                    const total = Math.round(effectivePerTire * orderQty);
                    const mktPctStr = Math.round(mktMult * 100);
                    return (
                      <div className="text-xs text-dim" style={{ marginTop: 4 }}>
                        <span style={{ color: mktMult > 1.02 ? 'var(--red)' : mktMult < 0.98 ? 'var(--green)' : 'var(--text-dim)' }}>
                          Market: {mktPctStr}%
                        </span>
                        {contract && <span className="text-green" style={{ marginLeft: 6 }}>CONTRACT {Math.round(contract.lockedMult * 100)}%</span>}
                        {' '}{'\u00B7'}{' '}
                        ${effectivePerTire}/tire {relDisc > 0 ? `(+${(relDisc*100).toFixed(0)}% loyalty)` : ''} = <span className="font-bold">${fmt(total)} total</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Contract Section */}
                {currentTier.level >= 3 && (
                  <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                    <div className="text-xs font-bold mb-4">{'\u{1F4DD}'} Pricing Contracts</div>
                    {(() => {
                      const activeContracts = (g.supplierContracts || []).filter(c => c.supplierIndex === index && c.expiresDay > (g.day || 0));
                      return (
                        <>
                          {activeContracts.length > 0 && activeContracts.map(c => (
                            <div key={c.id} className="row-between text-xs mb-4" style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                              <span>{c.tireName} @ {Math.round(c.lockedMult * 100)}%</span>
                              <span className="text-dim">{c.expiresDay - (g.day || 0)} days left</span>
                            </div>
                          ))}
                          <div className="text-xs text-dim mb-4">Lock in current prices for 90 days on any tire.</div>
                          <button
                            className="btn btn-sm btn-outline"
                            disabled={busy === `sc${index}`}
                            onClick={async () => {
                              setBusy(`sc${index}`);
                              await postAction('signSupplierContract', { supplierIndex: index, tire: orderTire });
                              refreshState();
                              setBusy(null);
                            }}
                          >
                            Sign Contract for {TIRES[orderTire]?.n || orderTire}
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Auto-Order Section */}
                <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  <div className="text-xs font-bold mb-4">Auto-Order</div>
                  {!g.hasAutoRestock && !g.isPremium ? (
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                      <div className="text-xs text-dim mb-4">Auto-restock is locked. Unlock to automate supplier orders.</div>
                      <button
                        className="btn btn-sm btn-full"
                        style={{ background: 'linear-gradient(135deg, #ffd54f, #ff8f00)', color: '#1a1a2e', fontWeight: 700 }}
                        disabled={busy === 'unlockAutoRestock'}
                        onClick={async () => {
                          setBusy('unlockAutoRestock');
                          await postAction('activateAutoRestock', {});
                          refreshState();
                          setBusy(null);
                        }}
                      >
                        Unlock Auto-Restock ($0.99)
                      </button>
                      {g.isPremium && <div className="text-xs text-green mt-4">PRO members get this free!</div>}
                    </div>
                  ) : (
                  <>
                  <div className="text-xs text-dim mb-4">Orders when stock drops below threshold. Uses up to 50% of cash.</div>

                  {/* Active auto-orders for this supplier */}
                  {(g.autoSuppliers || []).filter(a => a.supplierIndex === index).map(a => (
                    <div key={`${a.supplierIndex}-${a.tire}`} className="auto-order-item row-between">
                      <span className="text-xs">{TIRES[a.tire]?.n || a.tire} x{a.qty} when &lt; {a.threshold}</span>
                      <button
                        className="btn btn-sm btn-outline"
                        style={{ color: 'var(--red)' }}
                        disabled={busy === `rmAuto-${index}-${a.tire}`}
                        onClick={async () => {
                          setBusy(`rmAuto-${index}-${a.tire}`);
                          await postAction('removeAutoSupplier', { supplierIndex: index, tire: a.tire });
                          refreshState();
                          setBusy(null);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}

                  {/* Add new auto-order */}
                  <div className="col gap-8 mt-4">
                    <select
                      value={autoTire[index] || ''}
                      onChange={(e) => setAutoTire(p => ({ ...p, [index]: e.target.value }))}
                      className="input input-sm"
                    >
                      <option value="">Select tire...</option>
                      {newTireTypes.map(([k, t]) => {
                        if (sup.ag && !t.ag) return null;
                        if (!sup.ag && t.ag) return null;
                        return <option key={k} value={k}>{t.n}</option>;
                      })}
                    </select>
                    <div className="row gap-8">
                      <input
                        type="number"
                        className="input input-sm"
                        style={{ flex: 1 }}
                        placeholder={`Qty (min ${sup.min})`}
                        value={autoQty[index] || ''}
                        onChange={(e) => setAutoQty(p => ({ ...p, [index]: Math.max(1, Number(e.target.value) || 0) }))}
                        min={sup.min}
                      />
                      <input
                        type="number"
                        className="input input-sm"
                        style={{ flex: 1 }}
                        placeholder="Threshold"
                        value={autoThreshold[index] || ''}
                        onChange={(e) => setAutoThreshold(p => ({ ...p, [index]: Math.max(1, Number(e.target.value) || 0) }))}
                        min={1}
                      />
                      <button
                        className="btn btn-sm btn-green"
                        disabled={!autoTire[index] || !(autoQty[index] >= sup.min) || !autoThreshold[index] || busy === `addAuto-${index}`}
                        onClick={async () => {
                          setBusy(`addAuto-${index}`);
                          await postAction('addAutoSupplier', {
                            supplierIndex: index,
                            tire: autoTire[index],
                            qty: autoQty[index],
                            threshold: autoThreshold[index],
                          });
                          refreshState();
                          setBusy(null);
                        }}
                      >
                        Set
                      </button>
                    </div>
                  </div>
                  </>
                  )}
                </div>
              </>
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
            onFocus={e => e.target.select()}
          />
          <button
            className="btn btn-sm btn-green"
            disabled={importQty <= 0 || busy === 'import'}
            onClick={async () => {
              setBusy('import');
              setImportMsg(null);
              const res = await postAction('importOrder', { tire: importTire, qty: importQty });
              if (res.ok) {
                setImportMsg(`Order placed! ${importQty} ${TIRES[importTire]?.n || importTire} arriving in 5-7 days`);
              }
              refreshState();
              setBusy(null);
            }}
          >
            {busy === 'import' ? '...' : 'Import'}
          </button>
        </div>
        <div className="text-xs text-dim">Lead time: 5-7 days</div>
        {importMsg && (
          <div className="text-xs text-green font-bold" style={{ marginTop: 6 }}>
            {importMsg}
          </div>
        )}
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
            onFocus={e => e.target.select()}
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
