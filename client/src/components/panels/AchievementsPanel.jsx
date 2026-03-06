import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { ACHIEVEMENTS } from '@shared/constants/achievements.js';
import { MONET } from '@shared/constants/monetization.js';
import { postAction } from '../../api/client.js';
import { hapticsMedium } from '../../api/haptics.js';

export default function AchievementsPanel() {
  const { state, applyState } = useGame();
  const g = state.game;
  const earned = g.achievements || {};
  const earnedCount = Object.values(earned).filter(Boolean).length;
  const [busy, setBusy] = useState(null);

  const buyCosmetic = async (cosmeticId) => {
    setBusy(cosmeticId);
    const result = await postAction('buyCosmetic', { cosmeticId });
    hapticsMedium();
    applyState(result);
    setBusy(null);
  };

  const cosmetics = MONET?.cosmetics || [];
  const owned = g.cosmetics || [];

  // Find closest-to-complete locked achievement
  const nextMilestone = ACHIEVEMENTS
    .filter(a => !earned[a.id] && a.progress)
    .map(a => {
      const p = a.progress(g);
      return { ...a, pct: p.target > 0 ? p.current / p.target : 0, current: p.current, target: p.target };
    })
    .sort((a, b) => b.pct - a.pct)[0] || null;

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

      {/* Next Milestone */}
      {nextMilestone && (
        <div className="card" style={{ borderLeft: '3px solid var(--gold)' }}>
          <div className="card-title" style={{ fontSize: 12, color: 'var(--gold)' }}>Next Milestone</div>
          <div className="row-between mb-4">
            <span className="font-bold text-sm">
              <span style={{ marginRight: 6 }}>{nextMilestone.icon}</span>
              {nextMilestone.title}
            </span>
            <span className="text-gold text-xs font-bold">+{nextMilestone.coins} TC</span>
          </div>
          <div className="text-xs text-dim mb-4">{nextMilestone.desc}</div>
          <div className="progress-bar mb-4" style={{ height: 6 }}>
            <div className="progress-fill" style={{ width: `${Math.round(nextMilestone.pct * 100)}%`, background: 'var(--gold)' }} />
          </div>
          <div className="text-xs text-dim" style={{ textAlign: 'right' }}>
            {typeof nextMilestone.current === 'number' && nextMilestone.current % 1 !== 0
              ? nextMilestone.current.toFixed(1)
              : nextMilestone.current} / {nextMilestone.target}
            {' '}({Math.round(nextMilestone.pct * 100)}%)
          </div>
        </div>
      )}

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
          const prog = !unlocked && ach.progress ? ach.progress(g) : null;
          const pct = prog && prog.target > 0 ? Math.round((prog.current / prog.target) * 100) : 0;
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
              {!unlocked && prog && (
                <div className="progress-bar" style={{ height: 3, marginBottom: 4 }}>
                  <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--gold)' }} />
                </div>
              )}
              <div className="text-xs text-gold font-bold">
                {!unlocked && prog ? `${pct}% \u00B7 ` : ''}+{ach.coins} TC
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
