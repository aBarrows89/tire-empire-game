import React, { useMemo } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { VINNIE_MILESTONES, VINNIE_EMOTIONS } from '@shared/constants/vinnieMilestones.js';
import { postAction } from '../api/client.js';

export default function VinniePopup() {
  const { state, refreshState, dispatch } = useGame();
  const g = state.game;

  const activeMilestone = useMemo(() => {
    if (!g || !g.tutorialDone) return null;
    const seen = g.vinnieSeen || [];
    for (const ms of VINNIE_MILESTONES) {
      if (seen.includes(ms.id)) continue;
      try {
        if (ms.check(g)) return ms;
      } catch { /* skip broken checks */ }
    }
    return null;
  }, [g]);

  if (!activeMilestone) return null;

  // Support function-type messages (dynamic with game state)
  // Safety: always coerce to string to prevent React error #31 if a
  // milestone function accidentally returns an object
  let message;
  try {
    const raw = typeof activeMilestone.message === 'function'
      ? activeMilestone.message(g)
      : activeMilestone.message;
    message = (typeof raw === 'string') ? raw : String(raw || '');
  } catch {
    message = '';
  }

  const dismiss = async () => {
    await postAction('dismissVinnie', { id: activeMilestone.id });
    refreshState();
  };

  const handleAction = async () => {
    await postAction('dismissVinnie', { id: activeMilestone.id });
    if (activeMilestone.action === 'openPremium') {
      // Dispatch custom event to open PremiumModal (handled by App.jsx)
      window.dispatchEvent(new CustomEvent('openPremiumModal'));
    } else if (activeMilestone.panel) {
      dispatch({ type: 'SET_PANEL', payload: activeMilestone.panel });
    }
    refreshState();
  };

  const emoji = VINNIE_EMOTIONS[activeMilestone.emotion] || '\u{1F9D4}';
  const hasAction = activeMilestone.panel || activeMilestone.action;

  return (
    <div className="vinnie-popup-backdrop" onClick={dismiss}>
      <div className="vinnie-popup-card" onClick={e => e.stopPropagation()}>
        <div className="vinnie-popup-emoji">{emoji}</div>
        <div className="vinnie-popup-title">{activeMilestone.title}</div>
        <div className="vinnie-popup-message">{message}</div>
        <div className="vinnie-popup-actions">
          {hasAction && (
            <button className="btn btn-full btn-sm btn-green" onClick={handleAction}>
              {activeMilestone.hint || 'Let\'s Go'}
            </button>
          )}
          <button className="btn btn-full btn-sm btn-outline" onClick={dismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
