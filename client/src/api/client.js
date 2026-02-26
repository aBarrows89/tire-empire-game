import { useEffect, useRef } from 'react';

// Detect if running inside a Capacitor native app
const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform();

// For native builds: set VITE_SERVER_URL to your hosted server
// e.g. VITE_SERVER_URL=http://192.168.1.50:3000 (dev LAN)
// e.g. VITE_SERVER_URL=https://tireempire.example.com (production)
const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// If SERVER_URL is set (native builds), use full URL; otherwise relative /api (browser dev)
const API_BASE = SERVER_URL ? `${SERVER_URL}/api` : '/api';

const PLAYER_ID = 'dev-player';

const headers = {
  'Content-Type': 'application/json',
  'X-Player-Id': PLAYER_ID,
  'ngrok-skip-browser-warning': 'true',
};

// Export for components that make direct fetch calls
export { API_BASE, headers };

/**
 * Fetch with automatic retry on failure.
 * @param {string} url
 * @param {object} opts - fetch options
 * @param {number} retries - number of retries (default 2)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, opts = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || attempt === retries) return res;
      // Retry on server errors (5xx)
      if (res.status >= 500) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return res; // Client errors (4xx) don't retry
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

export async function getState() {
  const res = await fetchWithRetry(`${API_BASE}/state`, { headers });
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
  return res.json();
}

export async function registerPlayer(playerName, companyName) {
  const res = await fetchWithRetry(`${API_BASE}/state/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ playerName, companyName }),
  });
  if (!res.ok) throw new Error(`POST /api/state/register failed: ${res.status}`);
  return res.json();
}

export async function postAction(action, params = {}) {
  const res = await fetchWithRetry(`${API_BASE}/action`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...params }),
  });
  return res.json();
}

export async function getMarket() {
  const res = await fetchWithRetry(`${API_BASE}/market`, { headers });
  return res.json();
}

export async function getLeaderboard() {
  const res = await fetchWithRetry(`${API_BASE}/leaderboard`, { headers });
  return res.json();
}

export async function getTrades() {
  const res = await fetchWithRetry(`${API_BASE}/trade`, { headers });
  return res.json();
}

export async function createTradeOffer(params) {
  const res = await fetchWithRetry(`${API_BASE}/trade/offer`, {
    method: 'POST', headers,
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function tradeAction(action, tradeId) {
  const res = await fetchWithRetry(`${API_BASE}/trade/${action}`, {
    method: 'POST', headers,
    body: JSON.stringify({ tradeId }),
  });
  return res.json();
}

export function useWebSocket(onTick, onChat) {
  const tickRef = useRef(onTick);
  const chatRef = useRef(onChat);
  const wsRef = useRef(null);
  tickRef.current = onTick;
  chatRef.current = onChat;

  useEffect(() => {
    let destroyed = false;
    let reconnectTimeout = null;

    function connect() {
      if (destroyed) return;
      let wsUrl;
      if (SERVER_URL) {
        wsUrl = SERVER_URL.replace(/^http/, 'ws');
      } else {
        wsUrl = `ws://${window.location.hostname}:3000`;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', playerId: PLAYER_ID }));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'tick') tickRef.current(msg);
          if (msg.type === 'chat' && chatRef.current) chatRef.current(msg.message);
        } catch {}
      };

      ws.onerror = () => {};
      ws.onclose = () => {
        wsRef.current = null;
        if (!destroyed) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return wsRef;
}

export function sendWsMessage(wsRef, data) {
  if (wsRef.current?.readyState === 1) {
    wsRef.current.send(JSON.stringify(data));
  }
}

// Shop marketplace API
export async function fetchShopListings() {
  const res = await fetchWithRetry(`${API_BASE}/shop-market/listings`, { headers });
  return res.json();
}

export async function sendShopOffer(data) {
  const res = await fetchWithRetry(`${API_BASE}/shop-market/offer`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function sendShopMessage(data) {
  const res = await fetchWithRetry(`${API_BASE}/shop-market/message`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchShopMessages(listingId) {
  const res = await fetchWithRetry(`${API_BASE}/shop-market/messages/${listingId}`, { headers });
  return res.json();
}

export async function acceptShopOffer(data) {
  const res = await fetchWithRetry(`${API_BASE}/shop-market/accept-offer`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function rejectShopOffer(data) {
  const res = await fetchWithRetry(`${API_BASE}/shop-market/reject-offer`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function counterShopOffer(data) {
  const res = await fetchWithRetry(`${API_BASE}/shop-market/counter`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  return res.json();
}
