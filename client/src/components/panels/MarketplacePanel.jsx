import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { TIRES } from '@shared/constants/tires.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction, API_BASE, headers as apiHeaders } from '../../api/client.js';

const PLAYER_ID = 'dev-player';

export default function MarketplacePanel() {
  const { state, refreshState } = useGame();
  const g = state.game;
  const [listings, setListings] = useState([]);
  const [myListings, setMyListings] = useState([]);
  const [tab, setTab] = useState('browse'); // browse | sell | mine
  const [busy, setBusy] = useState(null);

  // Sell form
  const [sellTire, setSellTire] = useState('');
  const [sellQty, setSellQty] = useState(10);
  const [sellPrice, setSellPrice] = useState(20);
  const [sellDuration, setSellDuration] = useState(2);

  // Bid form
  const [bidAmounts, setBidAmounts] = useState({});

  const headers = apiHeaders;

  const fetchListings = () => {
    fetch(`${API_BASE}/market/listings`).then(r => r.json()).then(setListings).catch(() => {});
    fetch(`${API_BASE}/market/my-listings`, { headers }).then(r => r.json()).then(setMyListings).catch(() => {});
  };

  useEffect(() => { fetchListings(); }, [g.week]);

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
    return { key: k, name: t.n, qty: total };
  });

  const activeListings = listings.filter(l => l.status === 'active' && l.sellerId !== PLAYER_ID);

  return (
    <>
      <div className="card">
        <div className="card-title">Player Marketplace</div>
        <div className="text-xs text-dim mb-4">Buy and sell tires with other players via auction.</div>
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
          {activeListings.length === 0 && (
            <div className="card">
              <div className="text-sm text-dim">No active listings from other players.</div>
            </div>
          )}
          {activeListings.map(listing => {
            const t = TIRES[listing.tireType];
            const totalCost = (bidAmounts[listing.id] || listing.askPrice) * listing.qty;
            return (
              <div key={listing.id} className="card">
                <div className="row-between mb-4">
                  <span className="font-bold text-sm">{t?.n || listing.tireType}</span>
                  <span className="text-xs text-dim">x{listing.qty}</span>
                </div>
                <div className="row-between text-xs mb-4">
                  <span className="text-dim">Seller: {listing.sellerName}</span>
                  <span className="text-dim">Expires wk {listing.expiresWeek}</span>
                </div>
                <div className="row-between text-sm mb-4">
                  <span>Ask: <span className="text-accent">${listing.askPrice}/tire</span></span>
                  <span>High bid: <span className="font-bold text-green">${listing.highBid || '—'}</span></span>
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
                    disabled={!bidAmounts[listing.id] || bidAmounts[listing.id] <= (listing.highBid || 0) || g.cash < totalCost || busy === listing.id}
                    onClick={() => placeBid(listing.id)}
                  >
                    Bid (${fmt(totalCost)})
                  </button>
                </div>
                {g.cash < totalCost && bidAmounts[listing.id] > 0 && (
                  <div className="text-xs text-red">Not enough cash</div>
                )}
              </div>
            );
          })}
        </>
      )}

      {tab === 'sell' && (
        <div className="card">
          <div className="card-title">Create Listing</div>
          {availTires.length === 0 ? (
            <div className="text-sm text-dim">No tires in stock to list.</div>
          ) : (
            <>
              <div className="mb-4">
                <div className="text-xs text-dim mb-4">Tire Type</div>
                <select className="autoprice-select" style={{ width: '100%' }} value={sellTire} onChange={e => setSellTire(e.target.value)}>
                  <option value="">Select tire...</option>
                  {availTires.map(t => (
                    <option key={t.key} value={t.key}>{t.name} ({t.qty} in stock)</option>
                  ))}
                </select>
              </div>
              <div className="row gap-8 mb-4">
                <div style={{ flex: 1 }}>
                  <div className="text-xs text-dim mb-4">Quantity</div>
                  <input type="number" className="autoprice-offset" style={{ width: '100%' }} min={1} value={sellQty} onChange={e => setSellQty(Math.max(1, Number(e.target.value)))} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="text-xs text-dim mb-4">Ask $/tire</div>
                  <input type="number" className="autoprice-offset" style={{ width: '100%' }} min={1} value={sellPrice} onChange={e => setSellPrice(Math.max(1, Number(e.target.value)))} />
                </div>
              </div>
              <div className="mb-4">
                <div className="text-xs text-dim mb-4">Duration (weeks)</div>
                <select className="autoprice-select" style={{ width: '100%' }} value={sellDuration} onChange={e => setSellDuration(Number(e.target.value))}>
                  {[1, 2, 3, 4].map(w => <option key={w} value={w}>{w} week{w > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div className="text-xs text-dim mb-4">
                Tires are escrowed (removed from inventory) when listed.
                {sellTire && sellQty > 0 && sellPrice > 0 && ` Total if sold: $${fmt(sellQty * sellPrice)}`}
              </div>
              <button
                className="btn btn-full btn-sm btn-green"
                disabled={!sellTire || sellQty <= 0 || sellPrice <= 0 || busy === 'list'}
                onClick={createListing}
              >
                {busy === 'list' ? 'Listing...' : 'Create Listing'}
              </button>
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
                  <span>Expires wk {listing.expiresWeek}</span>
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
