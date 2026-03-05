import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { CITIES } from '@shared/constants/cities.js';
import USMap from '../USMap.jsx';
import RevenueChart from '../RevenueChart.jsx';
import { getInv } from '@shared/helpers/inventory.js';
import { fmt } from '@shared/helpers/format.js';

/**
 * Premium Map panel — US cartogram, revenue chart, inventory heatmap.
 * Non-premium players see blurred/locked version.
 */
export default function MapPanel() {
  const { state } = useGame();
  const g = state.game;
  const [selectedState, setSelectedState] = useState(null);
  const [mapMode, setMapMode] = useState('shops'); // shops | revenue | inventory

  const isPremium = g.isPremium;

  // Build state-level aggregation from player's locations
  const stateData = useMemo(() => {
    const data = {};
    for (const loc of (g.locations || [])) {
      const city = CITIES.find(c => c.id === loc.cityId);
      if (!city) continue;
      const st = city.state;
      if (!data[st]) data[st] = { shops: 0, rev: 0, inv: 0, cities: [] };
      data[st].shops++;
      data[st].rev += loc.weeklyRev || 0;
      // Count inventory at this location
      const locInv = Object.values(loc.inventory || {}).reduce((sum, qty) => sum + (qty || 0), 0);
      data[st].inv += locInv;
      data[st].cities.push({
        name: city.name,
        id: city.id,
        shopName: loc.name || city.name,
        rev: loc.weeklyRev || 0,
        inv: locInv,
        staff: (loc.staff || []).length,
        loyalty: loc.loyalty || 0,
      });
    }
    // Also add van inventory to home state if applicable
    return data;
  }, [g.locations]);

  // Cities in selected state
  const stateCities = useMemo(() => {
    if (!selectedState) return [];
    return CITIES.filter(c => c.state === selectedState);
  }, [selectedState]);

  const playerCitiesInState = useMemo(() => {
    if (!selectedState || !stateData[selectedState]) return [];
    return stateData[selectedState].cities;
  }, [selectedState, stateData]);

  return (
    <div className="panel">
      <h2 className="panel-title">{'\u{1F5FA}'} Empire Map</h2>

      {!isPremium && (
        <div className="premium-lock-banner">
          <span>{'\u{1F512}'} Premium Feature</span>
          <p>Upgrade to see your full empire map, revenue charts, and inventory heatmap.</p>
          <button className="btn btn-sm btn-gold" onClick={() => window.dispatchEvent(new CustomEvent('openPremiumModal'))}>
            Unlock Premium
          </button>
        </div>
      )}

      <div className={!isPremium ? 'map-blurred' : ''}>
        {/* Mode toggle */}
        <div className="map-mode-toggle">
          {[
            { id: 'shops', label: 'Shops', icon: '\u{1F3EA}' },
            { id: 'revenue', label: 'Revenue', icon: '\u{1F4B0}' },
            { id: 'inventory', label: 'Inventory', icon: '\u{1F4E6}' },
          ].map(m => (
            <button
              key={m.id}
              className={`map-mode-btn${mapMode === m.id ? ' active' : ''}`}
              onClick={() => setMapMode(m.id)}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* US Cartogram */}
        <div className="map-container">
          <USMap
            stateData={stateData}
            mode={mapMode}
            onTap={setSelectedState}
            selected={selectedState}
          />
        </div>

        {/* Selected state drill-down */}
        {selectedState && (
          <div className="map-drilldown card">
            <h3 className="map-drilldown-title">{selectedState}</h3>
            {playerCitiesInState.length > 0 ? (
              <div className="map-shop-list">
                {playerCitiesInState.map((c, i) => (
                  <div key={i} className="map-shop-row">
                    <div className="map-shop-name">{c.shopName}</div>
                    <div className="map-shop-stats">
                      <span>{fmt(c.rev)}/day</span>
                      <span>{c.inv} tires</span>
                      <span>{c.staff} staff</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="map-drilldown-empty">
                <p>No shops in {selectedState}</p>
                <p className="text-dim" style={{ fontSize: 11 }}>
                  {stateCities.length} {stateCities.length === 1 ? 'city' : 'cities'} available:
                </p>
                <div className="map-city-chips">
                  {stateCities.slice(0, 8).map(c => (
                    <span key={c.id} className="map-city-chip">
                      {c.name} ({c.pop}k)
                    </span>
                  ))}
                  {stateCities.length > 8 && <span className="map-city-chip">+{stateCities.length - 8} more</span>}
                </div>
              </div>
            )}
            <button className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={() => setSelectedState(null)}>
              Close
            </button>
          </div>
        )}

        {/* Revenue Chart */}
        <div className="card" style={{ marginTop: 12 }}>
          <h3 className="card-title">{'\u{1F4C8}'} Revenue by Channel</h3>
          <RevenueChart data={g.revHistory || []} />
        </div>

        {/* Empire Summary */}
        <div className="card" style={{ marginTop: 12 }}>
          <h3 className="card-title">{'\u{1F30E}'} Empire Summary</h3>
          <div className="map-summary-grid">
            <div className="map-summary-item">
              <div className="map-summary-val">{(g.locations || []).length}</div>
              <div className="map-summary-label">Shops</div>
            </div>
            <div className="map-summary-item">
              <div className="map-summary-val">{Object.keys(stateData).length}</div>
              <div className="map-summary-label">States</div>
            </div>
            <div className="map-summary-item">
              <div className="map-summary-val">{fmt(g.dayRev || 0)}</div>
              <div className="map-summary-label">Daily Rev</div>
            </div>
            <div className="map-summary-item">
              <div className="map-summary-val">{getInv(g)}</div>
              <div className="map-summary-label">Total Inv</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
