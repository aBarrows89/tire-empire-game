import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { SUPPLIERS } from '@shared/constants/suppliers.js';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';
import { postAction } from '../../api/client.js';

export default function SupplierPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);
  const [orderTire, setOrderTire] = useState('allSeason');
  const [orderQty, setOrderQty] = useState(20);

  const unlock = async (index) => {
    setBusy(`u${index}`);
    await postAction('buySupplier', { index });
    refreshState();
    setBusy(null);
  };

  const order = async (supplierIndex) => {
    setBusy(`o${supplierIndex}`);
    await postAction('orderTires', { tire: orderTire, qty: orderQty, supplierIndex });
    refreshState();
    setBusy(null);
  };

  const newTireTypes = Object.entries(TIRES).filter(([, t]) => !t.used);
  const freeSpace = getCap(g) - getInv(g);

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

        return (
          <div key={index} className="card">
            <div className="row-between mb-4">
              <div>
                <span style={{ marginRight: 6 }}>{sup.ic}</span>
                <span className="font-bold">{sup.n}</span>
              </div>
              {unlocked && <span className="text-green text-xs font-bold">UNLOCKED</span>}
            </div>
            <div className="text-xs text-dim mb-4">
              Min order: {sup.min} · Discount: {(sup.disc * 100).toFixed(0)}%
              {sup.rr > 0 ? ` · Rep ${sup.rr}+` : ''}
              {sup.desc ? ` · ${sup.desc}` : ''}
            </div>

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
    </>
  );
}
