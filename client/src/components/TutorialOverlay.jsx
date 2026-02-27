import React, { useEffect } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { TUTORIAL_STEPS } from '@shared/helpers/tutorial.js';
import { postAction } from '../api/client.js';
import { hapticsMedium } from '../api/haptics.js';

const VINNIE_EMOTIONS = {
  smirk: "\u{1F60F}",
  point: "\u{1F449}",
  think: "\u{1F914}",
  shrug: "\u{1F937}",
  serious: "\u{1F9D4}",
  money: "\u{1F4B0}",
  excited: "\u{1F929}",
  thumbsup: "\u{1F44D}",
};

export default function TutorialOverlay() {
  const { state, dispatch, refreshState } = useGame();
  const g = state.game;
  const step = g.tutorialStep || 0;
  const current = TUTORIAL_STEPS[step];

  // Auto-navigate to the panel the current step references
  useEffect(() => {
    if (current?.panel) {
      dispatch({ type: 'SET_PANEL', payload: current.panel });
    }
  }, [step, current?.panel, dispatch]);

  if (!current) return null;

  const isLast = step >= TUTORIAL_STEPS.length - 1;

  const advance = async () => {
    hapticsMedium();
    if (isLast) {
      await postAction('tutorialDone');
    } else {
      await postAction('tutorialAdvance');
    }
    refreshState();
  };

  const skip = async () => {
    await postAction('tutorialDone');
    refreshState();
  };

  return (
    <div className="tutorial-spotlight-backdrop">
      <div className="tutorial-spotlight-card">
        <div className="tutorial-vinnie">
          {VINNIE_EMOTIONS[current.vinnieEmotion] || "\u{1F9D4}"}
        </div>
        <h2 className="tutorial-title">{current.title}</h2>
        <p className="tutorial-text">{current.text}</p>

        {current.panel && (
          <div className="tutorial-hint">
            Look at the <span className="text-accent font-bold">{current.panel.toUpperCase()}</span> tab behind this card
          </div>
        )}

        <div className="tutorial-progress-bar">
          <div
            className="tutorial-progress-fill"
            style={{ width: `${((step + 1) / TUTORIAL_STEPS.length) * 100}%` }}
          />
        </div>
        <div className="tutorial-step-count">
          {step + 1} / {TUTORIAL_STEPS.length}
        </div>

        <div className="tutorial-actions">
          <button className="btn btn-full" onClick={advance}>
            {isLast ? "Start Playing!" : "Next"}
          </button>
          {!isLast && (
            <button
              className="btn btn-full btn-outline"
              onClick={skip}
              style={{ marginTop: 8 }}
            >
              Skip Tutorial
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
