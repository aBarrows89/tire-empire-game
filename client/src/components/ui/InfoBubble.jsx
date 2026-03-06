import React, { useState } from 'react';

/**
 * Reusable info bubble — "i" button that expands to show help text.
 * Matches the existing ExchangePanel info button style.
 */
export default function InfoBubble({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%', fontSize: 13, fontWeight: 700,
          background: open ? '#2196f3' : 'rgba(33,150,243,0.15)',
          color: open ? '#fff' : '#2196f3',
          cursor: 'pointer', marginLeft: 8, flexShrink: 0,
        }}
      >i</span>
      {open && (
        <div style={{
          background: 'rgba(33,150,243,0.08)', borderRadius: 8,
          padding: '10px 12px', margin: '8px 0', fontSize: 12,
          lineHeight: 1.6, color: 'var(--text-dim)',
        }}>
          {title && <div style={{ fontWeight: 600, color: '#2196f3', marginBottom: 4 }}>{title}</div>}
          {children}
        </div>
      )}
    </>
  );
}
