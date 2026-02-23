import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { SOURCES } from '@shared/constants/sources.js';
import { fmt } from '@shared/helpers/format.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';
import { postAction } from '../../api/client.js';

export default function SourcePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);

  const inv = getInv(g);
  const cap = getCap(g);
  const freeSpace = cap - inv;

  const buy = async (sourceId) => {
    setBusy(sourceId);
    const res = await postAction('buySource', { sourceId });
    if (res.ok) refreshState();
    setBusy(null);
  };

  // Only show sources the player has unlocked or can see
  const visibleSources = Object.entries(SOURCES).filter(([, src]) => {
    if (!src.rr) return true; // no rep requirement = always visible
    // Show if close to unlocking (within 10 rep) or already unlocked
    return g.reputation >= src.rr - 10;
  });

  return (
    <>
      <div className="card">
        <div className="card-title">Source Used Tires</div>
        <div className="text-sm text-dim mb-4">
          Hit up local spots for used tires. You buy a batch, get a random mix of
          quality grades, then sell them from your van.
        </div>
        <div className="row-between text-sm">
          <span className="text-dim">Cash</span>
          <span className="font-bold text-green">${fmt(g.cash)}</span>
        </div>
        <div className="row-between text-sm mt-8">
          <span className="text-dim">Free Space</span>
          <span className={`font-bold ${freeSpace <= 3 ? 'text-red' : ''}`}>{freeSpace} / {cap}</span>
        </div>
      </div>

      {freeSpace <= 0 && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <div className="text-sm text-red font-bold">Storage Full!</div>
          <div className="text-xs text-dim">
            Sell some tires or upgrade your storage before sourcing more.
          </div>
        </div>
      )}

      {visibleSources.map(([id, src]) => {
        const locked = src.rr && g.reputation < src.rr;
        const cantAfford = g.cash < src.c;
        const noSpace = freeSpace <= 0;

        return (
          <div key={id} className="card" style={locked ? { opacity: 0.6 } : {}}>
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
              {src.rr ? ` \u00B7 Rep ${src.rr}+ required` : ''}
            </div>
            <button
              className="btn btn-full btn-green btn-sm"
              disabled={locked || cantAfford || noSpace || busy === id}
              onClick={() => buy(id)}
            >
              {locked
                ? `Need Rep ${src.rr} (yours: ${g.reputation.toFixed(1)})`
                : noSpace
                  ? 'Storage Full'
                  : cantAfford
                    ? 'Not enough cash'
                    : busy === id
                      ? 'Sourcing...'
                      : `Source ($${src.c})`}
            </button>
          </div>
        );
      })}

      {g.locations.length === 0 && (
        <div className="card" style={{ borderColor: 'var(--accent)', borderStyle: 'dashed' }}>
          <div className="text-sm" style={{ lineHeight: 1.5 }}>
            <span className="font-bold text-accent">How selling works:</span> Your tires sell
            automatically each game week from your van. Demand depends on your prices, reputation,
            and the season. Check the Dashboard to see weekly sales.
          </div>
        </div>
      )}
    </>
  );
}
