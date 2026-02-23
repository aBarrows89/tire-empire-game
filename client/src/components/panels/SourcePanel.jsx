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

  const setAutoSource = async (sourceId) => {
    setBusy('auto');
    await postAction('setAutoSource', { sourceId: sourceId || null });
    refreshState();
    setBusy(null);
  };

  // Sources the player can auto-source from (unlocked only)
  const unlockedSources = Object.entries(SOURCES).filter(([, src]) => {
    return !src.rr || g.reputation >= src.rr;
  });

  // Only show sources the player has unlocked or can see
  const visibleSources = Object.entries(SOURCES).filter(([, src]) => {
    if (!src.rr) return true;
    return g.reputation >= src.rr - 10;
  });

  return (
    <>
      {/* Auto-Source Card — prominent at top */}
      <div className="card" style={{ borderColor: g.autoSource ? 'var(--green)' : 'var(--border)' }}>
        <div className="row-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}>Auto Source</div>
          {g.autoSource && (
            <span className="text-xs font-bold text-green">ACTIVE</span>
          )}
        </div>
        <div className="text-xs text-dim mb-4">
          Automatically buy tires every week so you stay stocked even while offline.
        </div>
        <select
          className="autoprice-select"
          style={{ width: '100%', marginBottom: 4 }}
          value={g.autoSource || ''}
          onChange={(e) => setAutoSource(e.target.value)}
          disabled={busy === 'auto'}
        >
          <option value="">Off — Manual only</option>
          {unlockedSources.map(([id, src]) => (
            <option key={id} value={id}>
              {src.ic} {src.n} — ${src.c}/wk ({src.min}-{src.max} tires)
            </option>
          ))}
        </select>
        {g.autoSource && SOURCES[g.autoSource] && (
          <div className="text-xs text-green" style={{ marginTop: 4 }}>
            Spending ${SOURCES[g.autoSource].c}/week on {SOURCES[g.autoSource].n}. Stops if you run out of cash or space.
          </div>
        )}
      </div>

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
