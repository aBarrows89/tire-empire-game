import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext.jsx';
import { getRubberListings, getRubberPrices, listRubber, buyRubberListing, cancelRubberListing } from '../../api/client.js';
import { fmt } from '@shared/helpers/format.js';
import { hapticsMedium } from '../../api/haptics.js';

export default function RubberMarketPanel({ onClose }) {
  const { state, refreshState } = useGame();
  const g = state.game;
  const factory = g.factory || null;
  const [listings, setListings] = useState([]);
  const [prices, setPrices] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('browse'); // browse | sell
  const [listType, setListType] = useState('natural');
  const [listQty, setListQty] = useState(10);
  const [listPrice, setListPrice] = useState(500);

  const load = async () => {
    const [listRes, priceRes] = await Promise.all([getRubberListings(), getRubberPrices()]);
    if (listRes.listings) setListings(listRes.listings);
    if (priceRes.npcNaturalPrice != null) setPrices(priceRes);
  };

  useEffect(() => { load(); }, []);

  const handleBuy = async (listingId, qty) => {
    setBusy(true);
    const res = await buyRubberListing(listingId, qty);
    if (res.ok) { hapticsMedium(); await refreshState(); await load(); }
    setBusy(false);
  };

  const handleCancel = async (listingId) => {
    setBusy(true);
    const res = await cancelRubberListing(listingId);
    if (res.ok) { hapticsMedium(); await refreshState(); await load(); }
    setBusy(false);
  };

  const handleList = async () => {
    setBusy(true);
    const res = await listRubber(listType, listQty, listPrice);
    if (res.ok) { hapticsMedium(); await refreshState(); await load(); }
    setBusy(false);
  };

  const naturalListings = listings.filter(l => l.listingType === 'rubber_natural');
  const syntheticListings = listings.filter(l => l.listingType === 'rubber_synthetic');
  const myListings = listings.filter(l => l.sellerId === state.playerId);

  return (
    <div style={{ padding: 16 }}>
      <div className="row-between mb-4">
        <div className="text-lg font-bold">Rubber Market</div>
        {onClose && <button className="btn btn-sm btn-outline" onClick={onClose}>Back</button>}
      </div>

      {/* NPC Reference Prices */}
      {prices && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="row-between text-sm">
            <span className="text-dim">NPC Natural</span>
            <span className="font-bold">${fmt(prices.npcNaturalPrice)}/unit</span>
          </div>
          <div className="row-between text-sm">
            <span className="text-dim">NPC Synthetic</span>
            <span className="font-bold">${fmt(prices.npcSyntheticPrice)}/unit</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="row gap-8 mb-4">
        <button className={`btn btn-sm ${tab === 'browse' ? 'btn-accent' : 'btn-outline'}`}
          onClick={() => setTab('browse')}>Browse</button>
        <button className={`btn btn-sm ${tab === 'sell' ? 'btn-accent' : 'btn-outline'}`}
          onClick={() => setTab('sell')}>List Your Rubber</button>
      </div>

      {tab === 'browse' && (
        <>
          {/* Market Stats */}
          {prices && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div className="card-title">Market Stats</div>
              <div className="row gap-8">
                <div style={{ flex: 1 }}>
                  <div className="text-xs text-dim">Natural</div>
                  <div className="text-sm">{prices.natural.sellerCount} sellers, {prices.natural.totalQty} units</div>
                  {prices.natural.avgPrice > 0 && <div className="text-sm">Avg: ${fmt(prices.natural.avgPrice)}/unit</div>}
                  {prices.natural.isMonopoly && <div className="text-xs text-red font-bold">Monopoly</div>}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="text-xs text-dim">Synthetic</div>
                  <div className="text-sm">{prices.synthetic.sellerCount} sellers, {prices.synthetic.totalQty} units</div>
                  {prices.synthetic.avgPrice > 0 && <div className="text-sm">Avg: ${fmt(prices.synthetic.avgPrice)}/unit</div>}
                  {prices.synthetic.isMonopoly && <div className="text-xs text-red font-bold">Monopoly</div>}
                </div>
              </div>
            </div>
          )}

          {/* Natural Listings */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ color: '#4caf50' }}>Natural Rubber</div>
            {naturalListings.length === 0 && <div className="text-sm text-dim">No listings</div>}
            {naturalListings.map(l => (
              <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="row-between text-sm">
                  <span>{l.sellerName}</span>
                  <span className="font-bold">${fmt(l.pricePerUnit)}/unit</span>
                </div>
                <div className="row-between text-xs">
                  <span className="text-dim">{l.qty} units</span>
                  <span className="font-bold">${fmt(l.qty * l.pricePerUnit)} total</span>
                </div>
                {l.sellerId !== state.playerId && (
                  <button className="btn btn-sm btn-green" style={{ marginTop: 4 }}
                    disabled={busy || !factory?.rubberStorage}
                    onClick={() => handleBuy(l.id, l.qty)}>
                    Buy All
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Synthetic Listings */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ color: '#2196f3' }}>Synthetic Rubber</div>
            {syntheticListings.length === 0 && <div className="text-sm text-dim">No listings</div>}
            {syntheticListings.map(l => (
              <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div className="row-between text-sm">
                  <span>{l.sellerName}</span>
                  <span className="font-bold">${fmt(l.pricePerUnit)}/unit</span>
                </div>
                <div className="row-between text-xs">
                  <span className="text-dim">{l.qty} units</span>
                  <span className="font-bold">${fmt(l.qty * l.pricePerUnit)} total</span>
                </div>
                {l.sellerId !== state.playerId && (
                  <button className="btn btn-sm btn-green" style={{ marginTop: 4 }}
                    disabled={busy || !factory?.rubberStorage}
                    onClick={() => handleBuy(l.id, l.qty)}>
                    Buy All
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* My Active Listings */}
          {myListings.length > 0 && (
            <div className="card">
              <div className="card-title">My Listings</div>
              {myListings.map(l => (
                <div key={l.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div className="row-between text-sm">
                    <span>{l.rubberType} x{l.qty}</span>
                    <span>${fmt(l.pricePerUnit)}/unit</span>
                  </div>
                  <button className="btn btn-sm btn-red" style={{ marginTop: 4 }}
                    disabled={busy} onClick={() => handleCancel(l.id)}>
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'sell' && (
        <div className="card">
          <div className="card-title">List Rubber for Sale</div>
          <div className="text-xs text-dim mb-4">
            Rubber is escrowed (removed from storage) until sold or cancelled.
          </div>
          <div style={{ marginBottom: 8 }}>
            <label className="text-xs text-dim">Type</label>
            <select value={listType} onChange={e => setListType(e.target.value)}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
              <option value="natural">Natural ({factory?.naturalRubber || 0} available)</option>
              <option value="synthetic">Synthetic ({factory?.syntheticRubber || 0} available)</option>
            </select>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label className="text-xs text-dim">Quantity</label>
            <input type="number" min={1}
              max={listType === 'natural' ? (factory?.naturalRubber || 0) : (factory?.syntheticRubber || 0)}
              value={listQty} onChange={e => setListQty(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label className="text-xs text-dim">Price per unit ($)</label>
            <input type="number" min={1} value={listPrice}
              onChange={e => setListPrice(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
          </div>
          <div className="text-sm mb-4">
            Total: <span className="font-bold">${fmt(listQty * listPrice)}</span>
          </div>
          <button className="btn btn-full btn-green" disabled={busy || !factory?.rubberStorage}
            onClick={handleList}>
            List {listQty} {listType} at ${fmt(listPrice)}/unit
          </button>
        </div>
      )}
    </div>
  );
}
