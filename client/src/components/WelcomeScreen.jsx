import React, { useState } from 'react';
import { registerPlayer } from '../api/client.js';
import { useGame } from '../context/GameContext.jsx';

export default function WelcomeScreen() {
  const { refreshState } = useGame();
  const [playerName, setPlayerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = playerName.trim().length >= 2 && companyName.trim().length >= 2;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await registerPlayer(playerName.trim(), companyName.trim());
      await refreshState();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-inner">
        <div className="welcome-vinnie">&#x1F9D4;</div>
        <h1 className="welcome-title">Tire Empire</h1>
        <p className="welcome-sub">
          Hey there, kid! Name's Vinnie. Welcome to the tire game — a live
          multiplayer economy where real players compete, trade, and build
          empires. You'll start from nothing and work your way up. First,
          tell me who you are.
        </p>

        <form onSubmit={handleSubmit} className="welcome-form">
          <label className="welcome-label">
            Your Name
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="e.g. Andy"
              maxLength={30}
              className="welcome-input"
              autoFocus
            />
          </label>

          <label className="welcome-label">
            Company Name
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Big Wheel Tire Co."
              maxLength={40}
              className="welcome-input"
            />
          </label>

          {error && <div className="welcome-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-full"
            disabled={!canSubmit || busy}
            style={{ marginTop: 8 }}
          >
            {busy ? 'Setting up...' : "Let's Roll"}
          </button>
        </form>

        <p className="welcome-hint">
          You'll start with $400, a van, and a dream. Build shops, trade with
          players, manufacture tires, and dominate the market. This is a live
          economy — competition never sleeps.
        </p>
      </div>
    </div>
  );
}
