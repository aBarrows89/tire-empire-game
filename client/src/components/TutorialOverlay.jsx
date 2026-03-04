import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { TUTORIAL_STEPS } from '@shared/helpers/tutorial.js';
import { postAction } from '../api/client.js';
import { hapticsMedium } from '../api/haptics.js';
import VinnieAvatar from './VinnieAvatar.jsx';

/**
 * TypewriterText — reveals text character-by-character.
 * Tap to skip to full text instantly.
 */
function TypewriterText({ text, speed = 25, onFinish }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const idxRef = useRef(0);
  const rafRef = useRef(null);
  const lastRef = useRef(0);

  useEffect(() => {
    // Reset on new text
    idxRef.current = 0;
    lastRef.current = 0;
    setDisplayed('');
    setDone(false);

    function tick(ts) {
      if (!lastRef.current) lastRef.current = ts;
      const elapsed = ts - lastRef.current;
      if (elapsed >= speed) {
        const charsToAdd = Math.min(Math.floor(elapsed / speed), text.length - idxRef.current);
        idxRef.current += charsToAdd;
        lastRef.current = ts;
        setDisplayed(text.slice(0, idxRef.current));
        if (idxRef.current >= text.length) {
          setDone(true);
          if (onFinish) onFinish();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [text, speed, onFinish]);

  const skipToEnd = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    idxRef.current = text.length;
    setDisplayed(text);
    setDone(true);
    if (onFinish) onFinish();
  }, [text, onFinish]);

  return (
    <p className="tutorial-text" onClick={!done ? skipToEnd : undefined}>
      {displayed}
      {!done && <span className="typewriter-cursor">|</span>}
    </p>
  );
}

export default function TutorialOverlay() {
  const { state, dispatch, refreshState } = useGame();
  const g = state.game;
  const step = g.tutorialStep || 0;
  const current = TUTORIAL_STEPS[step];
  const [textDone, setTextDone] = useState(false);
  const [animKey, setAnimKey] = useState(0); // force re-mount on step change
  const prevStepRef = useRef(step);

  // Auto-navigate to the panel the current step references
  useEffect(() => {
    if (current?.panel) {
      dispatch({ type: 'SET_PANEL', payload: current.panel });
    }
  }, [step, current?.panel, dispatch]);

  // Broadcast tutorial highlight target for BottomNav
  useEffect(() => {
    if (current?.panel) {
      window.dispatchEvent(new CustomEvent('tutorialHighlight', { detail: current.panel }));
    } else {
      window.dispatchEvent(new CustomEvent('tutorialHighlight', { detail: null }));
    }
    return () => {
      window.dispatchEvent(new CustomEvent('tutorialHighlight', { detail: null }));
    };
  }, [step, current?.panel]);

  // Reset text-done state and re-trigger animations on step change
  useEffect(() => {
    if (prevStepRef.current !== step) {
      setTextDone(false);
      setAnimKey(k => k + 1);
      prevStepRef.current = step;
    }
  }, [step]);

  const onTextFinish = useCallback(() => setTextDone(true), []);

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
      <div className="tutorial-spotlight-card" key={animKey}>
        {/* Animated Vinnie avatar */}
        <div className="tutorial-vinnie-wrap">
          <VinnieAvatar emotion={current.vinnieEmotion} size={68} />
        </div>

        <h2 className="tutorial-title tutorial-fade-in">{current.title}</h2>

        <TypewriterText
          text={current.text}
          speed={25}
          onFinish={onTextFinish}
        />

        {current.panel && (
          <div className="tutorial-hint tutorial-fade-in-delay">
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
          <button
            className={`btn btn-full${textDone ? ' tutorial-btn-ready' : ''}`}
            onClick={advance}
            disabled={!textDone}
          >
            {isLast ? "Start Playing!" : "Next"}
          </button>
          {!isLast && (
            <button
              className="btn btn-full btn-outline"
              onClick={skip}
              style={{ marginTop: 8, opacity: 0.7 }}
            >
              Skip Tutorial
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
