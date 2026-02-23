import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { TUTORIAL_STEPS } from '@shared/helpers/tutorial.js';
import { postAction } from '../api/client.js';

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
  const { state, refreshState } = useGame();
  const g = state.game;
  const step = g.tutorialStep || 0;
  const current = TUTORIAL_STEPS[step];

  if (!current) return null;

  const isLast = step >= TUTORIAL_STEPS.length - 1;

  const advance = async () => {
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
    <div className="tutorial-overlay">
      <div className="tutorial-card">
        <div className="tutorial-vinnie">
          {VINNIE_EMOTIONS[current.vinnieEmotion] || "\u{1F9D4}"}
        </div>
        <div className="tutorial-step-count">
          {step + 1} / {TUTORIAL_STEPS.length}
        </div>
        <h2 className="tutorial-title">{current.title}</h2>
        <p className="tutorial-text">{current.text}</p>

        {current.panel && (
          <div className="tutorial-hint">
            Tab: <span className="text-accent font-bold">{current.panel.toUpperCase()}</span>
          </div>
        )}

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
