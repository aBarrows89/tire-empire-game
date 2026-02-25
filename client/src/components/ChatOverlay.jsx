import React, { useState, useEffect, useRef } from 'react';

export default function ChatOverlay({ messages = [], onSend, isOpen, onClose }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (onSend) onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="chat-overlay"
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        height: '60vh',
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        borderRadius: '14px 14px 0 0',
        zIndex: 150,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideUp .25s ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>Chat</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            fontSize: 20,
            cursor: 'pointer',
            minWidth: 44,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {'\u2715'}
        </button>
      </div>

      <div
        className="chat-messages"
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 14px',
        }}
      >
        {messages.length === 0 && (
          <div className="text-sm text-dim" style={{ textAlign: 'center', paddingTop: 24 }}>
            No messages yet. Say hello!
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent)' }}>{msg.from}</span>
              {msg.ts && (
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{msg.text}</div>
          </div>
        ))}
      </div>

      <div
        className="chat-input"
        style={{
          display: 'flex',
          gap: 8,
          padding: '8px 14px',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          style={{
            flex: 1,
            minHeight: 40,
            padding: '6px 12px',
            borderRadius: 8,
            background: 'var(--card)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          className="btn btn-sm btn-green"
          style={{ minWidth: 56 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
