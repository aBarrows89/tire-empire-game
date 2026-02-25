import React, { useEffect } from 'react';

export default function AchievementToast({ achievements, onDismiss }) {
  useEffect(() => {
    if (!achievements || achievements.length === 0) return;
    const timer = setTimeout(() => {
      if (onDismiss) onDismiss();
    }, 3000);
    return () => clearTimeout(timer);
  }, [achievements, onDismiss]);

  if (!achievements || achievements.length === 0) return null;

  return (
    <div
      className="achievement-toast"
      onClick={onDismiss}
      style={{
        position: 'fixed',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        zIndex: 200,
        padding: '12px 16px',
        animation: 'slideDown .35s ease-out',
      }}
    >
      {achievements.map((ach, i) => (
        <div
          key={i}
          style={{
            background: 'linear-gradient(135deg, #3a2a00, #5a4000)',
            border: '1px solid var(--gold)',
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: i < achievements.length - 1 ? 6 : 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 28 }}>{'\uD83C\uDFC6'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gold)' }}>
              {ach.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              +{ach.reward} TireCoins
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
