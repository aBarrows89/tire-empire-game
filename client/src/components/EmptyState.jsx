import React from 'react';

const VINNIE_MOODS = {
  shrug: '\u{1F937}',
  trophy: '\u{1F3C6}',
  handshake: '\u{1F91D}',
  speech: '\u{1F4AC}',
  clipboard: '\u{1F4CB}',
  search: '\u{1F50D}',
  shop: '\u{1F3EA}',
};

export default function EmptyState({ vinnie = 'shrug', title, message, actionLabel, onAction }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>
        {VINNIE_MOODS[vinnie] || vinnie}
      </div>
      {title && (
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          {title}
        </div>
      )}
      {message && (
        <div className="text-sm text-dim" style={{ lineHeight: 1.5, marginBottom: actionLabel ? 12 : 0 }}>
          {message}
        </div>
      )}
      {actionLabel && onAction && (
        <button className="btn btn-sm btn-green" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
