import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { postAction } from '../api/client.js';
import { prepareRewarded, showRewarded } from '../services/ads.js';
import { MONET } from '@shared/constants/monetization.js';

const MAX_REWARDED = MONET.adRewards.maxRewardedPerDay;
const REWARD_SCHEDULE = MONET.adRewards.schedule;

function getRewardedCount(day) {
  try {
    const data = JSON.parse(localStorage.getItem('te_rewarded') || '{}');
    if (data.day === day) return data.count;
  } catch { /* ignore */ }
  return 0;
}

function setRewardedCount(day, count) {
  try {
    localStorage.setItem('te_rewarded', JSON.stringify({ day, count }));
  } catch { /* ignore */ }
}

/**
 * Self-contained "Watch Ad — Earn 50 TC" button.
 * Reads game state via useGame, manages its own rewarded ad state.
 */
export default function RewardedAdButton() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const gameDay = g?.day || 1;
  const isPremium = g?.isPremium;

  const [rewardedToday, setRewardedToday] = useState(() => getRewardedCount(gameDay));
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);
  const preparedRef = useRef(false);

  // Sync count when day changes
  useEffect(() => {
    setRewardedToday(getRewardedCount(gameDay));
  }, [gameDay]);

  // Prepare rewarded ad on mount
  useEffect(() => {
    if (!preparedRef.current && !isPremium) {
      preparedRef.current = true;
      prepareRewarded();
    }
  }, [isPremium]);

  const canShow = !isPremium && rewardedToday < MAX_REWARDED;
  const remaining = MAX_REWARDED - rewardedToday;
  const nextReward = REWARD_SCHEDULE[Math.min(rewardedToday, REWARD_SCHEDULE.length - 1)];

  const handleClick = useCallback(async () => {
    if (!canShow || loading) return;
    setLoading(true);
    setFlash(null);

    const earned = await showRewarded();
    if (earned) {
      const newCount = rewardedToday + 1;
      setRewardedToday(newCount);
      setRewardedCount(gameDay, newCount);
      try {
        await postAction('rewardAdWatch');
        refreshState();
      } catch (e) {
        console.warn('Failed to grant ad reward:', e);
      }
      setFlash(`+${nextReward} TC!`);
    } else {
      setFlash('No reward');
    }
    setLoading(false);
    prepareRewarded(); // prepare next
    setTimeout(() => setFlash(null), 2500);
  }, [canShow, loading, rewardedToday, gameDay, refreshState]);

  if (isPremium) return null;

  return (
    <div style={{ textAlign: 'center', margin: '8px 0' }}>
      <button
        className="btn btn-sm"
        style={{
          background: canShow ? 'linear-gradient(135deg, #4caf50, #2e7d32)' : '#333',
          color: canShow ? '#fff' : '#666',
          fontWeight: 700,
          minWidth: 200,
        }}
        disabled={!canShow || loading}
        onClick={handleClick}
      >
        {loading
          ? 'Playing Ad...'
          : flash
            ? flash
            : `\u{1F3AC} Watch Ad — Earn ${nextReward} TC`}
      </button>
      <div className="text-xs text-dim" style={{ marginTop: 3 }}>
        {remaining > 0
          ? `${remaining} remaining today`
          : 'Daily limit reached — come back tomorrow!'}
      </div>
    </div>
  );
}
