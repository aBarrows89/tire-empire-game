import React, { useRef } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { TIRES } from '@shared/constants/tires.js';
import { postAction } from '../../api/client.js';

export default function PricingPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const timers = useRef({});

  const setPrice = (tire, price) => {
    clearTimeout(timers.current[tire]);
    timers.current[tire] = setTimeout(async () => {
      await postAction('setPrice', { tire, price: Number(price) });
      refreshState();
    }, 400);
  };

  // Only show tire types the player has in inventory or that are "used" (bootstrap phase)
  const hasTires = (k) => (g.inventory[k] || 0) > 0;
  const isUsed = (k) => TIRES[k].used;
  const hasAnyNewTires = Object.keys(TIRES).some(k => !TIRES[k].used && hasTires(k));

  // Show used tires always, new tires only if player has them
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

        return (
          <div key={k} className="card" style={qty === 0 ? { opacity: 0.5 } : {}}>
            <div className="row-between mb-4">
              <span className="font-bold text-sm">{t.n}</span>
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
              min={t.lo}
              max={t.hi}
              defaultValue={price}
              onChange={(e) => setPrice(k, e.target.value)}
            />
            <div className="row-between text-xs text-dim mt-8">
              <span>${t.lo}</span>
              <span>${t.hi}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}
