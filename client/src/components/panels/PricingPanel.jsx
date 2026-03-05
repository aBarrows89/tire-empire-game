import React, { useRef, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { TIRES } from '@shared/constants/tires.js';
import { postAction } from '../../api/client.js';
import { hapticsLight } from '../../api/haptics.js';

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

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(t => clearTimeout(t));
    };
  }, []);

  const hasAnalyst = (g.staff.pricingAnalyst || 0) > 0;

  const setPrice = (tire, price) => {
    clearTimeout(timers.current[tire]);
    timers.current[tire] = setTimeout(async () => {
      hapticsLight();
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

  // Calculate real cost from supplier pricing multipliers × tire base cost
  const getAvgCost = (k, t) => {
    const baseCost = Math.round((t.bMin + t.bMax) / 2);
    // _supplierPrices stores MULTIPLIERS (0.70-1.35), not absolute prices
    const supPrices = g._supplierPrices || {};
    let mults = [];
    for (const [, prices] of Object.entries(supPrices)) {
      if (prices[k] && prices[k] > 0) mults.push(prices[k]);
    }
    if (mults.length > 0) {
      const avgMult = mults.reduce((a, b) => a + b, 0) / mults.length;
      return Math.round(baseCost * avgMult);
    }
    return baseCost;
  };

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
        const cost = getAvgCost(k, t);
        const margin = price - cost;
        const marginPct = cost > 0 ? Math.round((margin / cost) * 100) : 0;
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
              <span className="text-xs text-dim">Avg cost: ${cost}</span>
              <span className={`font-bold ${margin >= 0 ? 'text-green' : 'text-red'}`}>
                ${price} <span className="text-xs">({margin >= 0 ? '+' : ''}{margin} / {marginPct}%)</span>
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

            {/* Market Insight — Price Advisor */}
            <div style={{
              marginTop: 8, padding: '6px 8px', borderRadius: 6,
              background: diff > 15 ? 'rgba(239,83,80,0.08)' : diff < -10 ? 'rgba(66,165,245,0.08)' : 'rgba(102,187,106,0.08)',
              border: `1px solid ${diff > 15 ? 'rgba(239,83,80,0.2)' : diff < -10 ? 'rgba(66,165,245,0.2)' : 'rgba(102,187,106,0.2)'}`,
            }}>
              <div className="text-xs font-bold" style={{
                color: diff > 15 ? 'var(--red)' : diff < -10 ? '#42a5f5' : 'var(--green)',
                marginBottom: 2,
              }}>
                {diff > 15 ? 'Overpriced' : diff < -10 ? 'Undercutting' : 'Competitive'}
              </div>
              <div className="text-xs text-dim">
                Market avg: ${mktAvg} {'\u00B7'} Your price: {diff > 0 ? `+$${diff} above` : diff < 0 ? `-$${Math.abs(diff)} below` : 'at avg'}
              </div>
              <div className="text-xs text-dim">
                Competitor range: ${Math.round(mktAvg * 0.85)}-${Math.round(mktAvg * 1.15)}
              </div>
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
