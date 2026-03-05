import React, { useState, useEffect, useRef } from 'react';
import { registerPlayer, API_BASE } from '../api/client.js';
import { useGame } from '../context/GameContext.jsx';
import { cacheGameState } from '../services/offlineCache.js';

export default function WelcomeScreen() {
  const { dispatch } = useGame();
  const [playerName, setPlayerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referralStatus, setReferralStatus] = useState(null); // null | 'checking' | 'valid' | 'invalid'
  const [referralPerks, setReferralPerks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const checkTimer = useRef(null);

  const canSubmit = playerName.trim().length >= 2 && companyName.trim().length >= 2;

  // Debounced referral code validation
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    const code = referralCode.trim();
    if (!code) {
      setReferralStatus(null);
      setReferralPerks(null);
      return;
    }
    if (code.length < 3) return;
    setReferralStatus('checking');
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/state/check-referral/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.valid) {
          setReferralStatus('valid');
          setReferralPerks(data.perks);
        } else {
          setReferralStatus('invalid');
          setReferralPerks(null);
        }
      } catch {
        setReferralStatus(null);
        setReferralPerks(null);
      }
    }, 600);
    return () => clearTimeout(checkTimer.current);
  }, [referralCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const code = referralCode.trim() || undefined;
      const gameState = await registerPlayer(playerName.trim(), companyName.trim(), code);
      // Use the state returned directly from register — avoids a second round-trip
      // that could hang if the server is slow loading economy data
      if (gameState && gameState.companyName) {
        dispatch({ type: 'SET_STATE', payload: gameState });
        cacheGameState(gameState);
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const formatPerkList = (perks) => {
    if (!perks) return null;
    const items = [];
    if (perks.bonusCash) items.push(`+$${perks.bonusCash.toLocaleString()} starting cash`);
    if (perks.bonusTireCoins) items.push(`+${perks.bonusTireCoins} TireCoins`);
    if (perks.premiumDays) items.push(`${perks.premiumDays} days free Premium`);
    if (perks.repBoost) items.push(`${Math.round((perks.repBoost.multiplier - 1) * 100)}% rep boost for ${perks.repBoost.days} days`);
    if (perks.revenueBoost) items.push(`${Math.round((perks.revenueBoost.multiplier - 1) * 100)}% revenue boost for ${perks.revenueBoost.days} days`);
    if (perks.freeStorageSlots) items.push(`+${perks.freeStorageSlots} warehouse slots`);
    return items;
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

          <label className="welcome-label">
            Referral Code <span style={{ fontWeight: 'normal', opacity: 0.6, fontSize: '0.85em' }}>(optional)</span>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                placeholder="e.g. VINNIE50"
                maxLength={30}
                className="welcome-input"
                style={{ paddingRight: 36 }}
              />
              {referralStatus === 'checking' && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>...</span>
              )}
              {referralStatus === 'valid' && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#22c55e', fontWeight: 'bold' }}>&#10003;</span>
              )}
              {referralStatus === 'invalid' && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#ef4444', fontWeight: 'bold' }}>&#10007;</span>
              )}
            </div>
          </label>

          {referralStatus === 'valid' && referralPerks && (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: '0.85em', marginTop: -4 }}>
              <strong style={{ color: '#22c55e' }}>Bonus perks unlocked:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {formatPerkList(referralPerks).map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

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
