import React from 'react';

function SkeletonLine({ width = '100%', height = 12, style }) {
  return (
    <div
      className="skeleton-shimmer"
      style={{
        width,
        height,
        borderRadius: 4,
        background: 'var(--border)',
        ...style,
      }}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="card">
      <SkeletonLine width="40%" height={14} style={{ marginBottom: 8 }} />
      <SkeletonLine width="80%" style={{ marginBottom: 6 }} />
      <SkeletonLine width="60%" style={{ marginBottom: 6 }} />
      <SkeletonLine width="100%" height={36} style={{ borderRadius: 8 }} />
    </div>
  );
}

function SkeletonProfileCard() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '20px 12px' }}>
      <div
        className="skeleton-shimmer"
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--border)',
          margin: '0 auto 8px',
        }}
      />
      <SkeletonLine width="50%" height={18} style={{ margin: '0 auto 6px' }} />
      <SkeletonLine width="35%" height={12} style={{ margin: '0 auto 16px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ background: 'var(--surface)', borderRadius: 8, padding: 10 }}>
            <SkeletonLine width="60%" height={20} style={{ margin: '0 auto 4px' }} />
            <SkeletonLine width="80%" height={10} style={{ margin: '0 auto' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonLeaderboardRow() {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SkeletonLine width={28} height={16} />
          <div>
            <SkeletonLine width={100} height={14} style={{ marginBottom: 4 }} />
            <SkeletonLine width={70} height={10} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <SkeletonLine width={60} height={14} style={{ marginBottom: 4, marginLeft: 'auto' }} />
          <SkeletonLine width={40} height={10} style={{ marginLeft: 'auto' }} />
        </div>
      </div>
    </div>
  );
}

export { SkeletonLine, SkeletonCard, SkeletonProfileCard, SkeletonLeaderboardRow };
