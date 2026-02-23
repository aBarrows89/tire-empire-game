import React, { useState } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { CITIES } from '@shared/constants/cities.js';
import { SHOP_BASE, SHOP_MO } from '@shared/constants/shop.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction } from '../../api/client.js';

export default function ShopPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);
  const [stateFilter, setStateFilter] = useState('');

  const open = async (cityId) => {
    setBusy(cityId);
    const res = await postAction('openShop', { cityId });
    if (res.ok) refreshState();
    setBusy(null);
  };

  const states = [...new Set(CITIES.map(c => c.state))].sort();
  const filtered = stateFilter
    ? CITIES.filter(c => c.state === stateFilter)
    : CITIES.slice(0, 20);

  return (
    <>
      {g.locations.length > 0 && (
        <div className="card">
          <div className="card-title">Your Shops ({g.locations.length})</div>
          {g.locations.map((loc, i) => {
            const city = CITIES.find(c => c.id === loc.cityId);
            return (
              <div key={i} className="row-between text-sm mb-4">
                <span>{city?.name}, {city?.state}</span>
                <span className="text-dim">Dem: {city?.dem}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="card-title">Open a Shop</div>
        <div className="text-sm text-dim mb-4">
          Cost: ${fmt(SHOP_BASE)} + ${fmt(SHOP_MO)}/mo · Need Rep 15+
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          style={{
            width: '100%', padding: 8, marginBottom: 8, borderRadius: 6,
            background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
            minHeight: 44
          }}
        >
          <option value="">Select a state...</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {filtered.map(city => {
        const cantAfford = g.cash < SHOP_BASE;
        const lowRep = g.reputation < 15;
        const hasShop = g.locations.some(l => l.cityId === city.id);

        return (
          <div key={city.id} className="card">
            <div className="row-between mb-4">
              <span className="font-bold text-sm">{city.name}, {city.state}</span>
              <span className="text-xs text-dim">{city.size}</span>
            </div>
            <div className="row gap-8 text-xs text-dim mb-4">
              <span>Pop: {city.pop}K</span>
              <span>Dem: {city.dem}</span>
              <span>Cost: {city.cost}x</span>
              <span>Win: {city.win}x</span>
            </div>
            {hasShop ? (
              <div className="text-sm text-green">You have a shop here</div>
            ) : (
              <button
                className="btn btn-full btn-sm btn-green"
                disabled={cantAfford || lowRep || busy === city.id}
                onClick={() => open(city.id)}
              >
                {lowRep ? 'Need Rep 15' : cantAfford ? `Need $${fmt(SHOP_BASE)}` : `Open Shop ($${fmt(SHOP_BASE)})`}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
