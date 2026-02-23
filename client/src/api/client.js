import { useEffect, useCallback, useRef } from 'react';

const API_BASE = '/api';
const PLAYER_ID = 'dev-player';

const headers = {
  'Content-Type': 'application/json',
  'X-Player-Id': PLAYER_ID,
};

export async function getState() {
  const res = await fetch(`${API_BASE}/state`, { headers });
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
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
  const res = await fetch(`${API_BASE}/market`);
  return res.json();
}

export async function getLeaderboard() {
  const res = await fetch(`${API_BASE}/leaderboard`);
  return res.json();
}

export function useWebSocket(onTick) {
  const cbRef = useRef(onTick);
  cbRef.current = onTick;

  useEffect(() => {
    const wsUrl = `ws://${window.location.hostname}:3000`;
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
