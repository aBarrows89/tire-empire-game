import React, { useState, useEffect, useMemo } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { CITIES } from '@shared/constants/cities.js';
import { shopCost } from '@shared/constants/shop.js';
import { STATE_GRID, GRID_ROWS, GRID_COLS } from '@shared/constants/stateGrid.js';
import { SERVICES } from '@shared/constants/services.js';
import { TIRES } from '@shared/constants/tires.js';
import { tireName } from '@shared/helpers/factoryBrand.js';
import { GOV_TYPES } from '@shared/constants/govTypes.js';
import { fmt } from '@shared/helpers/format.js';
import { getLocInv, getLocCap } from '@shared/helpers/inventory.js';
import { getNextUpgrade, SHOP_STORAGE_UPGRADES } from '@shared/constants/shopStorage.js';
import { getShopValuation } from '@shared/constants/shopSale.js';
import { postAction, API_BASE, acceptShopOffer, rejectShopOffer, counterShopOffer, fetchShopMessages, sendShopMessage, fetchShopListings } from '../../api/client.js';
import { hapticsMedium } from '../../api/haptics.js';

export default function ShopPanel() {
  const { state, refreshState, applyState } = useGame();
  const g = state.game;
  const [busy, setBusy] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [aiCounts, setAiCounts] = useState({});
  const [askingPrices, setAskingPrices] = useState({});
  const [sharedListings, setSharedListings] = useState([]);
  const [counterForm, setCounterForm] = useState({});
  const [cityAIShops, setCityAIShops] = useState({});
  const [offerAmounts, setOfferAmounts] = useState({});
  const [offerMsg, setOfferMsg] = useState({});
  const [expandedLoc, setExpandedLoc] = useState(null);
  const toggleLoc = (id) => setExpandedLoc(prev => prev === id ? null : id);
  const [localServicePrices, setLocalServicePrices] = useState({});

  useEffect(() => {
    fetch(`${API_BASE}/market/cities`)
      .then(r => r.json())
      .then(data => setAiCounts(data))
      .catch(() => {});
    fetchShopListings().then(setSharedListings).catch(() => {});
  }, [g.day || g.week]);

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
    if (res.ok) { hapticsMedium(); applyState(res); }
    setBusy(null);
  };

  const financeShop = async (cityId) => {
    setBusy(`fin-${cityId}`);
    const res = await postAction('financeShop', { cityId });
    if (res.ok) applyState(res);
    setBusy(null);
  };

  const sellShop = async (locationId) => {
    setBusy(`sell-${locationId}`);
    const result = await postAction('sellShop', { locationId });
    applyState(result);
    setBusy(null);
  };

  const upgradeStorage = async (locationId) => {
    setBusy(`upg-${locationId}`);
    const result = await postAction('upgradeShopStorage', { locationId });
    applyState(result);
    setBusy(null);
  };

  const listForSale = async (locationId) => {
    setBusy(`list-${locationId}`);
    const price = askingPrices[locationId];
    const result = await postAction('listShopForSale', { locationId, askingPrice: price || undefined });
    applyState(result);
    setBusy(null);
  };

  const delistShop = async (locationId) => {
    setBusy(`delist-${locationId}`);
    const result = await postAction('delistShop', { locationId });
    applyState(result);
    setBusy(null);
  };

  const acceptBid = async (bidId) => {
    setBusy(`accept-${bidId}`);
    const result = await postAction('acceptShopBid', { bidId });
    hapticsMedium();
    applyState(result);
    setBusy(null);
  };

  const rejectBid = async (bidId) => {
    setBusy(`reject-${bidId}`);
    const result = await postAction('rejectShopBid', { bidId });
    applyState(result);
    setBusy(null);
  };

  const bidContract = async (contractType) => {
    setBusy(`bid-${contractType}`);
    const result = await postAction('bidOnContract', { contractType });
    applyState(result);
    setBusy(null);
  };

  // Cities for the selected state
  const stateCities = selectedState
    ? CITIES.filter(c => c.state === selectedState).sort((a, b) => b.dem - a.dem)
    : [];

  // Fetch AI shops when a state is selected
  useEffect(() => {
    if (!selectedState) return;
    const cities = CITIES.filter(c => c.state === selectedState);
    for (const city of cities) {
      if (cityAIShops[city.id]) continue;
      fetch(`${API_BASE}/market/city-shops/${city.id}`)
        .then(r => r.json())
        .then(shops => setCityAIShops(prev => ({ ...prev, [city.id]: shops })))
        .catch(() => {});
    }
  }, [selectedState]);

  const sendAIOffer = async (shopId, cityId) => {
    const price = Number(offerAmounts[shopId]) || 0;
    if (price <= 0) return;
    setBusy(`aioffer-${shopId}`);
    try {
      const res = await fetch(`${API_BASE}/market/offer-ai-shop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-player-id': g.id || 'dev-player' },
        body: JSON.stringify({ shopId, offerPrice: price }),
      });
      const data = await res.json();
      setOfferMsg(prev => ({ ...prev, [shopId]: data.message }));
      if (data.accepted) {
        refreshState();
        // Refresh AI shops for this city
        setCityAIShops(prev => ({ ...prev, [cityId]: (prev[cityId] || []).filter(s => s.id !== shopId) }));
      }
    } catch (err) {
      setOfferMsg(prev => ({ ...prev, [shopId]: 'Error sending offer' }));
    }
    setBusy(null);
  };

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

  // Helper: describe a bid's payment terms
  const describeBid = (bid) => {
    if (bid.paymentType === 'cash') return 'Full cash payment';
    if (bid.paymentType === 'installment')
      return `${Math.round(bid.downPct * 100)}% down, ${bid.months}mo installments`;
    if (bid.paymentType === 'revShare')
      return `10% upfront + ${Math.round(bid.revSharePct * 100)}% rev share for ${bid.revShareMonths}mo`;
    return bid.paymentType;
  };

  return (
    <>
      {/* ── YOUR SHOPS ── */}
      {g.locations.length > 0 && (
        <div className={`card${(g.cosmetics || []).includes('neon_sign') ? ' neon-shop-card' : ''}`}>
          <div className="card-title">Your Shops ({g.locations.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {g.locations.map((loc) => {
              const city = CITIES.find(c => c.id === loc.cityId);
              const competitors = aiCounts[loc.cityId] || 0;
              const locInv = getLocInv(loc);
              const locCap = getLocCap(loc);
              const ds = loc.dailyStats || {};
              const nextUpgrade = getNextUpgrade(loc);
              const isListed = (g.shopListings || []).some(l => l.locationId === loc.id);
              const listing = (g.shopListings || []).find(l => l.locationId === loc.id);
              const bids = (g.shopBids || []).filter(b => b.locationId === loc.id);
              const val = getShopValuation(loc, city);
              const isOpen = expandedLoc === loc.id;
              const invPct = locCap > 0 ? Math.round((locInv / locCap) * 100) : 0;
              const profitColor = ds.profit >= 0 ? 'var(--green)' : 'var(--red)';

              let cumStorage = 0;
              const tierDots = SHOP_STORAGE_UPGRADES.map(tier => {
                cumStorage += tier.add;
                return { ...tier, purchased: (loc.locStorage || 0) >= cumStorage };
              });

              return (
                <div key={loc.id} style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  {/* ── Collapsed header — always visible ── */}
                  <div
                    onClick={() => toggleLoc(loc.id)}
                    style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', gap: 10,
                      background: isOpen ? 'rgba(255,255,255,0.04)' : 'transparent' }}
                  >
                    {/* Left: name + city */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {loc.franchise ? '🏢' : '🏪'} {city?.name}, {city?.state}
                        {isListed && <span style={{ fontSize: 9, background: 'rgba(255,213,79,0.2)', color: 'var(--gold)', padding: '1px 5px', borderRadius: 4 }}>FOR SALE</span>}
                        {bids.length > 0 && <span style={{ fontSize: 9, background: 'rgba(76,175,80,0.2)', color: 'var(--green)', padding: '1px 5px', borderRadius: 4 }}>{bids.length} bid{bids.length > 1 ? 's' : ''}</span>}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>
                        {competitors} competitor{competitors !== 1 ? 's' : ''} · Loyalty {loc.loyalty ?? 0}%
                      </div>
                    </div>

                    {/* Middle: key stats */}
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>${fmt(ds.rev || 0)}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>rev/day</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: profitColor }}>${fmt(ds.profit || 0)}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>profit</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: invPct < 20 ? 'var(--red)' : invPct < 60 ? 'var(--gold)' : 'var(--text)' }}>{locInv}<span style={{ fontSize: 9, color: 'var(--text-dim)' }}>/{locCap}</span></div>
                        <div style={{ fontSize: 8, color: 'var(--text-dim)' }}>inv</div>
                      </div>
                    </div>

                    {/* Chevron */}
                    <div style={{ fontSize: 14, color: 'var(--text-dim)', marginLeft: 4, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▾</div>
                  </div>

                  {/* Mini inventory bar always visible */}
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, invPct)}%`,
                      background: invPct < 20 ? 'var(--red)' : invPct < 60 ? 'var(--gold)' : 'var(--green)',
                      transition: 'width 0.3s' }} />
                  </div>

                  {/* ── Expanded detail ── */}
                  {isOpen && (
                    <div style={{ padding: '12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>

                      {/* Stats row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                        {[
                          { label: 'Sold/day', value: ds.sold || 0 },
                          { label: 'Loyalty', value: `${loc.loyalty ?? 0}%`, color: (loc.loyalty||0) >= 70 ? 'var(--green)' : (loc.loyalty||0) >= 40 ? '' : 'var(--red)' },
                          { label: 'Inv cap', value: `${locCap}` },
                          { label: 'Marketing', value: loc.marketing || 'None' },
                          { label: 'Insurance', value: loc.insurance || 'None' },
                          { label: 'Storage', value: `+${loc.locStorage || 0}` },
                        ].map(s => (
                          <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.value}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Loyalty bar */}
                      <div>
                        <div className="loyalty-bar"><div className="loyalty-fill" style={{ width: `${loc.loyalty ?? 0}%` }} /></div>
                      </div>

                      {/* Storage upgrade */}
                      <div>
                        <div className="row-between text-xs" style={{ marginBottom: 4 }}>
                          <span className="text-dim">Storage Upgrades</span>
                          {!nextUpgrade && <span className="text-green font-bold">MAX</span>}
                        </div>
                        <div className="tier-track" style={{ marginBottom: 6 }}>
                          {tierDots.map(td => <div key={td.id} title={td.n} className={`tier-segment${td.purchased ? ' purchased' : ''}`} />)}
                        </div>
                        {nextUpgrade && (
                          <button className="btn btn-sm btn-outline btn-full"
                            disabled={g.cash < nextUpgrade.cost || busy === `upg-${loc.id}`}
                            onClick={() => upgradeStorage(loc.id)}>
                            {busy === `upg-${loc.id}` ? '...' : g.cash < nextUpgrade.cost
                              ? `Need $${fmt(nextUpgrade.cost)} for ${nextUpgrade.n}`
                              : `${nextUpgrade.ic} ${nextUpgrade.n} (+${nextUpgrade.add}) — $${fmt(nextUpgrade.cost)}`}
                          </button>
                        )}
                      </div>

                      {/* Marketing */}
                      <div className="row-between">
                        <span className="text-xs text-dim">Marketing</span>
                        <select className="autoprice-select" style={{ width: 'auto', fontSize: 10, minHeight: 28, padding: '2px 6px' }}
                          value={loc.marketing || ''}
                          onChange={async (e) => { setBusy(`mkt-${loc.id}`); const result = await postAction('setMarketing', { locationId: loc.id, tier: e.target.value || null }); applyState(result); setBusy(null); }}
                          disabled={busy === `mkt-${loc.id}`}>
                          <option value="">None</option>
                          <option value="flyers">Flyers ($50/day +10%)</option>
                          <option value="radio">Radio ($200/day +25%)</option>
                          <option value="digital">Digital ($500/day +40%)</option>
                        </select>
                      </div>

                      {/* Top Sellers */}
                      {loc.salesHistory && Object.keys(loc.salesHistory).length > 0 && (
                        <div>
                          <div className="text-xs text-dim" style={{ marginBottom: 4 }}>Top Sellers</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {Object.entries(loc.salesHistory).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,qty]) => (
                              <span key={k} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 6, background: 'rgba(76,175,80,0.1)', color: 'var(--green)', border: '1px solid rgba(76,175,80,0.2)' }}>
                                {tireName(k, g)}: {qty}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Auto-Stock */}
                      <div>
                        <div className="row-between" style={{ marginBottom: 4 }}>
                          <span className="text-xs text-dim">Auto-Stock Filter</span>
                          <select className="autoprice-select" style={{ width: 'auto', fontSize: 10, minHeight: 28, padding: '2px 6px' }}
                            value={(loc.stockingPrefs?.mode) || 'all'}
                            onChange={async (e) => { const mode = e.target.value; setBusy(`stock-${loc.id}`); const result = await postAction('setStockingPrefs', { locationId: loc.id, mode, tireTypes: loc.stockingPrefs?.tireTypes || [] }); applyState(result); setBusy(null); }}
                            disabled={busy === `stock-${loc.id}`}>
                            <option value="all">Stock All Types</option>
                            <option value="blacklist">Exclude Selected</option>
                            <option value="whitelist">Only Selected</option>
                            <option value="vinnie">🧔 Vinnie's Picks</option>
                          </select>
                        </div>
                        {loc.stockingPrefs?.mode === 'vinnie' && (
                          <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,213,79,0.06)', border: '1px solid rgba(255,213,79,0.15)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', marginBottom: 2 }}>🧔 Vinnie is managing stock</div>
                            <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5 }}>Picks based on climate, season, and best sellers.</div>
                          </div>
                        )}
                        {(loc.stockingPrefs?.mode === 'blacklist' || loc.stockingPrefs?.mode === 'whitelist') && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {Object.entries(TIRES).filter(([,t]) => !t.used).map(([k,t]) => {
                              const selected = (loc.stockingPrefs?.tireTypes || []).includes(k);
                              const isExclude = loc.stockingPrefs?.mode === 'blacklist';
                              return (
                                <button key={k} className="btn btn-sm" style={{ fontSize: 9, padding: '3px 6px',
                                  background: selected ? (isExclude ? 'rgba(239,83,80,0.15)' : 'rgba(102,187,106,0.15)') : 'rgba(255,255,255,0.05)',
                                  border: `1px solid ${selected ? (isExclude ? 'var(--red)' : 'var(--green)') : 'rgba(255,255,255,0.1)'}`,
                                  color: selected ? (isExclude ? 'var(--red)' : 'var(--green)') : 'var(--text-dim)' }}
                                  onClick={async () => {
                                    const current = loc.stockingPrefs?.tireTypes || [];
                                    const updated = selected ? current.filter(x=>x!==k) : [...current,k];
                                    setBusy(`stock-${loc.id}`);
                                    const result = await postAction('setStockingPrefs', { locationId: loc.id, mode: loc.stockingPrefs?.mode || 'blacklist', tireTypes: updated });
                                    applyState(result); setBusy(null);
                                  }}>
                                  {selected && (isExclude ? '✕ ' : '✓ ')}{t.n}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Shop Sale section */}
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                        {!isListed ? (
                          <>
                            <div className="text-xs text-dim" style={{ marginBottom: 4 }}>Valuation</div>
                            <div className="val-grid" style={{ marginBottom: 8 }}>
                              <span className="text-dim">Base</span><span>${fmt(val.baseValue)}</span>
                              <span className="text-dim">Inventory</span><span>${fmt(val.inventoryValue)}</span>
                              <span className="text-dim">Loyalty</span><span>${fmt(val.loyaltyBonus)}</span>
                              <span className="text-dim">Revenue</span><span>${fmt(val.revenueBonus)}</span>
                              <span className="font-bold">Total</span><span className="font-bold text-accent">${fmt(val.totalValue)}</span>
                            </div>
                            <div className="row gap-8" style={{ marginBottom: 6 }}>
                              <input type="number" className="input input-sm" style={{ flex: 1 }}
                                placeholder={`$${fmt(val.totalValue)}`}
                                value={askingPrices[loc.id] || ''}
                                onChange={(e) => setAskingPrices(p => ({ ...p, [loc.id]: Number(e.target.value) || '' }))} />
                              <button className="btn btn-sm btn-green" disabled={busy === `list-${loc.id}`} onClick={() => listForSale(loc.id)}>
                                {busy === `list-${loc.id}` ? '...' : 'List'}
                              </button>
                            </div>
                            <button className="btn btn-sm btn-outline btn-full" style={{ color: 'var(--red)' }}
                              disabled={busy === `sell-${loc.id}`} onClick={() => sellShop(loc.id)}>
                              {busy === `sell-${loc.id}` ? 'Selling...' : `Quick Sell (60% = $${fmt(Math.round((city ? shopCost(city) : 120000) * 0.6))})`}
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="row-between" style={{ marginBottom: 6 }}>
                              <span className="badge-listed">LISTED FOR SALE</span>
                              <span className="text-xs text-dim">Asking: ${fmt(listing.askingPrice)}</span>
                            </div>
                            {bids.length === 0 && <div className="text-xs text-dim" style={{ marginBottom: 6 }}>No bids yet.</div>}
                            {bids.map(bid => {
                              const isPlayerBid = !!bid.bidderId;
                              const sharedListing = sharedListings.find(l => l.locationId === loc.id);
                              const cf = counterForm[bid.id] || {};
                              return (
                                <div key={bid.id} className="bid-card">
                                  <div className="row-between text-xs">
                                    <span className="font-bold">{bid.bidderName}{isPlayerBid ? ' (Player)' : ' (AI)'}</span>
                                    <span className="font-bold text-green">${fmt(bid.bidPrice)}</span>
                                  </div>
                                  <div className="text-xs text-dim">{describeBid(bid)}</div>
                                  <div className="text-xs text-dim">Expires day {bid.day + 7}</div>
                                  {bid.isCounter && <div className="text-xs text-accent">Counter-offer</div>}
                                  <div className="row gap-8 mt-4">
                                    {isPlayerBid && sharedListing ? (
                                      <>
                                        <button className="btn btn-sm btn-green" style={{ flex:1 }} disabled={busy===`accept-${bid.id}`}
                                          onClick={async()=>{setBusy(`accept-${bid.id}`);await acceptShopOffer({listingId:sharedListing.id,offerId:bid.id});refreshState();setBusy(null);}}>
                                          {busy===`accept-${bid.id}`?'...':'Accept'}
                                        </button>
                                        <button className="btn btn-sm btn-outline" style={{ flex:1 }} disabled={busy===`reject-${bid.id}`}
                                          onClick={async()=>{setBusy(`reject-${bid.id}`);await rejectShopOffer({listingId:sharedListing.id,offerId:bid.id});refreshState();setBusy(null);}}>
                                          {busy===`reject-${bid.id}`?'...':'Reject'}
                                        </button>
                                        <button className="btn btn-sm btn-outline" style={{ flex:1 }}
                                          onClick={()=>setCounterForm(p=>({...p,[bid.id]:{open:!cf.open,bidPrice:bid.bidPrice,paymentType:bid.paymentType||'cash'}}))}>
                                          Counter
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button className="btn btn-sm btn-green" style={{ flex:1 }} disabled={busy===`accept-${bid.id}`} onClick={()=>acceptBid(bid.id)}>
                                          {busy===`accept-${bid.id}`?'...':'Accept'}
                                        </button>
                                        <button className="btn btn-sm btn-outline" style={{ flex:1 }} disabled={busy===`reject-${bid.id}`} onClick={()=>rejectBid(bid.id)}>
                                          {busy===`reject-${bid.id}`?'...':'Reject'}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                  {cf.open && isPlayerBid && sharedListing && (
                                    <div className="mt-4">
                                      <div className="row gap-8" style={{ marginBottom: 6 }}>
                                        <input type="number" className="input input-sm" style={{ flex:1 }} placeholder="Counter price"
                                          value={cf.bidPrice||''} onChange={e=>setCounterForm(p=>({...p,[bid.id]:{...p[bid.id],bidPrice:Number(e.target.value)||0}}))} />
                                        <select className="input input-sm" style={{ flex:1 }} value={cf.paymentType||'cash'}
                                          onChange={e=>setCounterForm(p=>({...p,[bid.id]:{...p[bid.id],paymentType:e.target.value}}))}>
                                          <option value="cash">Cash</option>
                                          <option value="installment">Installment</option>
                                          <option value="revShare">RevShare</option>
                                        </select>
                                      </div>
                                      <button className="btn btn-sm btn-full" disabled={!cf.bidPrice||busy===`counter-${bid.id}`}
                                        onClick={async()=>{setBusy(`counter-${bid.id}`);await counterShopOffer({listingId:sharedListing.id,offerId:bid.id,bidPrice:cf.bidPrice,paymentType:cf.paymentType});setCounterForm(p=>({...p,[bid.id]:{open:false}}));refreshState();setBusy(null);}}>
                                        {busy===`counter-${bid.id}`?'...':'Send Counter'}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <button className="btn btn-sm btn-outline btn-full mt-4" style={{ color: 'var(--red)' }}
                              disabled={busy===`delist-${loc.id}`} onClick={()=>delistShop(loc.id)}>
                              {busy===`delist-${loc.id}`?'...':'Delist'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}


            {/* Incoming Payments */}
      {((g.shopInstallments || []).length > 0 || (g.shopRevenueShares || []).length > 0) && (
        <div className="card">
          <div className="card-title">Incoming Payments</div>
          {(g.shopInstallments || []).map((inst, i) => (
            <div key={`inst-${i}`} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 4 }}>
              <div className="row-between text-xs">
                <span className="font-bold">{inst.buyerName}</span>
                <span className="text-green">${fmt(inst.monthlyPayment)}/mo</span>
              </div>
              <div className="text-xs text-dim">Installment &middot; {inst.remaining}mo remaining</div>
            </div>
          ))}
          {(g.shopRevenueShares || []).map((rs, i) => (
            <div key={`rs-${i}`} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 4 }}>
              <div className="row-between text-xs">
                <span className="font-bold">{rs.buyerName}</span>
                <span className="text-green">{Math.round(rs.revSharePct * 100)}% rev share</span>
              </div>
              <div className="text-xs text-dim">Revenue share &middot; {rs.remaining}mo remaining</div>
            </div>
          ))}
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
              const result = await postAction('setDisposalFee', { fee: Number(e.target.value) });
              applyState(result);
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
          {(g.dayServiceJobs || g.weekServiceJobs || 0) > 0 && (
            <div className="row-between text-sm mb-4">
              <span className="text-dim">Today</span>
              <span className="font-bold text-green">
                {g.dayServiceJobs || g.weekServiceJobs || 0} jobs &middot; ${fmt(g.dayServiceRev || g.weekServiceRev || 0)}
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
                    value={localServicePrices[k] ?? price}
                    min={Math.round(svc.price * 0.5)}
                    max={Math.round(svc.price * 3)}
                    onChange={(e) => {
                      setLocalServicePrices(prev => ({ ...prev, [k]: e.target.value }));
                    }}
                    onBlur={async (e) => {
                      const val = Number(e.target.value);
                      if (!val || val <= 0) return;
                      setLocalServicePrices(prev => ({ ...prev, [k]: val }));
                      const result = await postAction('setServicePrice', { service: k, price: val });
                      applyState(result);
                    }}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.target.blur();
                      }
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Government Contracts */}
      {g.locations.length > 0 && (
        <div className="card">
          <div className="card-title">Government Contracts</div>
          <div className="text-xs text-dim mb-4">
            Bid on government fleet contracts for steady, guaranteed revenue.
          </div>
          {/* Active contracts */}
          {(g.govContracts || []).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="text-xs font-bold mb-4">Active Contracts:</div>
              {g.govContracts.map((gc, i) => (
                <div key={i} className="queue-item">
                  <div>
                    <div className="text-sm font-bold">{gc.name}</div>
                    <div className="text-xs text-dim">
                      {tireName(gc.tire, g)} &middot; ${gc.pricePerTire}/tire &middot; {gc.daysLeft}d left
                    </div>
                    <div className="text-xs text-dim">
                      Delivered: {gc.delivered || 0}{gc.totalTarget ? ` / ${gc.totalTarget}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Available contracts */}
          {GOV_TYPES.map(ct => {
            const locked = g.reputation < ct.minRep;
            const tooFewLocs = (g.locations || []).length < (ct.minLocs || 1);
            const atMax = (g.govContracts || []).length >= 3;
            return (
              <div key={ct.type} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 6, opacity: locked ? 0.5 : 1 }}>
                <div className="row-between mb-4">
                  <span className="font-bold text-sm">{ct.ic} {ct.name}</span>
                </div>
                <div className="text-xs text-dim mb-4">
                  {ct.qtyMin}-{ct.qtyMax} tires &middot; {ct.dur} weeks
                  {ct.minRep ? ` \u00B7 Rep ${ct.minRep}+` : ''}
                  {ct.minLocs > 1 ? ` \u00B7 ${ct.minLocs}+ shops` : ''}
                </div>
                <button
                  className="btn btn-full btn-sm btn-green"
                  disabled={locked || tooFewLocs || atMax || busy === `bid-${ct.type}`}
                  onClick={() => bidContract(ct.type)}
                >
                  {locked ? `Need Rep ${ct.minRep}` : tooFewLocs ? `Need ${ct.minLocs} shops` : atMax ? 'Max 3 contracts' : busy === `bid-${ct.type}` ? '...' : 'Bid'}
                </button>
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
            const shopCount = s?.totalSat || 0;
            return (
              <button
                key={abbrev}
                className={`state-tile${selectedState === abbrev ? ' state-tile-active' : ''}${hasShop ? ' state-tile-owned' : ''}`}
                style={{
                  gridRow: row + 1,
                  gridColumn: col + 1,
                  background: getTileColor(abbrev),
                  flexDirection: 'column',
                  lineHeight: 1,
                }}
                onClick={() => setSelectedState(selectedState === abbrev ? null : abbrev)}
              >
                {abbrev}
                {shopCount > 0 && (
                  <span style={{ fontSize: 6, opacity: 0.7 }}>{shopCount}</span>
                )}
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
            const downPayment = Math.ceil(cost * 0.20);
            const canFinance = g.cash >= downPayment && g.cash < cost;
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
                {hasShop && (
                  <div className="text-sm text-green font-bold mb-4">You have a shop here</div>
                )}
                <div className="col gap-8">
                  {!hasShop && (
                    <>
                      <button
                        className="btn btn-full btn-sm btn-green"
                        disabled={cantAfford || lowRep || busy === city.id}
                        onClick={() => open(city.id)}
                      >
                        {lowRep ? `Need Rep 15 (yours: ${g.reputation.toFixed(1)})` : cantAfford && !canFinance ? `Need $${fmt(cost)}` : `Open New Shop ($${fmt(cost)})`}
                      </button>
                      {canFinance && !lowRep && (
                        <button
                          className="btn btn-full btn-sm btn-outline"
                          disabled={busy === `fin-${city.id}`}
                          onClick={() => financeShop(city.id)}
                        >
                          {busy === `fin-${city.id}` ? '...' : `Finance (20% down = $${fmt(downPayment)})`}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Competitor shops in this city */}
                {(cityAIShops[city.id] || []).length > 0 && (
                  <div className="card-section">
                    <div className="text-xs font-bold mb-4">Existing Shops ({(cityAIShops[city.id] || []).length})</div>
                    {(cityAIShops[city.id] || []).map(shop => (
                      <div key={shop.id} className="bid-card">
                        <div className="row-between text-xs mb-4">
                          <span className="font-bold">{shop.icon} {shop.name}</span>
                          <span className="text-dim">{shop.personality}</span>
                        </div>
                        <div className="row gap-8 text-xs text-dim mb-4">
                          <span>Rep: {shop.reputation}</span>
                          <span>Value: ~${fmt(shop.wealth)}</span>
                        </div>
                        <div className="row gap-8">
                          <input
                            type="number"
                            className="input input-sm"
                            style={{ flex: 1 }}
                            placeholder={`Offer ($${fmt(Math.round(shop.wealth * 0.8))}+)`}
                            value={offerAmounts[shop.id] || ''}
                            onChange={e => setOfferAmounts(prev => ({ ...prev, [shop.id]: e.target.value }))}
                          />
                          <button
                            className="btn btn-sm"
                            disabled={!offerAmounts[shop.id] || Number(offerAmounts[shop.id]) <= 0 || Number(offerAmounts[shop.id]) > g.cash || busy === `aioffer-${shop.id}`}
                            onClick={() => sendAIOffer(shop.id, city.id)}
                          >
                            {busy === `aioffer-${shop.id}` ? '...' : 'Offer'}
                          </button>
                        </div>
                        {offerMsg[shop.id] && (
                          <div className={`text-xs mt-4 ${offerMsg[shop.id].includes('acquired') ? 'text-green' : 'text-gold'}`}>
                            {offerMsg[shop.id]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Franchise Section */}
      {g.hasFranchise && (
        <div className="card">
          <div className="card-title">Franchise</div>
          <div className="text-xs text-dim mb-4">
            Expand your empire by franchising your brand to other cities.
          </div>
          {(g.franchiseTemplates || []).length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-dim mb-4">Templates:</div>
              {g.franchiseTemplates.map((tmpl, i) => (
                <div key={i} className="text-sm mb-4">{tmpl.name || `Template ${i + 1}`}</div>
              ))}
            </div>
          )}
          <div className="row gap-8">
            <button
              className="btn btn-sm btn-outline flex-1"
              disabled={busy === 'franchise-tmpl'}
              onClick={async () => {
                setBusy('franchise-tmpl');
                const result = await postAction('createFranchiseTemplate');
                applyState(result);
                setBusy(null);
              }}
            >
              Create Template
            </button>
            <button
              className="btn btn-sm btn-green flex-1"
              disabled={busy === 'franchise-open'}
              onClick={async () => {
                setBusy('franchise-open');
                const result = await postAction('openFranchise');
                applyState(result);
                setBusy(null);
              }}
            >
              Open Franchise
            </button>
          </div>
        </div>
      )}
    </>
  );
}
