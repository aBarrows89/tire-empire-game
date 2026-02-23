import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';

export default function ProfilePanel() {
  const { state } = useGame();
  const g = state.game;
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!g?.id) return;
    fetch(`/api/profile/${g.id}`)
      .then(r => r.json())
      .then(data => setProfile(data))
      .catch(() => {});
  }, [g?.id, g?.week]);

  if (!profile) return <div className="card"><div className="text-sm text-dim">Loading profile...</div></div>;

  return (
    <div className="card profile-card">
      <div className="profile-avatar">🏪</div>
      <div className="profile-name">{profile.companyName}</div>
      <div className="profile-company">Founded by {profile.name}</div>
      <div className="profile-stat-grid">
        <div className="profile-stat">
          <div className="profile-stat-val">{profile.yearsInBusiness}</div>
          <div className="profile-stat-label">Year{profile.yearsInBusiness !== 1 ? 's' : ''} in Business</div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-val">{profile.locationCount}</div>
          <div className="profile-stat-label">Location{profile.locationCount !== 1 ? 's' : ''}</div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-val">{profile.reputation}</div>
          <div className="profile-stat-label">Reputation</div>
        </div>
        <div className="profile-stat">
          <div className="profile-stat-val">Y{profile.yearsInBusiness}</div>
          <div className="profile-stat-label">Founded</div>
        </div>
      </div>
    </div>
  );
}
