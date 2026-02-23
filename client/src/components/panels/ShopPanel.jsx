import React, { useState, useEffect } from 'react';
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
  const [aiCounts, setAiCounts] = useState({});

  // Fetch AI shop counts per city on mount
  useEffect(() => {
    fetch('/api/market/cities')
      .then(r => r.json())
      .then(data => setAiCounts(data))
      .catch(() => {});
  }, [g.week]);

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
            const competitors = aiCounts[loc.cityId] || 0;
            return (
              <div key={i} className="mb-4">
                <div className="row-between text-sm">
                  <span className="font-bold">{city?.name}, {city?.state}</span>
                  <span className="text-dim text-xs">Dem: {city?.dem}</span>
                </div>
                <div className="text-xs text-dim">
                  {competitors} competitor{competitors !== 1 ? 's' : ''} in market
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="card-title">Open a Shop</div>
        <div className="text-sm text-dim mb-4">
          Cost: ${fmt(SHOP_BASE)} + ${fmt(SHOP_MO)}/mo rent.
          Pick a city with good demand and fewer competitors.
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
        const competitors = aiCounts[city.id] || 0;
        const satPct = city.mx > 0 ? Math.round((competitors / city.mx) * 100) : 0;
        const satColor = satPct > 80 ? 'text-red' : satPct > 50 ? 'text-gold' : 'text-green';

        return (
          <div key={city.id} className="card">
            <div className="row-between mb-4">
              <span className="font-bold text-sm">{city.name}, {city.state}</span>
              <span className="text-xs text-dim">{city.size}</span>
            </div>
            <div className="row gap-8 text-xs text-dim mb-4" style={{ flexWrap: 'wrap' }}>
              <span>Pop: {city.pop}K</span>
              <span>Dem: {city.dem}</span>
              <span>Cost: {city.cost}x</span>
              {city.win > 0.5 && <span>Win: {city.win}x</span>}
              {city.agPct && <span>AG: {Math.round(city.agPct * 100)}%</span>}
            </div>
            <div className="row-between text-xs mb-4">
              <span className="text-dim">
                Shops: {competitors}/{city.mx}
              </span>
              <span className={`font-bold ${satColor}`}>
                {satPct}% saturated
              </span>
            </div>
            {hasShop ? (
              <div className="text-sm text-green font-bold">You have a shop here</div>
            ) : (
              <button
                className="btn btn-full btn-sm btn-green"
                disabled={cantAfford || lowRep || busy === city.id}
                onClick={() => open(city.id)}
              >
                {lowRep ? `Need Rep 15 (yours: ${g.reputation.toFixed(1)})` : cantAfford ? `Need $${fmt(SHOP_BASE)}` : `Open Shop ($${fmt(SHOP_BASE)})`}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
