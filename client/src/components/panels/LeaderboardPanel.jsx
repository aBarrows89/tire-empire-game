import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { getLeaderboard } from '../../api/client.js';
import { fmt } from '@shared/helpers/format.js';
import { UICard, ProgressRing, Tag } from '../ui/ui.jsx';

export default function LeaderboardPanel() {
  const { state } = useGame();
  const g = state.game;
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await getLeaderboard();
        const rows = Array.isArray(data) ? data : data.leaderboard || [];
        setLeaders(rows.map(r => ({
          id: r.player_id || r.playerId || r.id,
          name: r.name || r.companyName || 'Unknown',
          wealth: Number(r.wealth) || 0,
          reputation: r.reputation || 0,
          locations: r.locations || r.shopCount || 0,
          day: r.week || r.day || 0,
          isPremium: r.isPremium || false,
          ticker: r.ticker || null,
        })));
      } catch {}
    };
    fetchData();
  }, [g.day]);

  const myId = g.id;

  const rankColors = [
    'linear-gradient(135deg, #ffd54f, #ffb300)',
    'linear-gradient(135deg, #bdbdbd, #9e9e9e)',
    'linear-gradient(135deg, #c68400, #8b6914)',
  ];

  return (
    <>
      <UICard style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{'\u{1F3C6}'} Leaderboard</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Ranked by total wealth (cash + assets + inventory)</div>
      </UICard>

      <UICard>
        {leaders.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)', fontSize: 12 }}>Loading...</div>
        )}
        {leaders.map((p, i) => {
          const isYou = p.id === myId;
          const rank = i + 1;
          return (
            <div key={p.id || i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
              borderBottom: i < leaders.length - 1 ? '1px solid var(--border)' : 'none',
              background: isYou ? 'rgba(79,195,247,0.04)' : 'transparent',
              borderRadius: isYou ? 8 : 0,
              marginLeft: isYou ? -6 : 0, marginRight: isYou ? -6 : 0,
              paddingLeft: isYou ? 6 : 0, paddingRight: isYou ? 6 : 0,
            }}>
              {/* Rank */}
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 13, flexShrink: 0,
                background: rank <= 3 ? rankColors[rank - 1] : 'rgba(255,255,255,0.06)',
                color: rank <= 3 ? '#111' : 'var(--text-dim)',
              }}>{rank}</div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: isYou ? 800 : 600,
                  color: isYou ? 'var(--accent)' : 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {p.name}
                  {isYou && <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--accent)' }}>(YOU)</span>}
                  {p.isPremium && <span style={{ fontSize: 10, marginLeft: 4 }}>{'\u2B50'}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                  <span>{'\u2B50'} {(p.reputation || 0).toFixed(0)}</span>
                  <span>{'\u{1F3EA}'} {p.locations}</span>
                  <span>Day {p.day}</span>
                  {p.ticker && <span style={{ color: 'var(--green)' }}>{'\u{1F4C8}'} ${p.ticker}</span>}
                </div>
              </div>

              {/* Wealth */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>${fmt(p.wealth || 0)}</div>
                <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>wealth</div>
              </div>
            </div>
          );
        })}
      </UICard>
    </>
  );
}
