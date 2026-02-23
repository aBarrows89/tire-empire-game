import React, { useState, useRef } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction } from '../../api/client.js';

export default function PricingPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const timers = useRef({});

  const setPrice = (tire, price) => {
    // Debounce API calls
    clearTimeout(timers.current[tire]);
    timers.current[tire] = setTimeout(async () => {
      await postAction('setPrice', { tire, price: Number(price) });
      refreshState();
    }, 400);
  };

  return (
    <>
      <div className="card">
        <div className="card-title">Set Prices</div>
        <div className="text-sm text-dim">Adjust your selling prices per tire type.</div>
      </div>

      {Object.entries(TIRES).map(([k, t]) => {
        const qty = g.inventory[k] || 0;
        const price = g.prices[k] || t.def;
        const cost = Math.round((t.bMin + t.bMax) / 2);
        const margin = price - cost;

        return (
          <div key={k} className="card">
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
