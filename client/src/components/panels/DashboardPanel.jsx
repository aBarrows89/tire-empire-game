import React from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { fmt } from '@shared/helpers/format.js';
import { TIRES } from '@shared/constants/tires.js';
import { getWealth } from '@shared/helpers/wealth.js';
import { getInv, getCap } from '@shared/helpers/inventory.js';
import VinnieTip from '../VinnieTip.jsx';

export default function DashboardPanel() {
  const { state } = useGame();
  const g = state.game;

  const inv = getInv(g);
  const cap = getCap(g);
  const pct = cap > 0 ? Math.round((inv / cap) * 100) : 0;

  return (
    <>
      <VinnieTip />
      <div className="card">
        <div className="card-title">This Week</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Revenue</span>
          <span className="font-bold text-green">${fmt(g.weekRev)}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Profit</span>
          <span className={`font-bold ${g.weekProfit >= 0 ? 'text-green' : 'text-red'}`}>
            ${fmt(g.weekProfit)}
          </span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Tires Sold</span>
          <span className="font-bold">{g.weekSold}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Empire</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Wealth</span>
          <span className="font-bold text-gold">${fmt(getWealth(g))}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Total Revenue</span>
          <span className="font-bold">${fmt(g.totalRev)}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Shops</span>
          <span className="font-bold">{g.locations.length}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">TireCoins</span>
          <span className="font-bold text-gold">{g.tireCoins || 0}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Inventory ({inv}/{cap})</div>
        <div className="progress-bar mb-4">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        {Object.entries(TIRES).map(([k, t]) => {
          const qty = g.inventory[k] || 0;
          if (qty === 0) return null;
          return (
            <div key={k} className="row-between text-sm mb-4">
              <span>{t.n}</span>
              <span className="font-bold">{qty}</span>
            </div>
          );
        })}
        {inv === 0 && <div className="text-sm text-dim">No tires in stock. Source some!</div>}
      </div>

      {(g.log || []).length > 0 && (
        <div className="card">
          <div className="card-title">Events</div>
          {g.log.map((msg, i) => (
            <div key={i} className="text-sm mb-4">{msg}</div>
          ))}
        </div>
      )}
    </>
  );
}
