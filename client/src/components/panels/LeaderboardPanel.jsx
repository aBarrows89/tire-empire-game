import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { API_BASE, headers } from '../../api/client.js';
import { fmt } from '@shared/helpers/format.js';

export default function LeaderboardPanel() {
  const { state, dispatch } = useGame();
  const g = state.game;
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('allTime'); // 'allTime' or 'weekly'
  const [tournamentData, setTournamentData] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/leaderboard?limit=50`, { headers })
      .then(r => r.json())
      .then(data => setRows(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [g?.day]);

  useEffect(() => {
    if (tab === 'weekly') {
      fetch(`${API_BASE}/tournament`, { headers })
        .then(r => r.json())
        .then(data => setTournamentData(data))
        .catch(() => setTournamentData(null));
    }
  }, [tab, g?.day]);

  const viewProfile = (playerId) => {
    dispatch({ type: 'SET_VIEWING_PROFILE', payload: playerId });
  };

  const displayRows = tab === 'weekly' && tournamentData?.rankings
    ? tournamentData.rankings
    : rows;

  return (
    <>
      <div className="card">
        <div className="row-between mb-4">
          <div className="card-title" style={{ marginBottom: 0 }}>Leaderboard</div>
          <div className="row gap-8">
            <button
              className={`log-pill${tab === 'allTime' ? ' active' : ''}`}
              onClick={() => setTab('allTime')}
            >
              All Time
            </button>
            <button
              className={`log-pill${tab === 'weekly' ? ' active' : ''}`}
              onClick={() => setTab('weekly')}
            >
              Weekly
            </button>
          </div>
        </div>
        <div className="text-xs text-dim">
          {tab === 'allTime'
            ? 'Ranked by total wealth (cash + inventory + assets)'
            : 'Weekly tournament rankings — top 3 win prizes!'}
        </div>
      </div>

      {displayRows.length === 0 && (
        <div className="card">
          <div className="text-sm text-dim">
            {tab === 'weekly' ? 'No tournament data yet.' : 'No players on the leaderboard yet.'}
          </div>
        </div>
      )}

      {displayRows.map((row, i) => {
        const isMe = row.player_id === g?.id;
        const rank = i + 1;
        const medal = rank === 1 ? '\u{1F947}' : rank === 2 ? '\u{1F948}' : rank === 3 ? '\u{1F949}' : '';
        const prizeLabel = tab === 'weekly' && rank <= 3
          ? rank === 1 ? ' \u00B7 Gold Prize' : rank === 2 ? ' \u00B7 Silver Prize' : ' \u00B7 Bronze Prize'
          : '';
        return (
          <div
            key={row.player_id}
            className="card"
            style={{
              cursor: 'pointer',
              borderLeft: isMe ? '3px solid var(--accent)' : undefined,
              background: isMe ? 'rgba(0,200,255,0.05)' : undefined,
            }}
            onClick={() => viewProfile(row.player_id)}
          >
            <div className="row-between">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="font-bold text-sm" style={{ minWidth: 28 }}>
                  {medal || `#${rank}`}
                </span>
                <div>
                  <div className="font-bold text-sm">
                    {row.name || 'Unknown'}
                    {isMe && <span className="text-accent text-xs"> (You)</span>}
                  </div>
                  <div className="text-xs text-dim">
                    Rep {(row.reputation || 0).toFixed(1)} {'\u00B7'} {row.locations || 0} loc{(row.locations || 0) !== 1 ? 's' : ''}
                    {prizeLabel && <span className="text-gold font-bold">{prizeLabel}</span>}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="font-bold text-green text-sm">${fmt(Math.floor(row.wealth || 0))}</div>
                <div className="text-xs text-dim">wealth</div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
