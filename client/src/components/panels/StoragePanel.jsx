import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { STORAGE } from '@shared/constants/storage.js';
import { fmt } from '@shared/helpers/format.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';
import { postAction } from '../../api/client.js';

export default function StoragePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);

  const buy = async (type) => {
    setBusy(type);
    await postAction('buyStorage', { type });
    refreshState();
    setBusy(null);
  };

  const inv = getInv(g);
  const cap = getCap(g);

  return (
    <>
      <div className="card">
        <div className="card-title">Storage ({inv}/{cap} tires)</div>
        <div className="progress-bar mb-4">
          <div className="progress-fill" style={{ width: `${cap > 0 ? (inv / cap) * 100 : 0}%` }} />
        </div>
        <div className="text-sm text-dim">Current storage:</div>
        {g.storage.map((s, i) => (
          <div key={i} className="row-between text-sm mt-8">
            <span>{STORAGE[s.type]?.ic} {STORAGE[s.type]?.n}</span>
            <span className="text-accent">{STORAGE[s.type]?.cap} cap</span>
          </div>
        ))}
      </div>

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
