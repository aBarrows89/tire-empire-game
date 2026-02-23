import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { SOURCES } from '@shared/constants/sources.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction } from '../../api/client.js';

export default function SourcePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);

  const buy = async (sourceId) => {
    setBusy(sourceId);
    const res = await postAction('buySource', { sourceId });
    if (res.ok) refreshState();
    setBusy(null);
  };

  return (
    <>
      <div className="card">
        <div className="card-title">Source Used Tires</div>
        <div className="text-sm text-dim mb-4">
          Buy used tires to flip for profit. Cash: ${fmt(g.cash)}
        </div>
      </div>

      {Object.entries(SOURCES).map(([id, src]) => {
        const locked = src.rr && g.reputation < src.rr;
        const cantAfford = g.cash < src.c;

        return (
          <div key={id} className="card">
            <div className="row-between mb-4">
              <div>
                <span style={{ marginRight: 6 }}>{src.ic}</span>
                <span className="font-bold">{src.n}</span>
              </div>
              <span className="text-accent font-bold">${fmt(src.c)}</span>
            </div>
            <div className="text-xs text-dim mb-4">{src.d}</div>
            <div className="text-xs text-dim mb-4">
              Yield: {src.min}-{src.max} tires
              {src.rr ? ` · Rep ${src.rr}+ required` : ''}
            </div>
            <button
              className="btn btn-full btn-green btn-sm"
              disabled={locked || cantAfford || busy === id}
              onClick={() => buy(id)}
            >
              {locked ? `Need Rep ${src.rr}` : cantAfford ? 'Not enough cash' : busy === id ? 'Sourcing...' : `Source ($${src.c})`}
            </button>
          </div>
        );
      })}
    </>
  );
}
