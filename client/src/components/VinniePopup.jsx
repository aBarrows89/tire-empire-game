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

  const dismiss = async () => {
    await postAction('dismissVinnie', { id: activeMilestone.id });
    refreshState();
  };

  const goToPanel = async () => {
    await postAction('dismissVinnie', { id: activeMilestone.id });
    dispatch({ type: 'SET_PANEL', payload: activeMilestone.panel });
    refreshState();
  };

  const emoji = VINNIE_EMOTIONS[activeMilestone.emotion] || '\u{1F9D4}';

  return (
    <div className="vinnie-popup-backdrop" onClick={dismiss}>
      <div className="vinnie-popup-card" onClick={e => e.stopPropagation()}>
        <div className="vinnie-popup-emoji">{emoji}</div>
        <div className="vinnie-popup-title">{activeMilestone.title}</div>
        <div className="vinnie-popup-message">{activeMilestone.message}</div>
        <div className="vinnie-popup-actions">
          {activeMilestone.panel && (
            <button className="btn btn-full btn-sm btn-green" onClick={goToPanel}>
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
