import React, { useEffect, useState, useRef } from 'react';
import { hapticsLight } from '../api/haptics.js';
import { playSound } from '../api/sounds.js';

const SEVERITY_STYLES = {
  info: { bg: 'linear-gradient(135deg, #1a2a3a, #2a3a4a)', border: 'var(--accent)' },
  warning: { bg: 'linear-gradient(135deg, #3a2a00, #5a4000)', border: '#f0c040' },
  critical: { bg: 'linear-gradient(135deg, #3a0a0a, #5a1010)', border: 'var(--red)' },
};

export default function NotificationToast({ notifications, onDismiss }) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    hapticsLight();
    playSound('notification');
    setVisible(true);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => { if (onDismiss) onDismiss(); }, 300);
    }, 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [notifications, onDismiss]);

  if (!notifications || notifications.length === 0) return null;

  return (
    <div
      onClick={() => {
        setVisible(false);
        setTimeout(() => { if (onDismiss) onDismiss(); }, 100);
      }}
      style={{
        position: 'fixed',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        zIndex: 199,
        padding: '12px 16px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {notifications.map((notif, i) => {
        const style = SEVERITY_STYLES[notif.severity] || SEVERITY_STYLES.info;
        return (
          <div
            key={i}
            style={{
              background: style.bg,
              border: `1px solid ${style.border}`,
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: i < notifications.length - 1 ? 6 : 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              animation: 'slideDown .35s ease-out',
            }}
          >
            <span style={{ fontSize: 24 }}>{notif.icon || '\u{1F514}'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: style.border }}>
                {notif.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                {notif.message}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
