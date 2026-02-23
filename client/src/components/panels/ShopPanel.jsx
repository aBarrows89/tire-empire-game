import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { CITIES } from '@shared/constants/cities.js';
import { shopCost } from '@shared/constants/shop.js';
import { STATE_GRID, GRID_ROWS, GRID_COLS } from '@shared/constants/stateGrid.js';
import { SERVICES } from '@shared/constants/services.js';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { getLocInv, getLocCap } from '@shared/helpers/inventory.js';
import { postAction, API_BASE } from '../../api/client.js';

export default function ShopPanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [aiCounts, setAiCounts] = useState({});

  useEffect(() => {
    fetch(`${API_BASE}/market/cities`)
      .then(r => r.json())
      .then(data => setAiCounts(data))
      .catch(() => {});
  }, [g.week]);

  // Pre-compute per-state stats
  const stateStats = useMemo(() => {
    const stats = {};
    for (const city of CITIES) {
      if (!stats[city.state]) stats[city.state] = { cities: 0, totalDem: 0, totalSat: 0, totalMx: 0, hasShop: false };
      const s = stats[city.state];
      s.cities++;
      s.totalDem += city.dem;
      s.totalMx += city.mx;
      s.totalSat += (aiCounts[city.id] || 0);
      if (g.locations.some(l => l.cityId === city.id)) s.hasShop = true;
    }
    return stats;
  }, [aiCounts, g.locations]);

  const open = async (cityId) => {
    setBusy(cityId);
    const res = await postAction('openShop', { cityId });
    if (res.ok) refreshState();
    setBusy(null);
  };

  // Cities for the selected state
  const stateCities = selectedState
    ? CITIES.filter(c => c.state === selectedState).sort((a, b) => b.dem - a.dem)
    : [];

  // Tile color: green = high opportunity, gray = saturated
  const getTileColor = (abbrev) => {
    const s = stateStats[abbrev];
    if (!s) return 'var(--border)';
    const satPct = s.totalMx > 0 ? s.totalSat / s.totalMx : 0;
    if (satPct > 0.8) return '#3a3a3a';
    if (satPct > 0.6) return '#5a5a3a';
    if (satPct > 0.4) return '#4a6a3a';
    return '#3a7a4a';
  };

  return (
    <>
      {g.locations.length > 0 && (
        <div className="card">
          <div className="card-title">Your Shops ({g.locations.length})</div>
          {g.locations.map((loc, i) => {
            const city = CITIES.find(c => c.id === loc.cityId);
            const competitors = aiCounts[loc.cityId] || 0;
            const locInv = getLocInv(loc);
            const locCap = getLocCap(loc);
            return (
              <div key={i} style={{ borderBottom: i < g.locations.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: 6, marginBottom: 6 }}>
                <div className="row-between text-sm">
                  <span className="font-bold">{city?.name}, {city?.state}</span>
                  <span className="text-dim text-xs">Dem: {city?.dem}</span>
                </div>
                <div className="row-between text-xs text-dim">
                  <span>{competitors} competitor{competitors !== 1 ? 's' : ''}</span>
                  <span className={locInv >= locCap ? 'text-red font-bold' : ''}>Inv: {locInv}/{locCap}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {g.locations.length > 0 && (
        <div className="card">
          <div className="card-title">Disposal Fee</div>
          <div className="text-xs text-dim mb-4">
            Fee charged to customers for taking their old tires. High fee = fewer take-offs + rep penalty. Low/free = more used inventory + rep boost.
          </div>
          <div className="row-between mb-4">
            <span className="text-sm">Current fee</span>
            <span className="font-bold text-accent">${g.disposalFee ?? 3}/tire</span>
          </div>
          <input
            type="range"
            min={0}
            max={15}
            value={g.disposalFee ?? 3}
            onChange={async (e) => {
              await postAction('setDisposalFee', { fee: Number(e.target.value) });
              refreshState();
            }}
          />
          <div className="row-between text-xs text-dim mt-8">
            <span>$0 (max take-offs)</span>
            <span>$15 (max revenue)</span>
          </div>
        </div>
      )}

      {g.locations.length > 0 && g.staff.techs > 0 && (
        <div className="card">
          <div className="card-title">Shop Services</div>
          <div className="text-xs text-dim mb-4">
            Walk-in labor revenue. Techs handle services with spare capacity after tire sales.
          </div>
          {g.weekServiceJobs > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">This week</span>
              <span className="font-bold text-green">
                {g.weekServiceJobs} jobs &middot; ${fmt(g.weekServiceRev)}
              </span>
            </div>
          )}
          {Object.entries(SERVICES).map(([k, svc]) => {
            const price = (g.servicePrices && g.servicePrices[k]) || svc.price;
            return (
              <div key={k} className="row-between mb-4" style={{ alignItems: 'center' }}>
                <span className="text-sm">{svc.n}</span>
                <div className="row gap-8" style={{ alignItems: 'center' }}>
                  <span className="text-xs text-dim">${svc.price} base</span>
                  <input
                    type="number"
                    className="autoprice-offset"
                    value={price}
                    min={Math.round(svc.price * 0.5)}
                    max={Math.round(svc.price * 3)}
                    onChange={async (e) => {
                      await postAction('setServicePrice', { service: k, price: Number(e.target.value) });
                      refreshState();
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="card-title">US Market Map</div>
        <div className="text-xs text-dim mb-4">Tap a state to browse cities. Green = opportunity, gray = saturated.</div>
        <div className="state-grid">
          {STATE_GRID.map(([row, col, abbrev]) => {
            const s = stateStats[abbrev];
            const hasShop = s?.hasShop;
            return (
              <button
                key={abbrev}
                className={`state-tile${selectedState === abbrev ? ' state-tile-active' : ''}${hasShop ? ' state-tile-owned' : ''}`}
                style={{
                  gridRow: row + 1,
                  gridColumn: col + 1,
                  background: getTileColor(abbrev),
                }}
                onClick={() => setSelectedState(selectedState === abbrev ? null : abbrev)}
              >
                {abbrev}
              </button>
            );
          })}
        </div>
      </div>

      {selectedState && stateCities.length > 0 && (
        <div className="card">
          <div className="card-title">{selectedState} Cities</div>
          {stateCities.map(city => {
            const cost = shopCost(city);
            const cantAfford = g.cash < cost;
            const lowRep = g.reputation < 15;
            const hasShop = g.locations.some(l => l.cityId === city.id);
            const competitors = aiCounts[city.id] || 0;
            const satPct = city.mx > 0 ? Math.round((competitors / city.mx) * 100) : 0;
            const satColor = satPct > 80 ? 'text-red' : satPct > 50 ? 'text-gold' : 'text-green';

            return (
              <div key={city.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8 }}>
                <div className="row-between mb-4">
                  <span className="font-bold text-sm">{city.name}</span>
                  <span className="text-xs text-dim">{city.size}</span>
                </div>
                <div className="row gap-8 text-xs text-dim mb-4" style={{ flexWrap: 'wrap' }}>
                  <span>Pop: {city.pop}K</span>
                  <span>Dem: {city.dem}</span>
                  <span>Cost: ${fmt(cost)}</span>
                  {city.win > 0.5 && <span>Win: {city.win}x</span>}
                  {city.agPct && <span>AG: {Math.round(city.agPct * 100)}%</span>}
                </div>
                <div className="row-between text-xs mb-4">
                  <span className="text-dim">Shops: {competitors}/{city.mx}</span>
                  <span className={`font-bold ${satColor}`}>{satPct}% saturated</span>
                </div>
                {hasShop ? (
                  <div className="text-sm text-green font-bold">You have a shop here</div>
                ) : (
                  <button
                    className="btn btn-full btn-sm btn-green"
                    disabled={cantAfford || lowRep || busy === city.id}
                    onClick={() => open(city.id)}
                  >
                    {lowRep ? `Need Rep 15 (yours: ${g.reputation.toFixed(1)})` : cantAfford ? `Need $${fmt(cost)}` : `Open Shop ($${fmt(cost)})`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
