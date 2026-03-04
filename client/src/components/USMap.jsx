import React, { useMemo } from 'react';
import { STATE_GRID, GRID_ROWS, GRID_COLS } from '@shared/constants/stateGrid.js';

const CELL = 32;
const GAP = 3;
const PAD = 4;

/**
 * SVG US cartogram. Each state is a colored square.
 * @param {Object} stateData — { [abbrev]: { shops, rev, inv } }
 * @param {string} mode — 'shops' | 'revenue' | 'inventory'
 * @param {function} onTap — (abbrev) => void
 * @param {string} selected — currently selected state abbrev
 */
export default function USMap({ stateData = {}, mode = 'shops', onTap, selected }) {
  const width = GRID_COLS * (CELL + GAP) + PAD * 2;
  const height = GRID_ROWS * (CELL + GAP) + PAD * 2;

  const maxVal = useMemo(() => {
    let max = 1;
    for (const d of Object.values(stateData)) {
      const v = mode === 'shops' ? (d.shops || 0) : mode === 'revenue' ? (d.rev || 0) : (d.inv || 0);
      if (v > max) max = v;
    }
    return max;
  }, [stateData, mode]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="us-map-svg"
      style={{ width: '100%', maxWidth: 420, display: 'block', margin: '0 auto' }}
    >
      {STATE_GRID.map(([row, col, abbrev]) => {
        const x = PAD + col * (CELL + GAP);
        const y = PAD + row * (CELL + GAP);
        const d = stateData[abbrev] || {};
        const val = mode === 'shops' ? (d.shops || 0) : mode === 'revenue' ? (d.rev || 0) : (d.inv || 0);
        const intensity = val > 0 ? 0.25 + 0.75 * (val / maxVal) : 0;
        const hasShop = (d.shops || 0) > 0;
        const isSel = selected === abbrev;

        let fill;
        if (val === 0) {
          fill = 'rgba(255,255,255,0.06)';
        } else if (mode === 'inventory') {
          // Green → yellow → red
          const ratio = val / maxVal;
          if (ratio > 0.5) fill = `rgba(76,175,80,${intensity})`;
          else if (ratio > 0.2) fill = `rgba(255,193,7,${intensity})`;
          else fill = `rgba(239,83,80,${intensity})`;
        } else {
          fill = `rgba(76,175,80,${intensity})`;
        }

        return (
          <g key={abbrev} onClick={() => onTap && onTap(abbrev)} style={{ cursor: 'pointer' }}>
            <rect
              x={x} y={y} width={CELL} height={CELL} rx={4}
              fill={fill}
              stroke={isSel ? 'var(--gold)' : hasShop ? 'rgba(76,175,80,0.6)' : 'rgba(255,255,255,0.1)'}
              strokeWidth={isSel ? 2 : hasShop ? 1.5 : 0.5}
            />
            {hasShop && (
              <rect
                x={x} y={y} width={CELL} height={CELL} rx={4}
                fill="none"
                stroke="rgba(76,175,80,0.4)"
                strokeWidth={1}
                className="map-glow"
              />
            )}
            <text
              x={x + CELL / 2} y={y + CELL / 2 + 1}
              textAnchor="middle" dominantBaseline="middle"
              fill={val > 0 ? '#fff' : 'rgba(255,255,255,0.35)'}
              fontSize={9} fontWeight={600} fontFamily="monospace"
            >
              {abbrev}
            </text>
            {(d.shops || 0) > 0 && (
              <text
                x={x + CELL - 3} y={y + 8}
                textAnchor="end"
                fill="var(--gold)" fontSize={7} fontWeight={700}
              >
                {d.shops}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
