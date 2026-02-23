import { useEffect, useRef } from 'react';

// Detect if running inside a Capacitor native app
const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform();

// For native builds: set VITE_SERVER_URL to your hosted server
// e.g. VITE_SERVER_URL=http://192.168.1.50:3000 (dev LAN)
// e.g. VITE_SERVER_URL=https://tireempire.example.com (production)
const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// If SERVER_URL is set (native builds), use full URL; otherwise relative /api (browser dev)
const API_BASE = SERVER_URL ? `${SERVER_URL}/api` : '/api';

// Export for components that make direct fetch calls
export { API_BASE, headers };

const PLAYER_ID = 'dev-player';

const headers = {
  'Content-Type': 'application/json',
  'X-Player-Id': PLAYER_ID,
  'ngrok-skip-browser-warning': 'true',
};

export async function getState() {
  const res = await fetch(`${API_BASE}/state`, { headers });
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
  return res.json();
}

export async function registerPlayer(playerName, companyName) {
  const res = await fetch(`${API_BASE}/state/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ playerName, companyName }),
  });
  if (!res.ok) throw new Error(`POST /api/state/register failed: ${res.status}`);
  return res.json();
}

export async function postAction(action, params = {}) {
  const res = await fetch(`${API_BASE}/action`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...params }),
  });
  return res.json();
}

export async function getMarket() {
  const res = await fetch(`${API_BASE}/market`, { headers });
  return res.json();
}

export async function getLeaderboard() {
  const res = await fetch(`${API_BASE}/leaderboard`, { headers });
  return res.json();
}

export function useWebSocket(onTick) {
  const cbRef = useRef(onTick);
  cbRef.current = onTick;

  useEffect(() => {
    let wsUrl;
    if (SERVER_URL) {
      // Convert http(s) to ws(s) for native
      wsUrl = SERVER_URL.replace(/^http/, 'ws');
    } else {
      wsUrl = `ws://${window.location.hostname}:3000`;
    }

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', playerId: PLAYER_ID }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'tick') cbRef.current(msg);
      } catch {}
    };

    ws.onerror = () => {};
    ws.onclose = () => {
      // Reconnect after 3s
      setTimeout(() => {}, 3000);
    };

    return () => ws.close();
  }, []);
}
