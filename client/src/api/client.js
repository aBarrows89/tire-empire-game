import { useEffect, useRef } from 'react';
import { getIdToken, getUid, hasFirebaseConfig } from '../services/firebase.js';
import { queueAction } from '../services/offlineCache.js';

// Detect if running inside a Capacitor native app
const isNative = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform();

// For native builds: set VITE_SERVER_URL to your hosted server
// e.g. VITE_SERVER_URL=https://tireempire.up.railway.app (production)
const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// If SERVER_URL is set (native builds), use full URL; otherwise relative /api (browser dev)
const API_BASE = SERVER_URL ? `${SERVER_URL}/api` : '/api';

/**
 * Build auth headers dynamically using Firebase ID token.
 * Falls back to X-Player-Id in dev mode if no Firebase is configured.
 */
async function getHeaders() {
  const base = { 'Content-Type': 'application/json' };
  if (!hasFirebaseConfig) {
    // No Firebase configured — use dev player ID
    base['X-Player-Id'] = 'dev-player';
    return base;
  }
  try {
    const token = await getIdToken();
    if (token) {
      base['Authorization'] = `Bearer ${token}`;
    } else {
      base['X-Player-Id'] = 'dev-player';
    }
  } catch {
    base['X-Player-Id'] = 'dev-player';
  }
  return base;
}

// Export for components that need to make direct fetch calls
export { API_BASE, getHeaders };

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
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/state`, { headers });
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
  return res.json();
}

export async function registerPlayer(playerName, companyName) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/state/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ playerName, companyName }),
  });
  if (!res.ok) throw new Error(`POST /api/state/register failed: ${res.status}`);
  return res.json();
}

export async function postAction(action, params = {}) {
  if (!navigator.onLine) {
    await queueAction(action, params);
    return { ok: true, queued: true };
  }
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/action`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...params }),
  });
  return res.json();
}

export async function getMarket() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/market`, { headers });
  return res.json();
}

export async function getLeaderboard() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/leaderboard`, { headers });
  return res.json();
}

export async function getTrades() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/trade`, { headers });
  return res.json();
}

export async function createTradeOffer(params) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/trade/offer`, {
    method: 'POST', headers,
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function tradeAction(action, tradeId) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/trade/${action}`, {
    method: 'POST', headers,
    body: JSON.stringify({ tradeId }),
  });
  return res.json();
}

export function useWebSocket(onTick, onChat, onChatDelete, onAnnouncement) {
  const tickRef = useRef(onTick);
  const chatRef = useRef(onChat);
  const chatDeleteRef = useRef(onChatDelete);
  const announcementRef = useRef(onAnnouncement);
  const wsRef = useRef(null);
  tickRef.current = onTick;
  chatRef.current = onChat;
  chatDeleteRef.current = onChatDelete;
  announcementRef.current = onAnnouncement;

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

      ws.onopen = async () => {
        // Send Firebase token for production auth, or UID for dev
        try {
          const token = await getIdToken();
          if (token) {
            ws.send(JSON.stringify({ type: 'subscribe', token }));
          } else {
            const uid = getUid();
            ws.send(JSON.stringify({ type: 'subscribe', playerId: uid || 'dev-player' }));
          }
        } catch {
          ws.send(JSON.stringify({ type: 'subscribe', playerId: getUid() || 'dev-player' }));
        }
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'tick') tickRef.current(msg);
          if (msg.type === 'chat' && chatRef.current) chatRef.current(msg.message);
          if (msg.type === 'chatDelete' && chatDeleteRef.current) chatDeleteRef.current(msg.messageId);
          if (msg.type === 'announcement' && announcementRef.current) announcementRef.current(msg);
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

// Wholesale P2P API
export async function getWholesaleSuppliers() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/wholesale/suppliers`, { headers });
  return res.json();
}

export async function placeWholesaleOrder(supplierId, tireType, qty) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/wholesale/order`, {
    method: 'POST', headers,
    body: JSON.stringify({ supplierId, tireType, qty }),
  });
  return res.json();
}

export async function setWholesalePrices(prices) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/wholesale/set-prices`, {
    method: 'POST', headers,
    body: JSON.stringify({ prices }),
  });
  return res.json();
}

// Factory marketplace API
export async function fetchFactoryListings() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/market/factory-listings`, { headers });
  return res.json();
}

// Shop marketplace API
export async function fetchShopListings() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/shop-market/listings`, { headers });
  return res.json();
}

export async function sendShopOffer(data) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/shop-market/offer`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function sendShopMessage(data) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/shop-market/message`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchShopMessages(listingId) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/shop-market/messages/${listingId}`, { headers });
  return res.json();
}

export async function acceptShopOffer(data) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/shop-market/accept-offer`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function rejectShopOffer(data) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/shop-market/reject-offer`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function counterShopOffer(data) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/shop-market/counter`, {
    method: 'POST', headers,
    body: JSON.stringify(data),
  });
  return res.json();
}

// Stock Exchange API
export async function openBrokerage() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/open-account`, { method: 'POST', headers });
  return res.json();
}

export async function getExchangeOverview() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/overview`, { headers });
  return res.json();
}

export async function getStocks() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/stocks`, { headers });
  return res.json();
}

export async function getStockDetail(ticker) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/stock/${ticker}`, { headers });
  return res.json();
}

export async function placeOrder(params) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/order`, { method: 'POST', headers, body: JSON.stringify(params) });
  return res.json();
}

export async function cancelOrder(orderId) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/cancel-order`, { method: 'POST', headers, body: JSON.stringify({ orderId }) });
  return res.json();
}

export async function getPortfolio() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/portfolio`, { headers });
  return res.json();
}

export async function getTradeHistory() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/history`, { headers });
  return res.json();
}

export async function applyForIPO(params) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/ipo/apply`, { method: 'POST', headers, body: JSON.stringify(params) });
  return res.json();
}

export async function setDividendRatio(ratio) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/ipo/set-dividend-ratio`, { method: 'POST', headers, body: JSON.stringify({ ratio }) });
  return res.json();
}

export async function unlockExchangeFeature(feature) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/unlock`, { method: 'POST', headers, body: JSON.stringify({ feature }) });
  return res.json();
}

export async function requestVinnieTip() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/vinnie-tip`, { method: 'POST', headers });
  return res.json();
}

export async function shortSell(params) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/short-sell`, { method: 'POST', headers, body: JSON.stringify(params) });
  return res.json();
}

export async function coverShort(params) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/cover-short`, { method: 'POST', headers, body: JSON.stringify(params) });
  return res.json();
}

export async function setAlert(params) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/set-alert`, { method: 'POST', headers, body: JSON.stringify(params) });
  return res.json();
}

export async function buyScratchTicket() {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/scratch-ticket`, { method: 'POST', headers });
  return res.json();
}

export async function claimScratchPrize(prize) {
  const headers = await getHeaders();
  const res = await fetchWithRetry(`${API_BASE}/exchange/scratch-ticket/claim`, { method: 'POST', headers, body: JSON.stringify({ prize }) });
  return res.json();
}
