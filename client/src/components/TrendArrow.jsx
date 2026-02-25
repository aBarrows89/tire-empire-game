import React from 'react';

export default function TrendArrow({ current, previous }) {
  if (previous == null || current == null || current === previous) return null;

  const diff = current - previous;
  const pct = previous !== 0 ? Math.abs((diff / previous) * 100).toFixed(1) : '0.0';

  if (current > previous) {
    return <span className="text-green font-bold" style={{ fontSize: 12 }}>{'\u25B2'} +{pct}%</span>;
  }

  return <span className="text-red font-bold" style={{ fontSize: 12 }}>{'\u25BC'} -{pct}%</span>;
}
