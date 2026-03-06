import React, { useState, useMemo } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { CITIES } from '@shared/constants/cities.js';
import USMap from '../USMap.jsx';
import RevenueChart from '../RevenueChart.jsx';
import { getInv, getLocInv, getLocCap } from '@shared/helpers/inventory.js';
import { fmt } from '@shared/helpers/format.js';
import { TIRES } from '@shared/constants/tires.js';
import { tireName } from '@shared/helpers/factoryBrand.js';
import { getCalendar } from '@shared/helpers/calendar.js';

function Sparkline({ data, color = '#4caf50', height = 28 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export default function MapPanel() {
  const { state } = useGame();
  const g = state.game;
  const [selectedState, setSelectedState] = useState(null);
  const [mapMode, setMapMode] = useState('shops');
  const isPremium = g.isPremium;

  // 30-day avg from locHistory for accurate revenue (not stale dailyStats)
  const locStats = useMemo(() => {
    const out = {};
    for (const loc of (g.locations || [])) {
      const hist = (g.locHistory?.[loc.id] || []);
      const recent = hist.slice(-7); // 7d avg is more stable than 1-day
      const avgRev = recent.length ? recent.reduce((a, d) => a + d.rev, 0) / recent.length : (loc.dailyStats?.rev || 0);
      const avgProfit = recent.length ? recent.reduce((a, d) => a + d.profit, 0) / recent.length : (loc.dailyStats?.profit || 0);
      const revData = hist.map(d => d.rev);
      const profitData = hist.map(d => d.profit);
      const inv = getLocInv(loc);
      const cap = getLocCap(loc) || 100;
      const invPct = Math.round((inv / cap) * 100);
      // Top tires by qty
      const topTires = Object.entries(loc.inventory || {})
        .filter(([, q]) => q > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, q]) => ({ name: tireName(k, g), qty: q, key: k }));
      // Low stock warning: any tire type < 5
      const lowStock = Object.entries(loc.inventory || {}).filter(([, q]) => q > 0 && q < 5);
      out[loc.id] = { avgRev, avgProfit, revData, profitData, inv, cap, invPct, topTires, lowStock };
    }
    return out;
  }, [g.locations, g.locHistory]);

  const stateData = useMemo(() => {
    const data = {};
    for (const loc of (g.locations || [])) {
      const city = CITIES.find(c => c.id === loc.cityId);
      if (!city) continue;
      const st = city.state;
      const ls = locStats[loc.id] || {};
      if (!data[st]) data[st] = { shops: 0, rev: 0, inv: 0, profit: 0, cities: [] };
      data[st].shops++;
      data[st].rev += ls.avgRev || 0;
      data[st].profit += ls.avgProfit || 0;
      data[st].inv += ls.inv || 0;

      const openedCal = loc.openedDay ? getCalendar((g.startDay || 1) + loc.openedDay - 1) : null;
      const openedStr = openedCal ? `${openedCal.monthName.slice(0,3)} ${openedCal.dayOfMonth}, Yr ${openedCal.year}` : '?';
      const agedays = loc.openedDay ? (g.day || 0) - loc.openedDay : null;

      data[st].cities.push({
        loc, city,
        name: city.name,
        shopName: loc.franchise ? `${loc.franchise.brandName} (DBA ${g.companyName})` : (loc.name || city.name),
        isFranchise: !!loc.franchise,
        openedStr, agedays,
        ...ls,
      });
    }
    return data;
  }, [g.locations, g.locHistory, locStats]);

  const stateCities = useMemo(() => {
    if (!selectedState) return [];
    return CITIES.filter(c => c.state === selectedState);
  }, [selectedState]);

  const playerCitiesInState = useMemo(() => {
    if (!selectedState || !stateData[selectedState]) return [];
    return stateData[selectedState].cities;
  }, [selectedState, stateData]);

  const totalLocations = (g.locations || []).length;
  const totalInv = (g.locations || []).reduce((a, loc) => a + getLocInv(loc), 0)
    + Object.values(g.warehouseInventory || {}).reduce((a, v) => a + v, 0);

  const MODES = [
    { id: 'shops', label: 'Shops', icon: '🏪' },
    { id: 'revenue', label: 'Revenue', icon: '💰' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
  ];

  return (
    <div className="panel">
      <h2 className="panel-title">🗺 Empire Map</h2>
      {!isPremium && (
        <div className="premium-lock-banner">
          <span>🔒 Premium Feature</span>
          <p>Upgrade to see your full empire map, revenue charts, and inventory heatmap.</p>
          <button className="btn btn-sm btn-gold" onClick={() => window.dispatchEvent(new CustomEvent('openPremiumModal'))}>Unlock Premium</button>
        </div>
      )}
      <div className={!isPremium ? 'map-blurred' : ''}>

        {/* Mode tabs */}
        <div className="map-mode-toggle">
          {MODES.map(m => (
            <button key={m.id} className={`map-mode-btn${mapMode === m.id ? ' active' : ''}`} onClick={() => setMapMode(m.id)}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* Map */}
        <div className="map-container">
          <USMap stateData={stateData} mode={mapMode} onTap={st => setSelectedState(st === selectedState ? null : st)} selected={selectedState} />
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
          {mapMode === 'shops' && <span>🟢 = shop count per state</span>}
          {mapMode === 'revenue' && <span>🟢 = higher 7d avg revenue</span>}
          {mapMode === 'inventory' && <><span style={{ color: '#4caf50' }}>■ well stocked</span><span style={{ color: '#ffc107' }}>■ moderate</span><span style={{ color: '#ef5350' }}>■ low stock</span></>}
        </div>

        {/* State drill-down */}
        {selectedState && (
          <div className="map-drilldown card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 className="map-drilldown-title" style={{ margin: 0 }}>{selectedState}</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setSelectedState(null)}>✕</button>
            </div>

            {playerCitiesInState.length > 0 ? (
              <div className="map-shop-list">
                {playerCitiesInState.map((c, i) => (
                  <div key={i} style={{ padding: '10px 0', borderBottom: i < playerCitiesInState.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>

                    {/* Shop header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          {c.isFranchise ? '🏢 ' : '🏪 '}{c.shopName}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                          {c.city.name}, {selectedState} · Opened {c.openedStr}
                          {c.agedays !== null && ` (${c.agedays}d ago)`}
                        </div>
                      </div>
                      {/* Mode-specific headline stat */}
                      {mapMode === 'revenue' && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#4ea8de' }}>${fmt(Math.round(c.avgRev))}/d</div>
                          <div style={{ fontSize: 10, color: c.avgProfit >= 0 ? '#4caf50' : '#ef5350' }}>
                            {c.avgProfit >= 0 ? '+' : ''}${fmt(Math.round(c.avgProfit))} profit
                          </div>
                        </div>
                      )}
                      {mapMode === 'inventory' && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: c.invPct < 20 ? '#ef5350' : c.invPct < 50 ? '#ffc107' : '#4caf50' }}>
                            {c.inv} tires
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{c.invPct}% full</div>
                        </div>
                      )}
                      {mapMode === 'shops' && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#4ea8de' }}>${fmt(Math.round(c.avgRev))}/d</div>
                          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Loyalty {c.loc.loyalty || 0}%</div>
                        </div>
                      )}
                    </div>

                    {/* Revenue mode: sparklines */}
                    {mapMode === 'revenue' && c.revData.length >= 3 && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>Revenue (30d)</div>
                          <Sparkline data={c.revData} color="#4ea8de" />
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>Profit (30d)</div>
                          <Sparkline data={c.profitData} color={c.avgProfit >= 0 ? '#4caf50' : '#ef5350'} />
                        </div>
                      </div>
                    )}

                    {/* Inventory mode: stock breakdown */}
                    {mapMode === 'inventory' && (
                      <div style={{ marginBottom: 6 }}>
                        {/* Capacity bar */}
                        <div style={{ background: '#1a1a1a', borderRadius: 4, height: 6, marginBottom: 6, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 4,
                            width: `${Math.min(100, c.invPct)}%`,
                            background: c.invPct < 20 ? '#ef5350' : c.invPct < 50 ? '#ffc107' : '#4caf50',
                          }} />
                        </div>
                        {c.topTires.length > 0 ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {c.topTires.map(t => (
                              <span key={t.key} style={{ fontSize: 10, background: '#111', padding: '2px 6px', borderRadius: 10 }}>
                                {t.name} <strong>{t.qty}</strong>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#ef5350', fontWeight: 700 }}>⚠ No inventory</div>
                        )}
                        {c.lowStock.length > 0 && (
                          <div style={{ fontSize: 10, color: '#ffc107', marginTop: 4 }}>
                            ⚠ Low: {c.lowStock.map(([k, q]) => `${tireName(k, g)} (${q})`).join(', ')}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Shops mode: full detail */}
                    {mapMode === 'shops' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                        {[
                          { label: 'Sold/day', value: c.loc.dailyStats?.sold || 0 },
                          { label: 'Inventory', value: `${c.inv} tires` },
                          { label: 'Marketing', value: c.loc.marketing || 'None' },
                          { label: 'Insurance', value: c.loc.insurance || 'None' },
                          { label: 'Loyalty', value: `${c.loc.loyalty || 0}%`, color: (c.loc.loyalty || 0) >= 70 ? '#4caf50' : (c.loc.loyalty || 0) >= 40 ? '' : '#ef5350' },
                          { label: 'Storage', value: `+${c.loc.locStorage || 0}` },
                        ].map(s => (
                          <div key={s.label} style={{ background: '#111', borderRadius: 4, padding: '4px 6px', textAlign: 'center' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.value}</div>
                            <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    )}
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
          </div>
        )}

        {/* Revenue tab: channel chart */}
        {mapMode === 'revenue' && (
          <div className="card" style={{ marginTop: 0, marginBottom: 12 }}>
            <h3 className="card-title">📈 Revenue by Channel (60d)</h3>
            <RevenueChart data={g.revHistory || []} />
            {g.dayRevByChannel && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-xs text-dim" style={{ marginBottom: 6 }}>Today by Channel</div>
                {Object.entries(g.dayRevByChannel || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([channel, rev]) => (
                  <div key={channel} className="row-between text-xs" style={{ marginBottom: 4 }}>
                    <span style={{ textTransform: 'capitalize' }}>{channel}</span>
                    <span className="font-bold text-green">${fmt(rev)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Inventory tab: warehouse + store breakdown */}
        {mapMode === 'inventory' && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 className="card-title">📦 Inventory Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Stores Total', value: (g.locations || []).reduce((a, l) => a + getLocInv(l), 0) },
                { label: 'Warehouse', value: Object.values(g.warehouseInventory || {}).reduce((a, v) => a + v, 0) },
                { label: 'All Inventory', value: totalInv },
              ].map(s => (
                <div key={s.label} style={{ background: '#111', borderRadius: 6, padding: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Top tire types across all locations */}
            {(() => {
              const totals = {};
              for (const loc of (g.locations || [])) {
                for (const [k, q] of Object.entries(loc.inventory || {})) {
                  totals[k] = (totals[k] || 0) + q;
                }
              }
              for (const [k, q] of Object.entries(g.warehouseInventory || {})) {
                totals[k] = (totals[k] || 0) + q;
              }
              const sorted = Object.entries(totals).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]);
              if (!sorted.length) return <div style={{ fontSize: 12, color: '#ef5350', textAlign: 'center', padding: 12 }}>⚠ No inventory anywhere</div>;
              return (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>All Tire Types</div>
                  {sorted.map(([k, q]) => {
                    const pct = Math.round((q / totalInv) * 100);
                    return (
                      <div key={k} style={{ marginBottom: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                          <span>{tireName(k, g)}</span>
                          <span style={{ color: 'var(--text-dim)' }}>{q} ({pct}%)</span>
                        </div>
                        <div style={{ background: '#1a1a1a', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: '#4ea8de', borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Empire summary — always shown */}
        <div className="card">
          <h3 className="card-title">🌎 Empire Summary</h3>
          <div className="map-summary-grid">
            <div className="map-summary-item"><div className="map-summary-val">{totalLocations}</div><div className="map-summary-label">Shops</div></div>
            <div className="map-summary-item"><div className="map-summary-val">{Object.keys(stateData).length}</div><div className="map-summary-label">States</div></div>
            <div className="map-summary-item"><div className="map-summary-val">${fmt(g.dayRev || 0)}</div><div className="map-summary-label">Today Rev</div></div>
            <div className="map-summary-item"><div className="map-summary-val">${fmt(g.dayProfit || 0)}</div><div className="map-summary-label">Today Profit</div></div>
          </div>
          <div className="map-summary-grid" style={{ marginTop: 8 }}>
            <div className="map-summary-item"><div className="map-summary-val">{g.daySold || 0}</div><div className="map-summary-label">Sold/Day</div></div>
            <div className="map-summary-item"><div className="map-summary-val">{totalInv}</div><div className="map-summary-label">Total Inv</div></div>
            <div className="map-summary-item"><div className="map-summary-val">{Object.keys(stateData).length > 0 ? Object.keys(stateData).length : 0}</div><div className="map-summary-label">States</div></div>
            <div className="map-summary-item"><div className="map-summary-val">{(g.distCenters || []).length}</div><div className="map-summary-label">Dist Centers</div></div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-xs text-dim" style={{ marginBottom: 6 }}>Active Channels</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {totalLocations > 0 && <span className="badge-channel">🏪 Retail ({totalLocations})</span>}
              {g.hasWholesale && <span className="badge-channel">📦 Wholesale</span>}
              {g.hasEcom && <span className="badge-channel">💻 E-Commerce</span>}
              {g.hasDist && <span className="badge-channel">🚛 Distribution ({(g.distCenters || []).length} DCs)</span>}
              {g.hasFactory && <span className="badge-channel">🏭 Factory (Lv {g.factory?.level || 1})</span>}
              {g.hasFranchise && <span className="badge-channel">🏢 Franchise</span>}
              {g.stockExchange?.isPublic && <span className="badge-channel">📈 Public ({g.stockExchange.ticker})</span>}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
