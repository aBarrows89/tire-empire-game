import React, { useRef } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { TIRES } from '@shared/constants/tires.js';
import { postAction } from '../../api/client.js';

const STRATEGIES = [
  { key: 'off', label: 'Manual' },
  { key: 'undercut', label: 'Undercut $' },
  { key: 'above', label: 'Above $' },
  { key: 'match', label: 'Match Market' },
  { key: 'max', label: 'Max Margin' },
];

export default function PricingPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const timers = useRef({});

  const hasAnalyst = (g.staff.pricingAnalyst || 0) > 0;

  const setPrice = (tire, price) => {
    clearTimeout(timers.current[tire]);
    timers.current[tire] = setTimeout(async () => {
      await postAction('setPrice', { tire, price: Number(price) });
      refreshState();
    }, 400);
  };

  const setAutoPrice = async (tire, strategy, offset) => {
    await postAction('setAutoPrice', { tire, strategy, offset: Number(offset) || 0 });
    refreshState();
  };

  const hasTires = (k) => (g.inventory[k] || 0) > 0;
  const hasAnyNewTires = Object.keys(TIRES).some(k => !TIRES[k].used && hasTires(k));

  const visibleTires = Object.entries(TIRES).filter(([k, t]) => {
    if (t.used) return true;
    return hasTires(k) || hasAnyNewTires;
  });

  return (
    <>
      <div className="card">
        <div className="card-title">Set Prices</div>
        <div className="text-sm text-dim">
          Set your selling price for each tire type. The market average shifts each
          week with supply and demand. Price below average to sell faster, above for more profit.
        </div>
        {hasAnalyst && (
          <div className="text-xs text-green mt-8">
            Pricing Analyst on staff — auto-pricing available per tire.
          </div>
        )}
      </div>

      {visibleTires.map(([k, t]) => {
        const qty = g.inventory[k] || 0;
        const price = g.prices[k] || t.def;
        const cost = Math.round((t.bMin + t.bMax) / 2);
        const margin = price - cost;
        const mktAvg = (g.marketPrices && g.marketPrices[k]) || t.def;
        const diff = price - mktAvg;
        const diffLabel = diff > 5 ? 'Above avg' : diff < -5 ? 'Below avg' : 'At avg';
        const diffColor = diff > 5 ? 'text-red' : diff < -5 ? 'text-green' : 'text-dim';

        const ap = (g.autoPrice && g.autoPrice[k]) || { strategy: 'off', offset: 0 };
        const isAuto = hasAnalyst && ap.strategy !== 'off';

        return (
          <div key={k} className="card" style={qty === 0 ? { opacity: 0.5 } : {}}>
            <div className="row-between mb-4">
              <span className="font-bold text-sm">
                {t.n}
                {isAuto && <span className="auto-badge">AUTO</span>}
              </span>
              <span className="text-xs text-dim">Stock: {qty}</span>
            </div>
            <div className="row-between mb-4">
              <span className="text-xs text-dim">Cost ~${cost}</span>
              <span className={`font-bold ${margin >= 0 ? 'text-green' : 'text-red'}`}>
                ${price} ({margin >= 0 ? '+' : ''}{margin})
              </span>
            </div>
            <div className="row-between mb-4">
              <span className="text-xs text-dim">Market avg: ${mktAvg}</span>
              <span className={`text-xs font-bold ${diffColor}`}>{diffLabel}</span>
            </div>
            <input
              type="range"
              min={Math.min(t.lo, Math.floor((t.bMin + t.bMax) / 2 * 0.5))}
              max={t.hi}
              defaultValue={price}
              key={isAuto ? `auto-${price}` : `manual-${k}`}
              disabled={isAuto}
              onChange={(e) => setPrice(k, e.target.value)}
              style={isAuto ? { opacity: 0.3 } : {}}
            />
            <div className="row-between text-xs text-dim mt-8">
              <span>${t.lo}</span>
              <span>${t.hi}</span>
            </div>

            {hasAnalyst && (
              <div className="autoprice-row mt-8">
                <select
                  className="autoprice-select"
                  value={ap.strategy}
                  onChange={(e) => setAutoPrice(k, e.target.value, ap.offset)}
                >
                  {STRATEGIES.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
                {(ap.strategy === 'undercut' || ap.strategy === 'above') && (
                  <input
                    type="number"
                    className="autoprice-offset"
                    value={ap.offset || 0}
                    min={0}
                    step={0.25}
                    onChange={(e) => setAutoPrice(k, ap.strategy, e.target.value)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
