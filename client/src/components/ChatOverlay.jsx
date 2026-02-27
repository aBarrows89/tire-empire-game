import React, { useState, useEffect, useRef } from 'react';
import { hapticsLight } from '../api/haptics.js';

const CHANNELS = [
  { id: 'global', label: '\u{1F30D} Global' },
  { id: 'trade', label: '\u{1F4B0} Trade' },
  { id: 'help', label: '\u{2753} Help' },
];

export default function ChatOverlay({ messages = [], onSend, isOpen, onClose }) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('global');
  const [typing, setTyping] = useState(false);
  const listRef = useRef(null);
  const typingTimer = useRef(null);

  const filtered = messages.filter(m => !m.channel || m.channel === channel);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filtered, isOpen]);

  // Simulate typing indicator on new messages
  useEffect(() => {
    if (filtered.length > 0) {
      setTyping(false);
    }
  }, [filtered.length]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    hapticsLight();
    if (onSend) onSend(trimmed, channel);
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Show typing indicator briefly when user types
  const handleInput = (e) => {
    setText(e.target.value);
    if (e.target.value.trim()) {
      setTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 2000);
    } else {
      setTyping(false);
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

      {/* Channel tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid var(--border)' }}>
        {CHANNELS.map(ch => (
          <button
            key={ch.id}
            className={`btn btn-sm ${channel === ch.id ? '' : 'btn-outline'}`}
            style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}
            onClick={() => { hapticsLight(); setChannel(ch.id); }}
          >
            {ch.label}
          </button>
        ))}
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
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{'\u{1F4AC}'}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>No Messages Yet</div>
            <div className="text-sm text-dim">Be the first to say hello!</div>
          </div>
        )}
        {filtered.map((msg, i) => (
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
        {typing && (
          <div className="chat-typing-indicator">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" style={{ animationDelay: '.15s' }} />
            <span className="chat-typing-dot" style={{ animationDelay: '.3s' }} />
          </div>
        )}
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
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channel}...`}
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
