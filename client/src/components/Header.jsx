import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { fmt } from '@shared/helpers/format.js';
import { getCalendar } from '@shared/helpers/calendar.js';
import { SC } from '@shared/constants/seasons.js';
import { TireCoin, ProgressRing } from './ui/ui.jsx';

export default function Header() {
  const { state } = useGame();
  const g = state.game;
  if (!g) return null;

  const playerDay = g.day || g.week || 1;
  const worldDay = (g.startDay || 1) + playerDay - 1;
  const cal = getCalendar(worldDay);

  return (
    <div className="header">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {g.isPremium && <span style={{ fontSize: 12 }}>{'\u2B50'}</span>}
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {g.companyName || 'TIRE EMPIRE'}
          </span>
          <span
            style={{ background: state.wsConnected ? 'var(--green)' : 'var(--red)', width: 6, height: 6, borderRadius: '50%', flexShrink: 0 }}
          />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>Day {playerDay}</span>
          <span style={{ background: SC[cal.season], padding: '1px 6px', borderRadius: 6, fontSize: 9, fontWeight: 700, color: '#111' }}>
            {cal.season}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: (g.cash || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
            ${fmt(g.cash)}
          </div>
          <div style={{ fontSize: 8, color: 'var(--text-dim)', letterSpacing: 0.5 }}>CASH</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <TireCoin size={20}/>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>{g.tireCoins || 0}</span>
        </div>

        <ProgressRing value={g.reputation || 0} max={100} size={34} stroke={3} color="var(--accent)">
          <span style={{ fontSize: 9 }}>{Math.floor(g.reputation || 0)}</span>
        </ProgressRing>
      </div>
    </div>
  );
}
