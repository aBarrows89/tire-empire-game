import React from 'react';

/**
 * Bid/ask depth display for order book visualization.
 * @param {{ orderBook: { bids: Array, asks: Array, npcBids?: Array, npcAsks?: Array, lastTradePrice?: number } }} props
 */
export default function OrderBookView({ orderBook }) {
  if (!orderBook) return null;

  const allBids = [...(orderBook.bids || []), ...(orderBook.npcBids || [])].sort((a, b) => b.price - a.price).slice(0, 5);
  const allAsks = [...(orderBook.asks || []), ...(orderBook.npcAsks || [])].sort((a, b) => a.price - b.price).slice(0, 5);

  const maxQty = Math.max(
    ...allBids.map(o => o.qty),
    ...allAsks.map(o => o.qty),
    1
  );

  return (
    <div className="card" style={{ marginBottom: 8, padding: '8px 12px' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Order Book</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Bids */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
            <span>Price</span><span>Qty</span>
          </div>
          {allBids.map((o, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: 2 }}>
              <div style={{
                position: 'absolute', right: 0, top: 0, bottom: 0,
                width: `${(o.qty / maxQty) * 100}%`,
                background: 'rgba(76, 175, 80, 0.15)',
                borderRadius: 3,
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, position: 'relative', padding: '1px 4px' }}>
                <span style={{ color: '#4CAF50' }}>${o.price?.toFixed(2)}</span>
                <span>{o.qty}</span>
              </div>
            </div>
          ))}
          {allBids.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>No bids</div>}
        </div>

        {/* Asks */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
            <span>Price</span><span>Qty</span>
          </div>
          {allAsks.map((o, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: 2 }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${(o.qty / maxQty) * 100}%`,
                background: 'rgba(244, 67, 54, 0.15)',
                borderRadius: 3,
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, position: 'relative', padding: '1px 4px' }}>
                <span style={{ color: '#f44336' }}>${o.price?.toFixed(2)}</span>
                <span>{o.qty}</span>
              </div>
            </div>
          ))}
          {allAsks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>No asks</div>}
        </div>
      </div>
      {orderBook.lastTradePrice && (
        <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, color: 'var(--text-dim)' }}>
          Last trade: ${orderBook.lastTradePrice?.toFixed(2)}
        </div>
      )}
    </div>
  );
}
