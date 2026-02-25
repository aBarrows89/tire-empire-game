import React from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { getInv } from '@shared/helpers/inventory.js';

export default function SellPanel() {
  const { state } = useGame();
  const g = state.game;
  const inv = getInv(g);

  return (
    <>
      <div className="card">
        <div className="card-title">
          {g.locations.length > 0 ? 'Sales Summary' : 'Van Sales'}
        </div>
        {g.locations.length === 0 ? (
          <div className="text-sm text-dim">
            You're selling from your van. Sales happen automatically each day
            based on your inventory, prices, and reputation.
          </div>
        ) : (
          <div className="text-sm text-dim">
            Your {g.locations.length} shop{g.locations.length > 1 ? 's' : ''} sell
            automatically each day. Hire techs and sales staff to increase capacity.
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Today</div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Revenue</span>
          <span className="text-green font-bold">${fmt(g.dayRev || g.weekRev || 0)}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Tires Sold</span>
          <span className="font-bold">{g.daySold || g.weekSold || 0}</span>
        </div>
        <div className="row-between mb-4">
          <span className="text-sm text-dim">Profit</span>
          <span className={`font-bold ${(g.dayProfit || g.weekProfit || 0) >= 0 ? 'text-green' : 'text-red'}`}>
            ${fmt(g.dayProfit || g.weekProfit || 0)}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Inventory ({inv} tires)</div>
        {Object.entries(TIRES).map(([k, t]) => {
          const qty = g.inventory[k] || 0;
          if (qty === 0) return null;
          const price = g.prices[k] || t.def;
          return (
            <div key={k} className="row-between text-sm mb-4">
              <span>{t.n} x{qty}</span>
              <span className="text-dim">@ ${price}</span>
            </div>
          );
        })}
        {inv === 0 && (
          <div className="text-sm text-dim">
            No tires to sell. Go to Source tab to buy some!
          </div>
        )}
      </div>

      {g.locations.length === 0 && g.cash >= 137500 && (
        <div className="card" style={{ borderColor: 'var(--gold)' }}>
          <div className="card-title text-gold">Ready to open a shop!</div>
          <div className="text-sm">
            You have enough cash for your first tire shop ($137.5K).
            Go to the Shops tab to pick a city!
          </div>
        </div>
      )}
    </>
  );
}
