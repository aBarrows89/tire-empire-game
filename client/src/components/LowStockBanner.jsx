import React from 'react';

export default function LowStockBanner({ totalInventory, capacity, onClick }) {
  const isLow = totalInventory < 5 || totalInventory < capacity * 0.1;

  if (!isLow) return null;

  return (
    <div
      className="low-stock-banner"
      onClick={onClick}
      style={{
        background: 'var(--red)',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: 10,
        marginBottom: 8,
        cursor: 'pointer',
        fontWeight: 700,
        fontSize: 13,
        textAlign: 'center',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    >
      {'\u26A0'} Low Stock! Tap to source tires
    </div>
  );
}
