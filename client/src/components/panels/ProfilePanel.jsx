import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { API_BASE, headers, postAction } from '../../api/client.js';
import { getCalendar, DAYS_PER_YEAR } from '@shared/helpers/calendar.js';

export default function ProfilePanel() {
  const { state, dispatch, refreshState } = useGame();
  const g = state.game;
  const viewingId = state.viewingProfile;
  const isOther = viewingId && viewingId !== g?.id;

  const [profile, setProfile] = useState(null);
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showPremium, setShowPremium] = useState(false);

  const targetId = isOther ? viewingId : g?.id;

  useEffect(() => {
    if (!targetId) return;
    setProfile(null);
    fetch(`${API_BASE}/profile/${targetId}`, { headers })
      .then(r => r.json())
      .then(data => setProfile(data))
      .catch(() => {});
  }, [targetId, g?.day]);

  const handleReset = async () => {
    setResetting(true);
    const res = await postAction('resetGame', {});
    if (res.ok) {
      refreshState();
      setShowReset(false);
    }
    setResetting(false);
  };

  const goBack = () => {
    dispatch({ type: 'SET_PANEL', payload: 'leaderboard' });
  };

  if (!profile) return <div className="card"><div className="text-sm text-dim">Loading profile...</div></div>;

  // For own profile, use live game context for volatile stats
  const rep = isOther ? (profile.reputation || 0) : g.reputation;
  const locCount = isOther ? (profile.locationCount || 0) : (g.locations || []).length;
  const profileIsPremium = isOther ? !!profile.isPremium : !!g.isPremium;

  // Premium since year
  const premiumYear = !isOther && g.premiumSince
    ? Math.floor((g.premiumSince - 1) / DAYS_PER_YEAR) + 1
    : null;

  return (
    <>
      {isOther && (
        <div className="card">
          <button className="btn btn-sm btn-outline" onClick={goBack}>
            {'\u2190'} Back to Leaderboard
          </button>
        </div>
      )}

      <div className={`card profile-card${profileIsPremium ? ' premium-card premium-shimmer' : ''}${(g.cosmetics || []).includes('elite_border') && !profileIsPremium ? ' elite-profile-border' : ''}`}>
        {profileIsPremium && (
          <div style={{ marginBottom: 8 }}>
            <span className="premium-crown">{'\u{1F451}'} PRO</span>
          </div>
        )}
        <div className="profile-avatar">{'\u{1F3EA}'}</div>
        <div className="profile-name">{profile.companyName}</div>
        <div className="profile-company">Founded by {profile.name}</div>
        <div className="profile-stat-grid">
          <div className="profile-stat">
            <div className="profile-stat-val">{profile.yearsInBusiness}</div>
            <div className="profile-stat-label">Year{profile.yearsInBusiness !== 1 ? 's' : ''} in Business</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-val">{locCount}</div>
            <div className="profile-stat-label">Location{locCount !== 1 ? 's' : ''}</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-val">{typeof rep === 'number' ? rep.toFixed(1) : rep}</div>
            <div className="profile-stat-label">Reputation</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-val">Y{profile.yearStarted}</div>
            <div className="profile-stat-label">Founded</div>
          </div>
        </div>
        {profileIsPremium && premiumYear && (
          <div className="text-xs text-dim" style={{ marginTop: 12 }}>
            {'\u{1F451}'} PRO Member since Year {premiumYear}
          </div>
        )}
      </div>

      {/* Go Premium button (own profile, not premium) */}
      {!isOther && !g.isPremium && (
        <div className="card" style={{ textAlign: 'center' }}>
          <button
            className="btn btn-full btn-sm"
            style={{
              background: 'linear-gradient(135deg, #ffd54f, #ff8f00)',
              color: '#1a1a2e',
              fontWeight: 800,
            }}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('openPremiumModal'));
            }}
          >
            {'\u{1F451}'} Go Premium — $4.99/mo
          </button>
          <div className="text-xs text-dim" style={{ marginTop: 4 }}>
            No ads, premium badge, gold name effect
          </div>
        </div>
      )}

      {/* Other player's store locations */}
      {isOther && (profile.storeCities || []).length > 0 && (
        <div className="card">
          <div className="card-title">Store Locations</div>
          {profile.storeCities.map((city, i) => (
            <div key={i} className="text-sm mb-4">
              {'\u{1F3EA}'} {city}
            </div>
          ))}
        </div>
      )}

      {/* Trade button when viewing other player */}
      {isOther && (g.locations || []).length > 0 && (
        <div className="card">
          <button
            className="btn btn-full btn-sm"
            style={{ background: 'var(--accent)', color: '#000' }}
            onClick={() => dispatch({ type: 'SET_PANEL', payload: 'trade' })}
          >
            Send Trade Offer
          </button>
          <div className="text-xs text-dim" style={{ marginTop: 4, textAlign: 'center' }}>
            Direct trade — no escrow, no protection
          </div>
        </div>
      )}

      {/* Only show reset for own profile */}
      {!isOther && (
        <>
          <div className="card">
            <button
              className="btn btn-full btn-sm"
              style={{ background: 'var(--red)', color: '#fff', opacity: 0.8 }}
              onClick={() => setShowReset(true)}
            >
              Reset Character
            </button>
            <div className="text-xs text-dim" style={{ marginTop: 4, textAlign: 'center' }}>
              Start over from scratch. The world clock keeps ticking.
            </div>
          </div>

          {showReset && (
            <div className="vinnie-popup-backdrop" onClick={() => setShowReset(false)}>
              <div className="vinnie-popup-card" onClick={e => e.stopPropagation()}>
                <div className="vinnie-popup-emoji">{'\u{1F628}'}</div>
                <div className="vinnie-popup-title">You Sure About This?</div>
                <div className="vinnie-popup-message">
                  Whoa whoa whoa... Everything you built — gone. Cash, tires, shops, rep...
                  back to square one with a van and a dream. The clock keeps ticking though,
                  so the world moves on without you. You really wanna do this, kid?
                </div>
                <div className="vinnie-popup-actions">
                  <button
                    className="btn btn-full btn-sm"
                    style={{ background: 'var(--red)', color: '#fff' }}
                    onClick={handleReset}
                    disabled={resetting}
                  >
                    {resetting ? 'Resetting...' : "Yeah, Start Over"}
                  </button>
                  <button
                    className="btn btn-full btn-sm btn-outline"
                    onClick={() => setShowReset(false)}
                  >
                    Nah, I'm Good
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
