import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { API_BASE, getHeaders, postAction } from '../../api/client.js';
import { getCalendar, DAYS_PER_YEAR } from '@shared/helpers/calendar.js';
import { SkeletonProfileCard } from '../SkeletonLoader.jsx';
import { isMuted, toggleMute, isMusicMuted, toggleMusic } from '../../api/sounds.js';
import RewardedAdButton from '../RewardedAdButton.jsx';
import { MONET } from '@shared/constants/monetization.js';

export default function ProfilePanel() {
  const { state, dispatch, refreshState } = useGame();
  const g = state.game;
  const viewingId = state.viewingProfile;
  const isOther = viewingId && viewingId !== g?.id;

  const [profile, setProfile] = useState(null);
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const [muted, setMuted] = useState(isMuted);
  const [musicOff, setMusicOff] = useState(isMusicMuted);

  const targetId = isOther ? viewingId : g?.id;

  useEffect(() => {
    if (!targetId) return;
    setProfile(null);
    getHeaders().then(h => fetch(`${API_BASE}/profile/${targetId}`, { headers: h }))
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

  if (!profile) return <SkeletonProfileCard />;

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
            Unlock gameplay advantages + cosmetics
          </div>
          <RewardedAdButton />
        </div>
      )}

      {/* Premium Perks (own profile, is premium) */}
      {!isOther && g.isPremium && (
        <div className="card" style={{ borderLeft: '3px solid var(--gold, #ffd54f)' }}>
          <div className="card-title" style={{ color: 'var(--gold, #ffd54f)' }}>{'\u{1F451}'} PRO Perks Active</div>
          <div className="text-xs mb-4" style={{ lineHeight: 1.6 }}>
            <div>{'\u2705'} +10% Bank Interest Bonus</div>
            <div>{'\u2705'} +8% Shop Foot Traffic</div>
            <div>{'\u2705'} Daily Bonus Used Tire Finds</div>
            <div>{'\u2705'} Exclusive Supplier Tires (Luxury Touring, Premium All-Weather)</div>
            <div>{'\u2705'} Weekly Vinnie Insider Tips</div>
            <div>{'\u2705'} Free Auto-Restock (no IAP needed)</div>
            <div>{'\u2705'} Gold Name + Premium Badge</div>
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

      {/* Actions when viewing other player */}
      {isOther && (
        <div className="card">
          <div className="card-title">Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(g.locations || []).length > 0 && (
              <button
                className="btn btn-full btn-sm"
                style={{ background: 'var(--accent)', color: '#000' }}
                onClick={() => dispatch({ type: 'SET_PANEL', payload: 'trade' })}
              >
                {'\u{1F91D}'} Send Trade Offer
              </button>
            )}
            <button
              className="btn btn-full btn-sm"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              onClick={() => {
                dispatch({ type: 'OPEN_DM', payload: { playerId: viewingId, playerName: profile?.companyName || 'Player' } });
              }}
            >
              {'\u{1F4AC}'} Send Message
            </button>
            <button
              className="btn btn-full btn-sm"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              onClick={async () => {
                const reason = prompt('Report reason (e.g. spam, harassment, scam):');
                if (!reason) return;
                try {
                  const h = await getHeaders();
                  await fetch(`${API_BASE}/chat/report`, {
                    method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetId: viewingId, reason, context: 'profile' }),
                  });
                  alert('Report submitted. Thank you.');
                } catch { alert('Failed to submit report.'); }
              }}
            >
              {'\u{26A0}\u{FE0F}'} Report Player
            </button>
            <button
              className="btn btn-full btn-sm"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--red)' }}
              onClick={async () => {
                const isBlocked = (g.blockedPlayers || []).includes(viewingId);
                try {
                  await postAction(isBlocked ? 'unblockPlayer' : 'blockPlayer', { targetId: viewingId });
                  refreshState();
                } catch { alert('Failed to update block status.'); }
              }}
            >
              {(g.blockedPlayers || []).includes(viewingId) ? '\u{1F513} Unblock Player' : '\u{1F6AB} Block Player'}
            </button>
          </div>
        </div>
      )}

      {/* Sound settings (own profile only) */}
      {!isOther && (
        <div className="card">
          <div className="card-title">Audio</div>
          <div className="row-between mb-4">
            <span className="text-sm">Sound Effects</span>
            <button
              className={`btn btn-sm ${muted ? 'btn-outline' : 'btn-green'}`}
              onClick={() => setMuted(toggleMute())}
            >
              {muted ? '\u{1F507} Muted' : '\u{1F50A} On'}
            </button>
          </div>
          <div className="row-between">
            <span className="text-sm">Background Music</span>
            <button
              className={`btn btn-sm ${musicOff ? 'btn-outline' : 'btn-green'}`}
              onClick={() => setMusicOff(toggleMusic())}
            >
              {musicOff ? '\u{1F507} Off' : '\u{1F3B5} On'}
            </button>
          </div>
          <div className="text-xs text-dim" style={{ marginTop: 6 }}>Rainy Day Rhodes</div>
        </div>
      )}

      {/* Notification Preferences (own profile only) */}
      {!isOther && (
        <div className="card">
          <div className="card-title">Notifications</div>
          <div className="text-xs text-dim mb-4">Choose which alerts you receive each day.</div>
          {[
            { key: 'globalEvents', label: 'Global Market Events', desc: 'Rubber shortages, port strikes, economic booms' },
            { key: 'cashReserve', label: 'Cash Reserve Warning', desc: 'Alert when cash drops below your threshold' },
            { key: 'tcStorage', label: 'TC Storage Alerts', desc: 'Warning when TireCoin storage is near capacity' },
            { key: 'inventory', label: 'Inventory Alerts', desc: 'Low stock and storage full warnings' },
            { key: 'loanPayments', label: 'Loan Payment Reminders', desc: 'Reminder before weekly loan payments' },
            { key: 'factoryProduction', label: 'Factory Production', desc: 'Batch completion and rubber surplus alerts' },
          ].map(item => {
            const prefs = g.notifications || {};
            const isOn = prefs[item.key] !== false;
            return (
              <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div className="text-sm font-bold">{item.label}</div>
                  <div className="text-xs text-dim">{item.desc}</div>
                </div>
                <button
                  className={`btn btn-sm ${isOn ? 'btn-green' : 'btn-outline'}`}
                  style={{ minWidth: 50, marginLeft: 8 }}
                  onClick={async () => {
                    await postAction('updateNotifications', { [item.key]: !isOn });
                    refreshState();
                  }}
                >
                  {isOn ? 'ON' : 'OFF'}
                </button>
              </div>
            );
          })}
          {/* Cash reserve threshold */}
          {(g.notifications || {}).cashReserve !== false && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="text-sm text-dim">Warn below $</span>
              <input
                type="number"
                defaultValue={(g.notifications || {}).cashReserveThreshold || 5000}
                min={0}
                step={1000}
                style={{
                  width: 100,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--card-bg)',
                  color: 'var(--text)',
                  fontSize: 14,
                }}
                onBlur={async (e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val !== ((g.notifications || {}).cashReserveThreshold || 5000)) {
                    await postAction('updateNotifications', { cashReserveThreshold: val });
                    refreshState();
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
              />
            </div>
          )}
        </div>
      )}

      {/* Vacation Mode (own profile only) */}
      {!isOther && <VacationSection g={g} refreshState={refreshState} />}

      {/* Blocked Players (own profile only) */}
      {!isOther && (g?.blockedPlayers || []).length > 0 && (
        <div className="card">
          <div className="card-title">Blocked Players</div>
          {g.blockedPlayers.map(bp => (
            <div key={bp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="text-sm">{bp.name}</span>
              <button
                className="btn btn-sm btn-outline"
                onClick={async () => {
                  await postAction('unblockPlayer', { targetPlayerId: bp.id });
                  refreshState();
                }}
              >
                Unblock
              </button>
            </div>
          ))}
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

function VacationSection({ g, refreshState }) {
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { applyState } = useGame();

  // Update countdown every second while on vacation
  useEffect(() => {
    if (!g.vacationUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [g.vacationUntil]);

  const vacConfig = MONET.vacation;
  if (!vacConfig?.enabled) return null;

  const isOnVacation = g.paused && g.vacationUntil;
  const remaining = isOnVacation ? Math.max(0, g.vacationUntil - now) : 0;
  const onCooldown = g.vacationCooldownUntil && now < g.vacationCooldownUntil;
  const cooldownRemaining = onCooldown ? Math.max(0, g.vacationCooldownUntil - now) : 0;
  const meetsMinDays = (g.day || 0) >= (vacConfig.minDaysPlayed || 7);

  const fmtTime = (ms) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const handleStart = async (tierId) => {
    setBusy(true);
    const res = await postAction('startVacation', { tierId });
    if (res?.state) applyState(res);
    else refreshState();
    setBusy(false);
  };

  const handleCancel = async () => {
    setBusy(true);
    const res = await postAction('cancelVacation', {});
    if (res?.state) applyState(res);
    else refreshState();
    setBusy(false);
  };

  if (isOnVacation) {
    const tier = vacConfig.tiers.find(t => t.id === g.vacationTier);
    return (
      <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
        <div className="card-title">{'\u{1F3D6}\uFE0F'} Vacation Mode Active</div>
        <div className="text-sm mb-4" style={{ lineHeight: 1.6 }}>
          Your empire is paused. No progress, no expenses, no decay.
        </div>
        <div style={{ textAlign: 'center', margin: '12px 0' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)' }}>{fmtTime(remaining)}</div>
          <div className="text-xs text-dim">remaining{tier ? ` (${tier.label})` : ''}</div>
        </div>
        {vacConfig.allowEarlyCancel && (
          <>
            <button
              className="btn btn-full btn-sm btn-outline"
              onClick={handleCancel}
              disabled={busy}
              style={{ marginTop: 8 }}
            >
              {busy ? 'Cancelling...' : 'Return Early'}
            </button>
            <div className="text-xs text-dim" style={{ marginTop: 4, textAlign: 'center' }}>
              No TC refund if you cancel early
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">{'\u{1F3D6}\uFE0F'} Vacation Mode</div>
      <div className="text-xs text-dim mb-4">
        Pause your empire while you're away. No progress, no expenses, no decay.
      </div>
      {!meetsMinDays && (
        <div className="text-xs" style={{ color: 'var(--red)', marginBottom: 8 }}>
          Available after Day {vacConfig.minDaysPlayed}
        </div>
      )}
      {onCooldown && (
        <div className="text-xs" style={{ color: 'var(--yellow, #ffd54f)', marginBottom: 8 }}>
          Cooldown: {fmtTime(cooldownRemaining)} remaining
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {vacConfig.tiers.map(tier => {
          const canAfford = (g.tireCoins || 0) >= tier.tcCost;
          const disabled = busy || !meetsMinDays || onCooldown || !canAfford;
          return (
            <button
              key={tier.id}
              className="btn btn-full btn-sm"
              style={{
                background: disabled ? 'var(--card-bg)' : 'linear-gradient(135deg, #4488cc, #2d6da3)',
                color: disabled ? 'var(--text-dim)' : '#fff',
                border: disabled ? '1px solid var(--border)' : 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
              }}
              onClick={() => handleStart(tier.id)}
              disabled={disabled}
            >
              <span>{tier.label}</span>
              <span style={{ fontWeight: 800 }}>{tier.tcCost} TC</span>
            </button>
          );
        })}
      </div>
      <div className="text-xs text-dim" style={{ marginTop: 8, textAlign: 'center' }}>
        You have {g.tireCoins || 0} TC
      </div>
    </div>
  );
}
