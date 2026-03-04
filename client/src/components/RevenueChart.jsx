import React, { useMemo } from 'react';

const CHANNEL_COLORS = {
  shops: '#4caf50',
  van: '#ff9800',
  flea: '#9c27b0',
  ecom: '#2196f3',
  wholesale: '#00bcd4',
  gov: '#f44336',
  services: '#ffeb3b',
  carMeets: '#e91e63',
  factoryWholesale: '#8bc34a',
};

const CHANNEL_LABELS = {
  shops: 'Shops',
  van: 'Van',
  flea: 'Flea Market',
  ecom: 'E-Commerce',
  wholesale: 'Wholesale',
  gov: 'Government',
  services: 'Services',
  carMeets: 'Car Meets',
  factoryWholesale: 'Factory',
};

const W = 340;
const H = 160;
const PAD_L = 40;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 20;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

/**
 * Multi-line SVG revenue chart.
 * @param {Array} data — [{ day, shops, van, flea, ecom, ... }]
 */
export default function RevenueChart({ data = [] }) {
  const { lines, maxRev, channels } = useMemo(() => {
    if (!data.length) return { lines: {}, maxRev: 1, channels: [] };

    // Find which channels have any data
    const channelSet = new Set();
    let maxR = 1;
    for (const entry of data) {
      for (const [k, v] of Object.entries(entry)) {
        if (k === 'day') continue;
        if (v > 0) channelSet.add(k);
        if (v > maxR) maxR = v;
      }
    }

    const chs = [...channelSet];
    const ls = {};
    for (const ch of chs) {
      ls[ch] = data.map((entry, i) => {
        const x = PAD_L + (i / Math.max(data.length - 1, 1)) * PLOT_W;
        const y = PAD_T + PLOT_H - (((entry[ch] || 0) / maxR) * PLOT_H);
        return `${x},${y}`;
      }).join(' ');
    }

    return { lines: ls, maxRev: maxR, channels: chs };
  }, [data]);

  if (!data.length) {
    return <div className="chart-empty">No revenue data yet</div>;
  }

  // Y-axis labels
  const yLabels = [0, Math.round(maxRev / 2), Math.round(maxRev)];

  return (
    <div className="rev-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="rev-chart-svg">
        {/* Grid lines */}
        {yLabels.map((val, i) => {
          const y = PAD_T + PLOT_H - (val / maxRev) * PLOT_H;
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
              <text x={PAD_L - 4} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize={8}>
                ${val >= 1000 ? `${Math.round(val / 1000)}k` : val}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {data.length > 1 && (
          <>
            <text x={PAD_L} y={H - 4} fill="rgba(255,255,255,0.35)" fontSize={7}>
              Day {data[0].day}
            </text>
            <text x={W - PAD_R} y={H - 4} textAnchor="end" fill="rgba(255,255,255,0.35)" fontSize={7}>
              Day {data[data.length - 1].day}
            </text>
          </>
        )}

        {/* Revenue lines */}
        {channels.map(ch => (
          <polyline
            key={ch}
            points={lines[ch]}
            fill="none"
            stroke={CHANNEL_COLORS[ch] || '#fff'}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="rev-chart-legend">
        {channels.map(ch => (
          <span key={ch} className="rev-legend-item">
            <span className="rev-legend-dot" style={{ background: CHANNEL_COLORS[ch] || '#fff' }} />
            {CHANNEL_LABELS[ch] || ch}
          </span>
        ))}
      </div>
    </div>
  );
}
