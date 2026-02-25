import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { fmt } from '@shared/helpers/format.js';
import { getCalendar } from '@shared/helpers/calendar.js';
import { SC } from '@shared/constants/seasons.js';
import { getCap, getInv } from '@shared/helpers/inventory.js';
import TrendArrow from './TrendArrow.jsx';

export default function Header() {
  const { state } = useGame();
  const g = state.game;
  if (!g) return null;

  const day = g.day || g.week || 1;
  const cal = getCalendar(day);
  const inv = getInv(g);
  const cap = getCap(g);

  return (
    <div className="header">
      <div className="stat">
        <span className="stat-label">$</span>
        <span className="stat-val" style={g.cash < 0 ? { color: 'var(--red)' } : undefined}>{fmt(g.cash)}</span>
        <TrendArrow current={g.cash} previous={g.prevCash} />
      </div>
      <div className="stat">
        <span className="stat-label">Rep</span>
        <span className="stat-val">{g.reputation.toFixed(1)}</span>
        <TrendArrow current={g.reputation} previous={g.prevRep} />
      </div>
      <div className="stat">
        <span className="stat-val" style={{ fontSize: 10 }}>
          {cal.dayName.slice(0, 3)} {cal.monthName.slice(0, 3)} {cal.dayOfMonth}
        </span>
      </div>
      <div className="stat">
        <span className="stat-val" style={{ fontSize: 10 }}>Y{cal.year}</span>
      </div>
      <div
        className="season-badge"
        style={{ background: SC[cal.season] }}
      >
        {cal.season}
      </div>
      <div className="stat">
        <span className="stat-label">Inv</span>
        <span className="stat-val">{inv}/{cap}</span>
      </div>
      {g.companyName && (
        <div className="stat" style={{ marginLeft: 'auto' }}>
          <span className={`stat-label${(g.cosmetics || []).includes('gold_name') ? ' gold-name' : ''}`} style={{ fontSize: 10 }}>{g.companyName}</span>
        </div>
      )}
    </div>
  );
}
