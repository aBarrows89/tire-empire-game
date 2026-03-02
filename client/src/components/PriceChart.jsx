import React from 'react';

/**
 * SVG sparkline / line chart for stock prices.
 * @param {{ data: number[], width?: number, height?: number, color?: string }} props
 */
export default function PriceChart({ data, width = 200, height = 40, color }) {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = padding + (1 - (v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const isUp = data[data.length - 1] >= data[0];
  const lineColor = color || (isUp ? '#4CAF50' : '#f44336');

  // Gradient fill
  const fillPoints = `${padding},${height - padding} ${points.join(' ')} ${width - padding},${height - padding}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`grad-${isUp ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#grad-${isUp ? 'up' : 'down'})`} />
      <polyline points={points.join(' ')} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
