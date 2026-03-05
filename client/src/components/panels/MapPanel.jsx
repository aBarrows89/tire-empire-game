import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { CITIES } from '@shared/constants/cities.js';
import USMap from '../USMap.jsx';
import RevenueChart from '../RevenueChart.jsx';
import { getInv } from '@shared/helpers/inventory.js';
import { fmt } from '@shared/helpers/format.js';
import { TIRES } from '@shared/constants/tires.js';

export default function MapPanel() {
  const { state } = useGame();
  const g = state.game;
  const [selectedState, setSelectedState] = useState(null);
  const [mapMode, setMapMode] = useState('shops');
  const isPremium = g.isPremium;

  const countStaff = (staffObj) => {
    if (!staffObj || typeof staffObj !== 'object') return 0;
    return Object.values(staffObj).reduce((sum, v) => sum + (Number(v) || 0), 0);
  };

  const stateData = useMemo(() => {
    const data = {};
    for (const loc of (g.locations || [])) {
      const city = CITIES.find(c => c.id === loc.cityId);
      if (!city) continue;
      const st = city.state;
      if (!data[st]) data[st] = { shops: 0, rev: 0, inv: 0, profit: 0, staff: 0, cities: [] };
      data[st].shops++;
      const dailyRev = loc.dailyStats?.rev || 0;
      const dailyProfit = loc.dailyStats?.profit || 0;
      data[st].rev += dailyRev;
      data[st].profit += dailyProfit;
      const locInv = Object.values(loc.inventory || {}).reduce((sum, qty) => sum + (qty || 0), 0);
      data[st].inv += locInv;
      const staffCount = countStaff(loc.staff);
      data[st].staff += staffCount;
      const topTire = Object.entries(loc.inventory || {}).sort((a, b) => b[1] - a[1])[0];
      const topTireName = topTire ? (TIRES[topTire[0]]?.n || topTire[0]) : '-';
      data[st].cities.push({
        name: city.name, id: city.id, locId: loc.id,
        shopName: loc.name || city.name,
        rev: dailyRev, profit: dailyProfit, sold: loc.dailyStats?.sold || 0,
        inv: locInv, staff: staffCount, staffDetail: loc.staff || {},
        loyalty: Math.round(loc.loyalty || 0), locStorage: loc.locStorage || 0,
        marketing: loc.marketing || null, topTire: topTireName,
        isFranchise: loc.isFranchise || false, openedDay: loc.openedDay,
      });
    }
    if (g.distCenters) {
      for (const dc of g.distCenters) {
        const st = dc.state;
        if (!data[st]) data[st] = { shops: 0, rev: 0, inv: 0, profit: 0, staff: 0, cities: [], hasDC: true };
        data[st].hasDC = true;
      }
    }
    return data;
  }, [g.locations, g.distCenters]);

  const stateCities = useMemo(() => {
    if (!selectedState) return [];
    return CITIES.filter(c => c.state === selectedState);
  }, [selectedState]);

  const playerCitiesInState = useMemo(() => {
    if (!selectedState || !stateData[selectedState]) return [];
    return stateData[selectedState].cities;
  }, [selectedState, stateData]);

  const totalStaff = countStaff(g.staff);
  const totalLocations = (g.locations || []).length;

  return (
    <div className="panel">
      <h2 className="panel-title">{'\u{1F5FA}'} Empire Map</h2>
      {!isPremium && (
        <div className="premium-lock-banner">
          <span>{'\u{1F512}'} Premium Feature</span>
          <p>Upgrade to see your full empire map, revenue charts, and inventory heatmap.</p>
          <button className="btn btn-sm btn-gold" onClick={() => window.dispatchEvent(new CustomEvent('openPremiumModal'))}>Unlock Premium</button>
        </div>
      )}
      <div className={!isPremium ? 'map-blurred' : ''}>
        <div className="map-mode-toggle">
          {[
            { id: 'shops', label: 'Shops', icon: '\u{1F3EA}' },
            { id: 'revenue', label: 'Revenue', icon: '\u{1F4B0}' },
            { id: 'inventory', label: 'Inventory', icon: '\u{1F4E6}' },
          ].map(m => (
            <button key={m.id} className={`map-mode-btn${mapMode === m.id ? ' active' : ''}`} onClick={() => setMapMode(m.id)}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <div className="map-container">
          <USMap stateData={stateData} mode={mapMode} onTap={setSelectedState} selected={selectedState} />
        </div>

        {selectedState && (
          <div className="map-drilldown card">
            <h3 className="map-drilldown-title">
              {selectedState}
              {stateData[selectedState]?.hasDC && <span className="text-xs text-accent"> {'\u{1F4E6}'} DC</span>}
            </h3>
            {playerCitiesInState.length > 0 ? (
              <div className="map-shop-list">
                {playerCitiesInState.map((c, i) => (
                  <div key={i} className="map-shop-row" style={{
                    padding: '8px 0',
                    borderBottom: i < playerCitiesInState.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  }}>
                    <div className="row-between mb-4">
                      <div className="font-bold text-sm">
                        {c.isFranchise ? '\u{1F3E2} ' : '\u{1F3EA} '}{c.shopName}
                      </div>
                      <span className="text-xs text-dim">Day {c.openedDay || '?'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                      <div className="text-xs">
                        <span className="text-dim">Rev: </span>
                        <span className="font-bold text-green">${fmt(c.rev)}/day</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-dim">Profit: </span>
                        <span className={`font-bold ${c.profit >= 0 ? 'text-green' : 'text-red'}`}>${fmt(c.profit)}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-dim">Sold: </span>
                        <span className="font-bold">{c.sold}/day</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <div className="text-xs">
                        <span className="text-dim">Inv: </span>
                        <span className="font-bold">{c.inv} tires</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-dim">Staff: </span>
                        <span className="font-bold">{c.staff}</span>
                        <span className="text-dim"> ({c.staffDetail.techs || 0}T {c.staffDetail.sales || 0}S {c.staffDetail.managers || 0}M)</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-dim">Loyalty: </span>
                        <span className={`font-bold ${c.loyalty >= 70 ? 'text-green' : c.loyalty >= 40 ? '' : 'text-red'}`}>{c.loyalty}%</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                      {c.marketing && <span className="text-xs text-accent">{'\u{1F4E2}'} {c.marketing}</span>}
                      <span className="text-xs text-dim">Top: {c.topTire}</span>
                      {c.locStorage > 0 && <span className="text-xs text-dim">Storage: +{c.locStorage}</span>}
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
                    <span key={c.id} className="map-city-chip">{c.name} ({c.pop}k pop, ${Math.round(c.cost * 137.5)}K)</span>
                  ))}
                  {stateCities.length > 8 && <span className="map-city-chip">+{stateCities.length - 8} more</span>}
                </div>
              </div>
            )}
            <button className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={() => setSelectedState(null)}>Close</button>
          </div>
        )}

        <div className="card" style={{ marginTop: 12 }}>
          <h3 className="card-title">{'\u{1F4C8}'} Revenue by Channel</h3>
          <RevenueChart data={g.revHistory || []} />
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <h3 className="card-title">{'\u{1F30E}'} Empire Summary</h3>
          <div className="map-summary-grid">
            <div className="map-summary-item"><div className="map-summary-val">{totalLocations}</div><div className="map-summary-label">Shops</div></div>
            <div className="map-summary-item"><div className="map-summary-val">{Object.keys(stateData).length}</div><div className="map-summary-label">States</div></div>
            <div className="map-summary-item"><div className="map-summary-val">${fmt(g.dayRev || 0)}</div><div className="map-summary-label">Daily Rev</div></div>
            <div className="map-summary-item"><div className="map-summary-val">${fmt(g.dayProfit || 0)}</div><div className="map-summary-label">Daily Profit</div></div>
          </div>
          <div className="map-summary-grid" style={{ marginTop: 8 }}>
            <div className="map-summary-item"><div className="map-summary-val">{g.daySold || 0}</div><div className="map-summary-label">Sold/Day</div></div>
            <div className="map-summary-item"><div className="map-summary-val">{getInv(g)}</div><div className="map-summary-label">Total Inv</div></div>
            <div className="map-summary-item"><div className="map-summary-val">{totalStaff}</div><div className="map-summary-label">Total Staff</div></div>
            <div className="map-summary-item"><div className="map-summary-val">{(g.distCenters || []).length}</div><div className="map-summary-label">Dist Centers</div></div>
          </div>

          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-xs text-dim mb-4">Active Channels</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {totalLocations > 0 && <span className="badge-channel">{'\u{1F3EA}'} Retail ({totalLocations})</span>}
              {g.hasWholesale && <span className="badge-channel">{'\u{1F4E6}'} Wholesale</span>}
              {g.hasEcom && <span className="badge-channel">{'\u{1F4BB}'} E-Commerce</span>}
              {g.hasDist && <span className="badge-channel">{'\u{1F69B}'} Distribution ({(g.distCenters || []).length} DCs)</span>}
              {g.hasFactory && <span className="badge-channel">{'\u{1F3ED}'} Factory (Lv {g.factory?.level || 1})</span>}
              {g.hasFranchise && <span className="badge-channel">{'\u{1F3E2}'} Franchise</span>}
              {g.stockExchange?.isPublic && <span className="badge-channel">{'\u{1F4C8}'} Public ({g.stockExchange.ticker})</span>}
            </div>
          </div>

          {g.dayRevByChannel && (
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-xs text-dim mb-4">Today's Revenue by Channel</div>
              {Object.entries(g.dayRevByChannel || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([channel, rev]) => (
                <div key={channel} className="row-between text-xs mb-4">
                  <span style={{ textTransform: 'capitalize' }}>{channel}</span>
                  <span className="font-bold text-green">${fmt(rev)}</span>
                </div>
              ))}
              {Object.values(g.dayRevByChannel || {}).every(v => !v) && (
                <div className="text-xs text-dim">No revenue today</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
