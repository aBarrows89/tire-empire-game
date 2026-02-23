import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { fmt } from '@shared/helpers/format.js';
import { getSeason } from '@shared/helpers/season.js';
import { SC } from '@shared/constants/seasons.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';
import { postAction } from '../api/client.js';

export default function Header() {
  const { state, refreshState } = useGame();
  const g = state.game;
  if (!g) return null;

  const season = getSeason(g.week);
  const inv = getInv(g);
  const cap = getCap(g);

  const togglePause = async () => {
    await postAction('pause');
    refreshState();
  };

  return (
    <div className="header">
      <div className="stat">
        <span className="stat-label">$</span>
        <span className="stat-val">{fmt(g.cash)}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Rep</span>
        <span className="stat-val">{g.reputation.toFixed(1)}</span>
      </div>
      <div className="stat">
        <span className="stat-label">Wk</span>
        <span className="stat-val">{g.week}</span>
      </div>
      <div
        className="season-badge"
        style={{ background: SC[season] }}
      >
        {season}
      </div>
      <div className="stat">
        <span className="stat-label">Inv</span>
        <span className="stat-val">{inv}/{cap}</span>
      </div>
      <button
        className="btn btn-sm btn-outline"
        onClick={togglePause}
        style={{ marginLeft: 'auto' }}
      >
        {g.paused ? '▶ Play' : '⏸ Pause'}
      </button>
    </div>
  );
}
