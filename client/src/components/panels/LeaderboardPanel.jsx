import React, { useState, useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { API_BASE, getHeaders } from '../../api/client.js';
import { fmt } from '@shared/helpers/format.js';
import EmptyState from '../EmptyState.jsx';
import { SkeletonLeaderboardRow } from '../SkeletonLoader.jsx';
import useSwipeTabs from '../../hooks/useSwipeTabs.js';

export default function LeaderboardPanel() {
  const { state, dispatch } = useGame();
  const g = state.game;
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('allTime'); // 'allTime' or 'weekly'
  const [tournamentData, setTournamentData] = useState(null);
  const swipeHandlers = useSwipeTabs(['allTime', 'weekly'], tab, setTab);

  // Throttle leaderboard fetches — every 5 days instead of every tick
  const lastFetchDay = useRef(0);
  useEffect(() => {
    const day = g?.day || 0;
    if (day - lastFetchDay.current < 5 && rows.length > 0) return;
    lastFetchDay.current = day;
    getHeaders().then(h =>
      fetch(`${API_BASE}/leaderboard?limit=50`, { headers: h })
        .then(r => r.json())
        .then(data => setRows(Array.isArray(data) ? data : []))
        .catch(() => {})
    );
  }, [g?.day]);

  const lastTourneyDay = useRef(0);
  useEffect(() => {
    if (tab === 'weekly') {
      const day = g?.day || 0;
      if (day - lastTourneyDay.current < 5 && tournamentData) return;
      lastTourneyDay.current = day;
      getHeaders().then(h =>
        fetch(`${API_BASE}/tournament`, { headers: h })
          .then(r => r.json())
          .then(data => setTournamentData(data))
          .catch(() => setTournamentData(null))
      );
    }
  }, [tab, g?.day]);

  const viewProfile = (playerId) => {
    dispatch({ type: 'SET_VIEWING_PROFILE', payload: playerId });
  };

  // Weekly tab: use tournament rankings, or fallback to all-time rows
  const displayRows = tab === 'weekly' && tournamentData?.rankings?.length > 0
    ? tournamentData.rankings
    : tab === 'weekly' ? [] : rows;

  return (
    <div {...swipeHandlers}>
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
        rows.length === 0 ? (
          <>
            {[0,1,2,3,4].map(i => <SkeletonLeaderboardRow key={i} />)}
          </>
        ) : (
          <EmptyState
            vinnie="trophy"
            title="No Rankings Yet"
            message={tab === 'weekly' ? 'The weekly tournament hasn\'t started yet. Check back soon!' : 'No players on the leaderboard yet. Be the first!'}
          />
        )
      )}

      {displayRows.map((row, i) => {
        const isMe = row.player_id === g?.id;
        const rowPremium = isMe ? !!g?.isPremium : !!row.isPremium;
        const rank = i + 1;
        const medal = rank === 1 ? '\u{1F947}' : rank === 2 ? '\u{1F948}' : rank === 3 ? '\u{1F949}' : '';
        const prizeLabel = tab === 'weekly' && rank <= 3
          ? rank === 1 ? ' \u00B7 Gold Prize' : rank === 2 ? ' \u00B7 Silver Prize' : ' \u00B7 Bronze Prize'
          : '';
        return (
          <div
            key={row.player_id}
            className={`card${rowPremium ? ' lb-premium' : ''}`}
            style={{
              cursor: 'pointer',
              borderLeft: !rowPremium && isMe ? '3px solid var(--accent)' : undefined,
              background: !rowPremium && isMe ? 'rgba(0,200,255,0.05)' : undefined,
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
                    {rowPremium && <span style={{ fontSize: 11, marginRight: 3 }}>{'\u{1F451}'}</span>}
                    <span className={rowPremium ? 'lb-premium-name' : ''}>
                      {row.name || 'Unknown'}
                    </span>
                    {isMe && <span className="text-accent text-xs"> (You)</span>}
                  </div>
                  <div className="text-xs text-dim">
                    Rep {(row.reputation || 0).toFixed(1)} {'\u00B7'} {row.locations || 0} loc{(row.locations || 0) !== 1 ? 's' : ''}
                    {row.stockTicker && (
                      <span
                        className="text-green font-bold"
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch({ type: 'SET_PANEL', payload: 'exchange' });
                          // Store ticker for ExchangePanel to pick up
                          try { localStorage.setItem('te_viewStock', row.stockTicker); } catch {}
                        }}
                      >
                        {' \u00B7 $'}{row.stockTicker}
                      </span>
                    )}
                    {prizeLabel && <span className="text-gold font-bold">{prizeLabel}</span>}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {tab === 'weekly' && row.weeklyRevenue != null ? (
                  <>
                    <div className="font-bold text-green text-sm">${fmt(Math.floor(row.weeklyRevenue || 0))}</div>
                    <div className="text-xs text-dim">weekly rev</div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-green text-sm">${fmt(Math.floor(row.wealth || 0))}</div>
                    <div className="text-xs text-dim">wealth</div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
