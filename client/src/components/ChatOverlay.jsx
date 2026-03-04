import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { hapticsLight } from '../api/haptics.js';
import { useGame } from '../context/GameContext.jsx';
import { postAction, API_BASE, getHeaders, sendWsMessage } from '../api/client.js';

const CHANNELS = [
  { id: 'global', label: '\u{1F30D} Global' },
  { id: 'trade', label: '\u{1F4B0} Trade' },
  { id: 'help', label: '\u{2753} Help' },
  { id: 'dm', label: '\u{1F4E9} DMs' },
];

export default function ChatOverlay({ messages = [], onSend, isOpen, onClose, wsRef }) {
  const [text, setText] = useState('');
  const [channel, setChannel] = useState('global');
  const [typing, setTyping] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [dmPartners, setDmPartners] = useState([]);
  const [dmMessages, setDmMessages] = useState([]);
  const [dmTarget, setDmTarget] = useState(null); // { id, name }
  const [unreadDMs, setUnreadDMs] = useState(0);
  const listRef = useRef(null);
  const typingTimer = useRef(null);

  const { state, refreshState } = useGame();
  const g = state.game;
  const blockedSet = useMemo(() => {
    return new Set((g?.blockedPlayers || []).map(b => b.id));
  }, [g?.blockedPlayers]);

  const filtered = channel === 'dm' ? [] : messages
    .filter(m => !blockedSet.has(m.playerId))
    .filter(m => !m.channel || m.channel === channel);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filtered, dmMessages, isOpen]);

  useEffect(() => {
    if (filtered.length > 0) setTyping(false);
  }, [filtered.length]);

  // Fetch DM partners when switching to DM tab
  useEffect(() => {
    if (channel === 'dm' && isOpen) {
      fetchDMPartners();
    }
  }, [channel, isOpen]);

  const fetchDMPartners = useCallback(async () => {
    try {
      const h = await getHeaders();
      const res = await fetch(`${API_BASE}/chat/dm-partners`, { headers: h });
      const data = await res.json();
      setDmPartners(data.partners || []);
      setUnreadDMs(data.unreadCount || 0);
    } catch {}
  }, []);

  const fetchDMHistory = useCallback(async (partnerId) => {
    try {
      const h = await getHeaders();
      const res = await fetch(`${API_BASE}/chat/dm/${partnerId}`, { headers: h });
      const data = await res.json();
      setDmMessages(data);
    } catch {}
  }, []);

  const openDM = useCallback((id, name) => {
    setDmTarget({ id, name });
    fetchDMHistory(id);
  }, [fetchDMHistory]);

  // Handle incoming DMs from WebSocket
  useEffect(() => {
    if (!state.lastDM) return;
    const dm = state.lastDM;
    if (dmTarget && (dm.fromId === dmTarget.id || dm.toId === dmTarget.id)) {
      setDmMessages(prev => [...prev, dm]);
    }
    setUnreadDMs(prev => prev + 1);
  }, [state.lastDM]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    hapticsLight();
    if (channel === 'dm' && dmTarget) {
      // Send DM via WebSocket
      sendWsMessage(wsRef, { type: 'dm', targetPlayerId: dmTarget.id, text: trimmed });
    } else {
      if (onSend) onSend(trimmed, channel);
    }
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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

  const handleReport = async (messageId, reason) => {
    try {
      const h = await getHeaders();
      await fetch(`${API_BASE}/chat/report`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ messageId, reason }),
      });
    } catch {}
    setReportTarget(null);
  };

  if (!isOpen) return null;

  const s = (overrides) => ({ ...overrides });

  return (
    <div
      className="chat-overlay"
      style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480, height: '60vh', background: 'var(--surface)',
        borderTop: '1px solid var(--border)', borderRadius: '14px 14px 0 0',
        zIndex: 150, display: 'flex', flexDirection: 'column', animation: 'slideUp .25s ease-out',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {channel === 'dm' && dmTarget ? `DM: ${dmTarget.name}` : 'Chat'}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {channel === 'dm' && dmTarget && (
            <button
              onClick={() => { setDmTarget(null); setDmMessages([]); }}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', minWidth: 44, minHeight: 44 }}
            >
              Back
            </button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 20, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {'\u2715'}
          </button>
        </div>
      </div>

      {/* Channel tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid var(--border)' }}>
        {CHANNELS.map(ch => (
          <button
            key={ch.id}
            className={`btn btn-sm ${channel === ch.id ? '' : 'btn-outline'}`}
            style={{ flex: 1, fontSize: 11, padding: '4px 6px', position: 'relative' }}
            onClick={() => { hapticsLight(); setChannel(ch.id); if (ch.id !== 'dm') { setDmTarget(null); setDmMessages([]); } }}
          >
            {ch.label}
            {ch.id === 'dm' && unreadDMs > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: 'var(--red)', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                {unreadDMs > 9 ? '9+' : unreadDMs}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="chat-messages" ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {/* DM Partner List */}
        {channel === 'dm' && !dmTarget && (
          <>
            {dmPartners.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 40 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>{'\u{1F4E9}'}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>No Conversations</div>
                <div className="text-sm text-dim">Tap a player name in chat to start a DM</div>
              </div>
            ) : (
              dmPartners.map(p => (
                <div
                  key={p.partner}
                  onClick={() => openDM(p.partner, p.partner_name || p.partner)}
                  style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>{p.partner_name || p.partner}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                    {p.last_at ? new Date(p.last_at).toLocaleDateString() : ''}
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {/* DM Messages */}
        {channel === 'dm' && dmTarget && (
          <>
            {dmMessages.length === 0 && (
              <div style={{ textAlign: 'center', paddingTop: 40 }}>
                <div className="text-sm text-dim">Start the conversation!</div>
              </div>
            )}
            {dmMessages.map((msg, i) => {
              const isMe = msg.fromId === g?.id;
              return (
                <div key={msg.id || i} style={{ marginBottom: 8, textAlign: isMe ? 'right' : 'left' }}>
                  <div style={{
                    display: 'inline-block', maxWidth: '80%', padding: '6px 10px', borderRadius: 10,
                    background: isMe ? 'var(--accent)' : 'var(--card)', color: isMe ? '#000' : 'var(--text)',
                    fontSize: 13, lineHeight: 1.4, textAlign: 'left',
                  }}>
                    {msg.text}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Channel Messages */}
        {channel !== 'dm' && (
          <>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', paddingTop: 40 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>{'\u{1F4AC}'}</div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>No Messages Yet</div>
                <div className="text-sm text-dim">Be the first to say hello!</div>
              </div>
            )}
            {filtered.map((msg, i) => (
              <div key={msg.id || i} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span
                    style={{ fontWeight: 700, fontSize: 12, color: 'var(--accent)', cursor: 'pointer' }}
                    onClick={() => {
                      if (msg.playerId && msg.playerId !== g?.id) {
                        hapticsLight();
                        setBlockTarget({ id: msg.playerId, name: msg.playerName || msg.from || 'Unknown' });
                      }
                    }}
                  >
                    {msg.playerName || msg.from}
                  </span>
                  {(msg.timestamp || msg.ts) && (
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                      {new Date(msg.timestamp || msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {msg.id && msg.playerId !== g?.id && (
                    <span
                      style={{ fontSize: 10, color: 'var(--text-dim)', cursor: 'pointer', marginLeft: 'auto' }}
                      onClick={() => { hapticsLight(); setReportTarget(msg); }}
                    >
                      {'\u{1F6A9}'}
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
          </>
        )}
      </div>

      {/* Input bar */}
      {(channel !== 'dm' || dmTarget) && (
        <div className="chat-input" style={{ display: 'flex', gap: 8, padding: '8px 14px', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)', borderTop: '1px solid var(--border)' }}>
          <input
            type="text" value={text} onChange={handleInput} onKeyDown={handleKeyDown}
            placeholder={channel === 'dm' ? `Message ${dmTarget?.name}...` : `Message #${channel}...`}
            style={{ flex: 1, minHeight: 40, padding: '6px 12px', borderRadius: 8, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 14, outline: 'none' }}
          />
          <button onClick={handleSend} className="btn btn-sm btn-green" style={{ minWidth: 56 }}>Send</button>
        </div>
      )}

      {/* Block player confirmation */}
      {blockTarget && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: '14px 14px 0 0' }} onClick={() => setBlockTarget(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, width: '80%', maxWidth: 300, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
              {blockTarget.name}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={() => { openDM(blockTarget.id, blockTarget.name); setChannel('dm'); setBlockTarget(null); }}>
                {'\u{1F4E9}'} DM
              </button>
              <button className="btn btn-sm" style={{ flex: 1, background: 'var(--red)', color: '#fff' }} onClick={async () => { await postAction('blockPlayer', { targetPlayerId: blockTarget.id, targetName: blockTarget.name }); refreshState(); setBlockTarget(null); }}>
                Block
              </button>
            </div>
            <button className="btn btn-sm btn-outline" style={{ width: '100%' }} onClick={() => setBlockTarget(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Report message modal */}
      {reportTarget && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, borderRadius: '14px 14px 0 0' }} onClick={() => setReportTarget(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, width: '80%', maxWidth: 300, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Report Message</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>"{reportTarget.text?.slice(0, 80)}"</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {['Spam', 'Harassment', 'Inappropriate content', 'Scam'].map(reason => (
                <button key={reason} className="btn btn-sm btn-outline" onClick={() => handleReport(reportTarget.id, reason)}>
                  {reason}
                </button>
              ))}
            </div>
            <button className="btn btn-sm btn-outline" style={{ width: '100%', marginTop: 8 }} onClick={() => setReportTarget(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
