import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { TIRES } from '@shared/constants/tires.js';
import { MAP_FLOOR } from '@shared/constants/wholesale.js';
import { P2P_FEES, MARKETPLACE_SPECIALIST } from '@shared/constants/marketplace.js';
import { fmt } from '@shared/helpers/format.js';
import { postAction, API_BASE, getHeaders, fetchShopListings, sendShopOffer, sendShopMessage, fetchShopMessages } from '../../api/client.js';
import { getUid } from '../../services/firebase.js';

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

  // Real Estate tab state
  const [shopListings, setShopListings] = useState([]);
  const [offerForm, setOfferForm] = useState({});
  const [shopMessages, setShopMessages] = useState({});
  const [msgInput, setMsgInput] = useState({});

  const PLAYER_ID = getUid() || g?.id;
  const tier = getPlayerTier(g);
  const fees = tier ? P2P_FEES[tier] : null;
  const hasAccess = tier !== null;

  const fetchAllListings = () => {
    getHeaders().then(h => {
      fetch(`${API_BASE}/market/listings`, { headers: h }).then(r => r.json()).then(setListings).catch(() => {});
      fetch(`${API_BASE}/market/my-listings`, { headers: h }).then(r => r.json()).then(setMyListings).catch(() => {});
    });
    fetchShopListings().then(setShopListings).catch(() => {});
  };

  const fetchListings = fetchAllListings;

  useEffect(() => { fetchAllListings(); }, [g.day || g.week]);

  const createListing = async () => {
    if (!sellTire || sellQty <= 0 || sellPrice <= 0) return;
    setBusy('list');
    const response = await fetch(`${API_BASE}/market/list`, {
      method: 'POST', headers,
      body: JSON.stringify({ tireType: sellTire, qty: sellQty, askPrice: sellPrice, duration: sellDuration }),
    });
    const res = await response.json();
    if (response.ok && res.ok) {
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
    const response = await fetch(`${API_BASE}/market/bid`, {
      method: 'POST', headers,
      body: JSON.stringify({ listingId, pricePerTire: price }),
    });
    const res = await response.json();
    if (response.ok && res.ok) fetchListings();
    setBusy(null);
  };

  const cancelListing = async (listingId) => {
    setBusy(listingId);
    const response = await fetch(`${API_BASE}/market/cancel`, {
      method: 'POST', headers,
      body: JSON.stringify({ listingId }),
    });
    const res = await response.json();
    if (response.ok && res.ok) {
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
        <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
          {['browse', 'sell', 'mine', 'realestate'].map(t => (
            <button
              key={t}
              className={`btn btn-sm ${tab === t ? '' : 'btn-outline'}`}
              onClick={() => setTab(t)}
              style={{ flex: 1, minWidth: 70 }}
            >
              {t === 'browse' ? 'Browse' : t === 'sell' ? 'List' : t === 'mine' ? 'Mine' : 'Real Estate'}
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

      {tab === 'realestate' && (
        <>
          <div className="card">
            <div className="card-title">Shop Real Estate</div>
            <div className="text-xs text-dim mb-4">
              Buy and sell tire shops with other players. Negotiate terms: cash, installments, or revenue share.
            </div>
          </div>

          {/* Your own listings */}
          {shopListings.filter(l => l.sellerId === PLAYER_ID && l.status === 'active').length > 0 && (
            <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
              <div className="text-xs font-bold mb-4">Your Listed Shops</div>
              {shopListings.filter(l => l.sellerId === PLAYER_ID && l.status === 'active').map(l => (
                <div key={l.id} className="bid-card">
                  <div className="row-between text-sm">
                    <span className="font-bold">{l.cityName}, {l.state}</span>
                    <span className="text-accent font-bold">${fmt(l.askingPrice)}</span>
                  </div>
                  <div className="text-xs text-dim">
                    {l.offers.filter(o => o.status === 'pending').length} pending offer{l.offers.filter(o => o.status === 'pending').length !== 1 ? 's' : ''}
                    &middot; Listed day {l.listedDay}
                  </div>
                </div>
              ))}
            </div>
          )}

          {shopListings.filter(l => l.sellerId !== PLAYER_ID && l.status === 'active').length === 0 && (
            <div className="card">
              <div className="text-sm text-dim">No shops listed for sale by other players.</div>
            </div>
          )}

          {shopListings.filter(l => l.sellerId !== PLAYER_ID && l.status === 'active').map(listing => {
            const form = offerForm[listing.id] || {};
            const showForm = form.open;
            const msgs = shopMessages[listing.id] || [];

            return (
              <div key={listing.id} className="shop-listing-card">
                <div className="row-between mb-4">
                  <span className="font-bold text-sm">{listing.cityName}, {listing.state}</span>
                  <span className="badge-listed">FOR SALE</span>
                </div>
                <div className="val-grid mb-4">
                  <span className="text-dim">Asking Price</span>
                  <span className="font-bold text-accent">${fmt(listing.askingPrice)}</span>
                  <span className="text-dim">Valuation</span>
                  <span>${fmt(listing.valuation?.totalValue || 0)}</span>
                  <span className="text-dim">Loyalty</span>
                  <span>{listing.loyalty}%</span>
                  <span className="text-dim">Inventory</span>
                  <span>{listing.inventorySummary?.totalTires || 0} tires</span>
                </div>

                {/* Valuation Breakdown */}
                {listing.valuation && (
                  <div className="card-section">
                    <div className="text-xs font-bold mb-4">Valuation Breakdown</div>
                    <div className="val-grid mb-4">
                      <span className="text-dim">Base Value</span>
                      <span>${fmt(listing.valuation.baseValue)}</span>
                      <span className="text-dim">Inventory Value</span>
                      <span>${fmt(listing.valuation.inventoryValue)}</span>
                      <span className="text-dim">Loyalty Bonus</span>
                      <span>${fmt(listing.valuation.loyaltyBonus)}</span>
                      <span className="text-dim">Revenue Bonus</span>
                      <span>${fmt(listing.valuation.revenueBonus)}</span>
                      <span className="text-dim font-bold">Total Valuation</span>
                      <span className="font-bold">${fmt(listing.valuation.totalValue)}</span>
                    </div>
                  </div>
                )}

                {/* Monthly Financials */}
                <div className="card-section">
                  <div className="text-xs font-bold mb-4">Monthly Financials</div>
                  <div className="val-grid mb-4">
                    <span className="text-dim">Est. Monthly Revenue</span>
                    <span className="text-green">${fmt(listing.monthlyRevenue || Math.round(listing.dayRevenue * 30))}</span>
                    <span className="text-dim">Rent</span>
                    <span className="text-red">-${fmt(listing.monthlyRent || 0)}</span>
                    <span className="text-dim">Staff</span>
                    <span className="text-red">-${fmt(listing.monthlyStaffCost || 0)}</span>
                    <span className="text-dim font-bold">Est. Monthly Expenses</span>
                    <span className="text-red font-bold">-${fmt(listing.monthlyExpenses || 0)}</span>
                    <span className="text-dim font-bold">Est. Monthly Profit</span>
                    <span className={`font-bold ${(listing.monthlyRevenue || Math.round(listing.dayRevenue * 30)) - (listing.monthlyExpenses || 0) >= 0 ? 'text-green' : 'text-red'}`}>
                      ${fmt((listing.monthlyRevenue || Math.round(listing.dayRevenue * 30)) - (listing.monthlyExpenses || 0))}
                    </span>
                  </div>
                </div>

                {listing.inventorySummary?.tireTypes?.length > 0 && (
                  <div className="text-xs text-dim mb-4">
                    {listing.inventorySummary.tireTypes.join(', ')}
                  </div>
                )}
                <div className="text-xs text-dim mb-4">Seller: {listing.sellerName} &middot; Listed day {listing.listedDay}</div>

                {/* Existing offers on this listing */}
                {listing.offers.filter(o => o.status === 'pending').length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-bold mb-4">Active Offers:</div>
                    {listing.offers.filter(o => o.status === 'pending').map(o => (
                      <div key={o.id} className="bid-card">
                        <div className="row-between text-xs">
                          <span className="font-bold">{o.bidderName}</span>
                          <span className="font-bold text-green">${fmt(o.bidPrice)}</span>
                        </div>
                        <div className="text-xs text-dim">
                          {o.paymentType === 'cash' ? 'Cash' :
                           o.paymentType === 'installment' ? `${Math.round(o.downPct * 100)}% down, ${o.months}mo` :
                           `RevShare ${Math.round(o.revSharePct * 100)}% for ${o.revShareMonths}mo`}
                          {o.isCounter && ' (Counter)'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Messages thread */}
                {msgs.length > 0 && (
                  <div className="msg-thread">
                    {msgs.map(m => (
                      <div key={m.id} className={`msg-bubble ${m.senderId === PLAYER_ID ? 'mine' : 'theirs'}`}>
                        <div className="msg-sender">{m.senderName}</div>
                        {m.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Message input */}
                {listing.offers.some(o => o.bidderId === PLAYER_ID) && (
                  <div className="row gap-8 mb-4">
                    <input
                      className="input input-sm"
                      style={{ flex: 1 }}
                      placeholder="Send message..."
                      value={msgInput[listing.id] || ''}
                      onChange={e => setMsgInput(p => ({ ...p, [listing.id]: e.target.value }))}
                    />
                    <button
                      className="btn btn-sm"
                      disabled={!msgInput[listing.id]?.trim() || busy === `msg-${listing.id}`}
                      onClick={async () => {
                        setBusy(`msg-${listing.id}`);
                        await sendShopMessage({ listingId: listing.id, text: msgInput[listing.id] });
                        setMsgInput(p => ({ ...p, [listing.id]: '' }));
                        const updated = await fetchShopMessages(listing.id);
                        setShopMessages(p => ({ ...p, [listing.id]: updated }));
                        setBusy(null);
                      }}
                    >
                      Send
                    </button>
                  </div>
                )}

                {!showForm ? (
                  <button
                    className="btn btn-full btn-sm btn-green"
                    onClick={async () => {
                      setOfferForm(p => ({ ...p, [listing.id]: { open: true, paymentType: 'cash', bidPrice: listing.askingPrice, downPct: 20, months: 12, revSharePct: 10, revShareMonths: 12, message: '' } }));
                      // Load messages
                      if (listing.offers.some(o => o.bidderId === PLAYER_ID)) {
                        const msgs2 = await fetchShopMessages(listing.id).catch(() => []);
                        setShopMessages(p => ({ ...p, [listing.id]: msgs2 }));
                      }
                    }}
                  >
                    Make Offer
                  </button>
                ) : (
                  <div className="card-section">
                    <div className="text-xs font-bold mb-4">Your Offer</div>
                    <div className="mb-4">
                      <div className="text-xs text-dim mb-4">Payment Type</div>
                      <select
                        className="input input-sm"
                        value={form.paymentType || 'cash'}
                        onChange={e => setOfferForm(p => ({ ...p, [listing.id]: { ...p[listing.id], paymentType: e.target.value } }))}
                      >
                        <option value="cash">Cash (Full Payment)</option>
                        <option value="installment">Installment Plan</option>
                        <option value="revShare">Revenue Share</option>
                      </select>
                    </div>
                    <div className="mb-4">
                      <div className="text-xs text-dim mb-4">Offer Price ($)</div>
                      <input
                        type="number"
                        className="input input-sm"
                        value={form.bidPrice || ''}
                        onChange={e => setOfferForm(p => ({ ...p, [listing.id]: { ...p[listing.id], bidPrice: Number(e.target.value) || 0 } }))}
                      />
                    </div>
                    {form.paymentType === 'installment' && (
                      <div className="row gap-8 mb-4">
                        <div style={{ flex: 1 }}>
                          <div className="text-xs text-dim mb-4">Down %</div>
                          <input type="number" className="input input-sm" min={5} max={90}
                            value={form.downPct || 20}
                            onChange={e => setOfferForm(p => ({ ...p, [listing.id]: { ...p[listing.id], downPct: Number(e.target.value) || 20 } }))}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="text-xs text-dim mb-4">Months</div>
                          <input type="number" className="input input-sm" min={1} max={36}
                            value={form.months || 12}
                            onChange={e => setOfferForm(p => ({ ...p, [listing.id]: { ...p[listing.id], months: Number(e.target.value) || 12 } }))}
                          />
                        </div>
                      </div>
                    )}
                    {form.paymentType === 'revShare' && (
                      <div className="row gap-8 mb-4">
                        <div style={{ flex: 1 }}>
                          <div className="text-xs text-dim mb-4">Rev Share %</div>
                          <input type="number" className="input input-sm" min={1} max={50}
                            value={form.revSharePct || 10}
                            onChange={e => setOfferForm(p => ({ ...p, [listing.id]: { ...p[listing.id], revSharePct: Number(e.target.value) || 10 } }))}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="text-xs text-dim mb-4">Months</div>
                          <input type="number" className="input input-sm" min={1} max={36}
                            value={form.revShareMonths || 12}
                            onChange={e => setOfferForm(p => ({ ...p, [listing.id]: { ...p[listing.id], revShareMonths: Number(e.target.value) || 12 } }))}
                          />
                        </div>
                      </div>
                    )}
                    <div className="mb-4">
                      <div className="text-xs text-dim mb-4">Message (optional)</div>
                      <input
                        className="input input-sm"
                        placeholder="Add a note to the seller..."
                        value={form.message || ''}
                        onChange={e => setOfferForm(p => ({ ...p, [listing.id]: { ...p[listing.id], message: e.target.value } }))}
                      />
                    </div>
                    {form.paymentType === 'cash' && form.bidPrice > g.cash && (
                      <div className="text-xs text-red mb-4">Not enough cash (have ${fmt(g.cash)})</div>
                    )}
                    <div className="row gap-8">
                      <button
                        className="btn btn-sm btn-green"
                        style={{ flex: 1 }}
                        disabled={!form.bidPrice || form.bidPrice <= 0 || (form.paymentType === 'cash' && form.bidPrice > g.cash) || busy === `offer-${listing.id}`}
                        onClick={async () => {
                          setBusy(`offer-${listing.id}`);
                          await sendShopOffer({
                            listingId: listing.id,
                            bidPrice: form.bidPrice,
                            paymentType: form.paymentType,
                            downPct: (form.downPct || 20) / 100,
                            months: form.months || 12,
                            revSharePct: (form.revSharePct || 10) / 100,
                            revShareMonths: form.revShareMonths || 12,
                            message: form.message,
                          });
                          setOfferForm(p => ({ ...p, [listing.id]: { open: false } }));
                          fetchAllListings();
                          setBusy(null);
                        }}
                      >
                        {busy === `offer-${listing.id}` ? '...' : 'Submit Offer'}
                      </button>
                      <button
                        className="btn btn-sm btn-outline"
                        style={{ flex: 1 }}
                        onClick={() => setOfferForm(p => ({ ...p, [listing.id]: { open: false } }))}
                      >
                        Cancel
                      </button>
                    </div>
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
