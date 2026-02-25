import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { ACHIEVEMENTS } from '@shared/constants/achievements.js';
import { MONET } from '@shared/constants/monetization.js';
import { postAction } from '../../api/client.js';

export default function AchievementsPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const earned = g.achievements || {};
  const earnedCount = Object.values(earned).filter(Boolean).length;
  const [busy, setBusy] = useState(null);

  const buyCosmetic = async (cosmeticId) => {
    setBusy(cosmeticId);
    await postAction('buyCosmetic', { cosmeticId });
    refreshState();
    setBusy(null);
  };

  const cosmetics = MONET?.cosmetics || [];
  const owned = g.cosmetics || [];

  return (
    <>
      <div className="card">
        <div className="card-title">Achievements</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">TireCoins</span>
          <span className="font-bold text-gold">{g.tireCoins || 0}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Unlocked</span>
          <span className="font-bold">{earnedCount} / {ACHIEVEMENTS.length}</span>
        </div>
        <div className="progress-bar mb-4">
          <div
            className="progress-fill"
            style={{ width: `${ACHIEVEMENTS.length > 0 ? Math.round((earnedCount / ACHIEVEMENTS.length) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* TireCoin Shop */}
      {cosmetics.length > 0 && (
        <div className="card">
          <div className="card-title">TireCoin Shop</div>
          <div className="text-xs text-dim mb-4">
            Spend your TireCoins on cosmetic upgrades. Balance: <span className="text-gold font-bold">{g.tireCoins || 0} TC</span>
          </div>
          {cosmetics.map(item => {
            const isOwned = owned.includes(item.id);
            const cantAfford = (g.tireCoins || 0) < item.cost;
            return (
              <div key={item.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8 }}>
                <div className="row-between mb-4">
                  <span className="font-bold text-sm">{item.n}</span>
                  <span className="text-gold font-bold text-sm">{item.cost} TC</span>
                </div>
                <div className="text-xs text-dim mb-4">{item.desc}</div>
                {isOwned ? (
                  <div className="text-xs text-green font-bold">OWNED</div>
                ) : (
                  <button
                    className="btn btn-full btn-sm"
                    disabled={cantAfford || busy === item.id}
                    style={cantAfford ? {} : { background: 'var(--gold)', color: '#111' }}
                    onClick={() => buyCosmetic(item.id)}
                  >
                    {cantAfford ? `Need ${item.cost} TC` : busy === item.id ? '...' : `Buy (${item.cost} TC)`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {ACHIEVEMENTS.map((ach) => {
          const unlocked = !!earned[ach.id];
          return (
            <div
              key={ach.id}
              className="card"
              style={{
                opacity: unlocked ? 1 : 0.5,
                textAlign: 'center',
                padding: '14px 10px',
                marginBottom: 0,
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>
                {ach.icon}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>
                {ach.title}
                {unlocked && <span style={{ color: 'var(--green)', marginLeft: 4 }}>{'\u2713'}</span>}
              </div>
              <div className="text-xs text-dim" style={{ marginBottom: 4, lineHeight: 1.3 }}>
                {ach.desc}
              </div>
              <div className="text-xs text-gold font-bold">
                +{ach.coins} TC
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
