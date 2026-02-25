import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { TIRES } from '@shared/constants/tires.js';
import { MAP_FLOOR } from '@shared/constants/wholesale.js';
import { P2P_FEES, MARKETPLACE_SPECIALIST } from '@shared/constants/marketplace.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction, API_BASE, headers as apiHeaders } from '../../api/client.js';

const PLAYER_ID = 'dev-player';

function getPlayerTier(g) {
  if (g.hasEcom) return 'ecommerce';
  if (g.marketplaceSpecialist) return 'basic';
  return null;
}

export default function MarketplacePanel() {
  const { state, dispatch, refreshState } = useGame();
  const g = state.game;
  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [tab, setTab] = useState('browse');
  const [busy, setBusy] = useState(null);
  const [filter, setFilter] = useState('all');

  // Sell form
  const [sellTire, setSellTire] = useState('');
  const [sellQty, setSellQty] = useState(10);
  const [sellPrice, setSellPrice] = useState(20);
  const [sellDuration, setSellDuration] = useState(7);

  // Bid form
  const [bidAmounts, setBidAmounts] = useState({});

  const headers = apiHeaders;
  const tier = getPlayerTier(g);
  const fees = tier ? P2P_FEES[tier] : null;
  const hasAccess = tier !== null;

  const fetchListings = () => {
    fetch(`${API_BASE}/market/listings`, { headers }).then(r => r.json()).then(setListings).catch(() => {});
    fetch(`${API_BASE}/market/my-listings`, { headers }).then(r => r.json()).then(setMyListings).catch(() => {});
  };

  useEffect(() => { fetchListings(); }, [g.day || g.week]);

  const createListing = async () => {
    if (!sellTire || sellQty <= 0 || sellPrice <= 0) return;
    setBusy('list');
    const res = await fetch(`${API_BASE}/market/list`, {
      method: 'POST', headers,
      body: JSON.stringify({ tireType: sellTire, qty: sellQty, askPrice: sellPrice, duration: sellDuration }),
    }).then(r => r.json());
    if (res.ok) {
      refreshState();
      fetchListings();
      setTab('mine');
    } else if (res.error) {
      alert(res.error);
    }
    setBusy(null);
  };

  const placeBid = async (listingId) => {
    const price = bidAmounts[listingId];
    if (!price || price <= 0) return;
    setBusy(listingId);
    const res = await fetch(`${API_BASE}/market/bid`, {
      method: 'POST', headers,
      body: JSON.stringify({ listingId, pricePerTire: price }),
    }).then(r => r.json());
    if (res.ok) fetchListings();
    setBusy(null);
  };

  const cancelListing = async (listingId) => {
    setBusy(listingId);
    const res = await fetch(`${API_BASE}/market/cancel`, {
      method: 'POST', headers,
      body: JSON.stringify({ listingId }),
    }).then(r => r.json());
    if (res.ok) {
      refreshState();
      fetchListings();
    }
    setBusy(null);
  };

  // Available tires across all inventory
  const availTires = Object.entries(TIRES).filter(([k]) => {
    const total = (g.warehouseInventory?.[k] || 0) +
      (g.locations || []).reduce((a, l) => a + (l.inventory?.[k] || 0), 0);
    return total > 0;
  }).map(([k, t]) => {
    const total = (g.warehouseInventory?.[k] || 0) +
      (g.locations || []).reduce((a, l) => a + (l.inventory?.[k] || 0), 0);
    return { key: k, name: t.n, qty: total, used: !!t.used };
  });

  // Get MAP floor for selected tire
  const selectedTire = TIRES[sellTire];
  const mapMin = sellTire && selectedTire && !selectedTire.used && MAP_FLOOR[sellTire]
    ? Math.ceil(selectedTire.def * MAP_FLOOR[sellTire])
    : null;

  // Estimated seller fee
  const estSellerFee = fees && sellQty > 0 && sellPrice > 0
    ? Math.floor(sellQty * sellPrice * fees.sellerFee)
    : 0;

  let activeListings = listings.filter(l => l.status === 'active' && l.sellerId !== PLAYER_ID);

  // Apply filter
  if (filter !== 'all') {
    if (filter === 'used') {
      activeListings = activeListings.filter(l => TIRES[l.tireType]?.used);
    } else if (filter === 'new') {
      activeListings = activeListings.filter(l => !TIRES[l.tireType]?.used);
    } else {
      activeListings = activeListings.filter(l => l.tireType === filter);
    }
  }

  // Sort by price (lowest first)
  activeListings.sort((a, b) => a.askPrice - b.askPrice);

  return (
    <>
      <div className="card">
        <div className="card-title">Player Marketplace</div>
        <div className="text-xs text-dim mb-4">
          Buy and sell tires with other players via auction.
          {fees && (
            <span> Your tier: <span className="font-bold text-accent">{tier === 'ecommerce' ? 'Premium' : 'Basic'}</span>
              {' '}({(fees.sellerFee * 100).toFixed(0)}% seller / {(fees.buyerFee * 100).toFixed(1)}% buyer fees)
            </span>
          )}
        </div>
        <div className="row gap-8">
          {['browse', 'sell', 'mine'].map(t => (
            <button
              key={t}
              className={`btn btn-sm ${tab === t ? '' : 'btn-outline'}`}
              onClick={() => setTab(t)}
              style={{ flex: 1 }}
            >
              {t === 'browse' ? 'Browse' : t === 'sell' ? 'List' : 'My Listings'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'browse' && (
        <>
          {/* Filter bar */}
          <div className="card">
            <div className="text-xs text-dim mb-4">Filter</div>
            <select
              className="autoprice-select"
              style={{ width: '100%' }}
              value={filter}
              onChange={e => setFilter(e.target.value)}
            >
              <option value="all">All Tires</option>
              <option value="used">Used Only</option>
              <option value="new">New Only</option>
              {Object.entries(TIRES).map(([k, t]) => (
                <option key={k} value={k}>{t.n}</option>
              ))}
            </select>
          </div>

          {activeListings.length === 0 && (
            <div className="card">
              <div className="text-sm text-dim">No active listings{filter !== 'all' ? ' matching filter' : ' from other players'}.</div>
            </div>
          )}
          {activeListings.map(listing => {
            const t = TIRES[listing.tireType];
            const bidPrice = bidAmounts[listing.id] || listing.askPrice;
            const grossCost = bidPrice * listing.qty;
            const buyerFeeAmt = fees ? Math.floor(grossCost * fees.buyerFee) : Math.floor(grossCost * P2P_FEES.basic.buyerFee);
            const totalWithFee = grossCost + buyerFeeAmt;
            return (
              <div key={listing.id} className="card">
                <div className="row-between mb-4">
                  <span className="font-bold text-sm">{t?.n || listing.tireType}</span>
                  <span className="text-xs text-dim">x{listing.qty}</span>
                </div>
                <div className="row-between text-xs mb-4">
                  <span className="text-dim">Seller: {listing.sellerName}</span>
                  <span className="text-dim">Expires day {listing.expiresDay}</span>
                </div>
                <div className="row-between text-sm mb-4">
                  <span>Ask: <span className="text-accent">${listing.askPrice}/tire</span></span>
                  <span>High bid: <span className="font-bold text-green">${listing.highBid || '\u2014'}</span></span>
                </div>
                <div className="row gap-8 mb-4">
                  <input
                    type="number"
                    className="autoprice-offset"
                    style={{ flex: 1 }}
                    placeholder="Your bid $/tire"
                    min={(listing.highBid || 0) + 1}
                    value={bidAmounts[listing.id] || ''}
                    onChange={e => setBidAmounts({ ...bidAmounts, [listing.id]: Number(e.target.value) })}
                  />
                  <button
                    className="btn btn-sm btn-green"
                    disabled={!bidAmounts[listing.id] || bidAmounts[listing.id] <= (listing.highBid || 0) || g.cash < totalWithFee || busy === listing.id}
                    onClick={() => placeBid(listing.id)}
                  >
                    Bid
                  </button>
                </div>
                {bidAmounts[listing.id] > 0 && (
                  <div className="text-xs text-dim">
                    Total: ${fmt(grossCost)} + ${fmt(buyerFeeAmt)} fee = <span className="font-bold">${fmt(totalWithFee)}</span>
                  </div>
                )}
                {g.cash < totalWithFee && bidAmounts[listing.id] > 0 && (
                  <div className="text-xs text-red">Not enough cash</div>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === 'sell' && (
        <div className="card">
          {!hasAccess ? (
            <>
              <div className="card-title">Unlock Required</div>
              <div className="text-sm text-dim mb-4">
                You need marketplace access to list tires for sale.
              </div>
              <div className="text-xs mb-4">
                <strong>Option 1:</strong> Hire a {MARKETPLACE_SPECIALIST.title} (${fmt(MARKETPLACE_SPECIALIST.salary)}/mo, Rep {MARKETPLACE_SPECIALIST.minRep}+)
                {' '}&mdash; Basic tier with {(P2P_FEES.basic.sellerFee * 100).toFixed(0)}% seller fees
              </div>
              <div className="text-xs mb-4">
                <strong>Option 2:</strong> Unlock full E-Commerce module ($150K, Rep 35+)
                {' '}&mdash; Premium tier with {(P2P_FEES.ecommerce.sellerFee * 100).toFixed(0)}% seller fees
              </div>
              <button
                className="btn btn-full btn-sm"
                onClick={() => dispatch({ type: 'SET_PANEL', payload: 'staff' })}
              >
                Go to Staff
              </button>
            </>
          ) : (
            <>
              <div className="card-title">Create Listing</div>
              <div className="text-xs text-dim mb-4">
                {tier === 'ecommerce' ? 'Premium' : 'Basic'} tier &middot;
                {' '}{(fees.sellerFee * 100).toFixed(0)}% seller fee &middot;
                {' '}Max {fees.maxListings} listings
              </div>
              {availTires.length === 0 ? (
                <div className="text-sm text-dim">No tires in stock to list.</div>
              ) : (
                <>
                  <div className="mb-4">
                    <div className="text-xs text-dim mb-4">Tire Type</div>
                    <select className="autoprice-select" style={{ width: '100%' }} value={sellTire} onChange={e => {
                      setSellTire(e.target.value);
                      // Auto-set price to default or MAP minimum
                      const t = TIRES[e.target.value];
                      if (t) {
                        const mapFloor = !t.used && MAP_FLOOR[e.target.value]
                          ? Math.ceil(t.def * MAP_FLOOR[e.target.value])
                          : null;
                        setSellPrice(mapFloor || t.def);
                      }
                    }}>
                      <option value="">Select tire...</option>
                      {availTires.map(t => (
                        <option key={t.key} value={t.key}>{t.name} ({t.qty} in stock){t.used ? '' : ' [NEW]'}</option>
                      ))}
                    </select>
                  </div>
                  {mapMin && (
                    <div className="text-xs mb-4" style={{ color: 'var(--accent)' }}>
                      MAP minimum: ${mapMin}/tire (Minimum Advertised Price)
                    </div>
                  )}
                  <div className="row gap-8 mb-4">
                    <div style={{ flex: 1 }}>
                      <div className="text-xs text-dim mb-4">Quantity</div>
                      <input type="number" className="autoprice-offset" style={{ width: '100%' }} min={1} value={sellQty} onChange={e => setSellQty(Math.max(1, Number(e.target.value)))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="text-xs text-dim mb-4">Ask $/tire</div>
                      <input
                        type="number"
                        className="autoprice-offset"
                        style={{ width: '100%' }}
                        min={mapMin || 1}
                        value={sellPrice}
                        onChange={e => setSellPrice(Math.max(mapMin || 1, Number(e.target.value)))}
                      />
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="text-xs text-dim mb-4">Duration</div>
                    <select className="autoprice-select" style={{ width: '100%' }} value={sellDuration} onChange={e => setSellDuration(Number(e.target.value))}>
                      {fees.listingDuration.map(d => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                  <div className="text-xs text-dim mb-4">
                    Tires are escrowed (removed from inventory) when listed.
                    {sellTire && sellQty > 0 && sellPrice > 0 && (
                      <> Total if sold: ${fmt(sellQty * sellPrice)} - ${fmt(estSellerFee)} fee = <span className="font-bold text-green">${fmt(sellQty * sellPrice - estSellerFee)}</span></>
                    )}
                  </div>
                  <button
                    className="btn btn-full btn-sm btn-green"
                    disabled={!sellTire || sellQty <= 0 || sellPrice <= 0 || (mapMin && sellPrice < mapMin) || busy === 'list'}
                    onClick={createListing}
                  >
                    {busy === 'list' ? 'Listing...' : 'Create Listing'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'mine' && (
        <>
          {myListings.length === 0 && (
            <div className="card">
              <div className="text-sm text-dim">You have no listings.</div>
            </div>
          )}
          {myListings.map(listing => {
            const t = TIRES[listing.tireType];
            return (
              <div key={listing.id} className="card">
                <div className="row-between mb-4">
                  <span className="font-bold text-sm">{t?.n || listing.tireType} x{listing.qty}</span>
                  <span className={`text-xs font-bold ${listing.status === 'active' ? 'text-green' : listing.status === 'sold' ? 'text-accent' : 'text-dim'}`}>
                    {listing.status.toUpperCase()}
                  </span>
                </div>
                <div className="row-between text-xs text-dim mb-4">
                  <span>Ask: ${listing.askPrice}/tire</span>
                  <span>Expires day {listing.expiresDay}</span>
                </div>
                {listing.highBid > 0 && (
                  <div className="text-sm mb-4">
                    High bid: <span className="font-bold text-green">${listing.highBid}/tire</span>
                    <span className="text-xs text-dim"> ({listing.bids.length} bid{listing.bids.length !== 1 ? 's' : ''})</span>
                  </div>
                )}
                {listing.status === 'active' && listing.bids.length === 0 && (
                  <button
                    className="btn btn-full btn-sm btn-red"
                    disabled={busy === listing.id}
                    onClick={() => cancelListing(listing.id)}
                  >
                    {busy === listing.id ? 'Cancelling...' : 'Cancel Listing'}
                  </button>
                )}
                {listing.status === 'sold' && (
                  <div className="text-xs text-green">
                    Sold to {listing.bids[listing.bids.length - 1]?.bidderName} for ${listing.highBid * listing.qty}
                    {fees && <span className="text-dim"> (-${Math.floor(listing.highBid * listing.qty * fees.sellerFee)} fee)</span>}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
