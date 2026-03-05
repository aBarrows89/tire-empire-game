import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { fmt } from '@shared/helpers/format.js';
import { getCalendar } from '@shared/helpers/calendar.js';
import { SC } from '@shared/constants/seasons.js';
import { TireCoin, ProgressRing } from './ui/ui.jsx';

// Animated countdown ring — counts down from 0→full over one tick duration
function DayCountdown({ lastTickTime, tickDuration, size = 34, stroke = 3 }) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!lastTickTime || !tickDuration) return;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastTickTime;
      const pct = Math.min(elapsed / tickDuration, 1);
      setProgress(pct);
      if (pct < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [lastTickTime, tickDuration]);

  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const secsLeft = lastTickTime ? Math.max(0, Math.ceil((tickDuration - (Date.now() - lastTickTime)) / 1000)) : null;

  // Color shifts as day approaches — green → gold → accent
  const color = progress > 0.8 ? 'var(--accent)' : progress > 0.5 ? 'var(--gold)' : 'var(--green)';

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-block', flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke}/>
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress)}
          strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
      }}>
        <span style={{ fontSize: 8, fontWeight: 700, color, lineHeight: 1 }}>
          {secsLeft !== null ? secsLeft : '—'}
        </span>
        <span style={{ fontSize: 6, color: 'var(--text-dim)', lineHeight: 1, marginTop: 1 }}>sec</span>
      </div>
    </div>
  );
}

export default function Header() {
  const { state } = useGame();
  const g = state.game;
  if (!g) return null;

  const playerDay = g.day || g.week || 1;
  const worldDay = (g.startDay || 1) + playerDay - 1;
  const cal = getCalendar(worldDay);

  const SEASON_MONTHS = { Winter: [11,0,1], Spring: [2,3,4], Summer: [5,6,7], Fall: [8,9,10] };
  const seasonMonths = SEASON_MONTHS[cal.season] || [];
  const lastSeasonMonth = Math.max(...seasonMonths);
  const daysLeftInMonth = 30 - cal.dayOfMonth;
  const monthsToSeasonEnd = lastSeasonMonth >= cal.monthIndex
    ? lastSeasonMonth - cal.monthIndex
    : (12 - cal.monthIndex) + lastSeasonMonth;
  const daysLeftInSeason = daysLeftInMonth + monthsToSeasonEnd * 30;

  const isWeekend = cal.dayOfWeek === 0 || cal.dayOfWeek === 6;

  return (
    <div className="header">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {g.isPremium && <span style={{ fontSize: 12 }}>{'⭐'}</span>}
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {g.companyName || 'TIRE EMPIRE'}
          </span>
          <span
            style={{ background: state.wsConnected ? 'var(--green)' : 'var(--red)', width: 6, height: 6, borderRadius: '50%', flexShrink: 0 }}
          />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: isWeekend ? 'var(--gold)' : 'var(--text-dim)' }}>
            {cal.dayName.slice(0,3)}
          </span>
          <span>{cal.monthName.slice(0,3)} {cal.dayOfMonth}, Y{cal.year}</span>
          <span style={{ background: SC[cal.season], padding: '1px 5px', borderRadius: 6, fontSize: 9, fontWeight: 700, color: '#111' }}>
            {cal.season} · {daysLeftInSeason}d
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

        {/* Day countdown — fills as next tick approaches */}
        <DayCountdown
          lastTickTime={state.lastTickTime}
          tickDuration={state.tickDuration || 20000}
          size={34}
          stroke={3}
        />

        <ProgressRing value={g.reputation || 0} max={100} size={34} stroke={3} color="var(--accent)">
          <span style={{ fontSize: 9 }}>{Math.floor(g.reputation || 0)}</span>
        </ProgressRing>
      </div>
    </div>
  );
}
