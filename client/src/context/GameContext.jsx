import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { getState, useWebSocket, sendWsMessage, API_BASE, getHeaders } from '../api/client.js';
import { cacheGameState, getCachedGameState, getPendingActions, clearPendingActions } from '../services/offlineCache.js';
import { postAction } from '../api/client.js';
import { safeSetItem, safeGetItem } from '../services/storage.js';

const GameContext = createContext();

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_STATE': {
      let g = action.payload;
      // Guard: never regress to a state without companyName if we already have one.
      // Prevents a bad tick/refresh from flashing WelcomeScreen mid-session.
      if (!g?.companyName && state.game?.companyName) {
        console.warn('[GameContext] SET_STATE received state without companyName — keeping existing state.game');
        g = { ...(g || {}), companyName: state.game.companyName };
      }
      if (!g) return state; // null payload — ignore
      // Calendar day = game day + startDay offset (same formula used throughout simDay)
      const calDay = (g.day || 0) + (g.startDay || 1) - 1;
      const newEntries = (g.log || []).map(l => {
        const entry = typeof l === 'string' ? { msg: l, cat: 'other' } : l;
        // Only stamp entries that don't already have a day (preserves action-log days)
        return entry.day ? entry : { ...entry, day: calDay };
      });
      // Merge: new tick entries first, then existing history — deduplicate by msg+day
      const existing = state.logHistory || [];
      const merged = [...newEntries, ...existing];
      // Deduplicate consecutive identical messages (same msg same day)
      const seen = new Set();
      const deduped = merged.filter(e => {
        const key = `${e.day}|${e.msg}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return {
        ...state,
        game: g,
        loading: false,
        logHistory: deduped.slice(0, 500),
      };
    }
    case 'ADD_CHAT': {
      const existing = state.chatMessages || [];
      if (action.payload.id && existing.some(m => m.id === action.payload.id)) return state;
      return {
        ...state,
        chatMessages: [...existing, action.payload].slice(-200),
      };
    }
    case 'DELETE_CHAT':
      return {
        ...state,
        chatMessages: (state.chatMessages || []).filter(m => m.id !== action.payload),
      };
    case 'SET_PANEL':
      safeSetItem('te_activePanel', action.payload);
      return { ...state, activePanel: action.payload, viewingProfile: null };
    case 'SET_VIEWING_PROFILE':
      return { ...state, viewingProfile: action.payload, activePanel: 'profile' };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'SET_OFFLINE':
      return { ...state, offline: action.payload };
    case 'SET_ANNOUNCEMENT':
      return { ...state, announcement: action.payload };
    case 'SET_WS_CONNECTED':
      return { ...state, wsConnected: action.payload };
    case 'ADD_DM':
      return { ...state, lastDM: action.payload };
    case 'SET_TICK_DATA':
      return {
        ...state,
        globalEvents: action.payload.globalEvents || [],
        tcValue: action.payload.tcValue || 50000,
        tcMetrics: action.payload.tcMetrics || state.tcMetrics || null,
        tcHistory: action.payload.tcHistory || state.tcHistory || [],
        lastTickTime: action.payload.timestamp || state.lastTickTime || null,
        tickDuration: action.payload.tickMs || state.tickDuration || 20000,
      };
    default:
      return state;
  }
}

const savedPanel = safeGetItem('te_activePanel');

const initialState = {
  game: null,
  activePanel: savedPanel || 'dashboard',
  loading: true,
  error: null,
  logHistory: [],
  viewingProfile: null,
  chatMessages: [],
  offline: false,
  wsConnected: false,
};

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  const refreshState = useCallback(async () => {
    try {
      const data = await getState();
      dispatch({ type: 'SET_STATE', payload: data });
      dispatch({ type: 'SET_OFFLINE', payload: false });
      cacheGameState(data);
      // Replay queued offline actions
      const pending = await getPendingActions();
      if (pending.length > 0) {
        for (const item of pending) {
          try { await postAction(item.action, item.params || {}); } catch {}
        }
        await clearPendingActions();
        // Re-fetch after replaying
        const fresh = await getState();
        dispatch({ type: 'SET_STATE', payload: fresh });
        cacheGameState(fresh);
      }
    } catch (err) {
      // Try loading cached state if network fails
      const cached = await getCachedGameState();
      if (cached) {
        dispatch({ type: 'SET_STATE', payload: cached });
        dispatch({ type: 'SET_OFFLINE', payload: true });
      } else {
        dispatch({ type: 'SET_ERROR', payload: err.message });
      }
    }
  }, []);

  // Apply state directly from action response — avoids extra GET /state round trip
  const applyState = useCallback((actionResult) => {
    if (actionResult?.state) {
      // Dispatch raw game state — SET_STATE expects the game object directly,
      // same shape as tick and refreshState payloads
      dispatch({ type: 'SET_STATE', payload: actionResult.state });
    }
  }, [dispatch]);


  // Initial load
  useEffect(() => { refreshState(); }, [refreshState]);

  // Pre-load chat history on boot so messages are ready before chat is opened
  useEffect(() => {
    (async () => {
      try {
        const h = await getHeaders();
        const res = await fetch(`${API_BASE}/chat?limit=100&channel=global`, { headers: h });
        if (!res.ok) return;
        const msgs = await res.json();
        if (!Array.isArray(msgs)) return;
        msgs.forEach(m => dispatch({ type: 'ADD_CHAT', payload: {
          id: m.id,
          playerId: m.playerId || m.player_id,
          playerName: m.playerName || m.player_name,
          channel: m.channel || 'global',
          text: m.text,
          timestamp: m.timestamp || Date.now(),
        }}));
      } catch {}
    })();
  }, []);

  // WebSocket tick handler — use state from WS if available, else fallback to HTTP
  const onTick = useCallback((tickMsg) => {
    if (tickMsg?.state) {
      // Section 11: Use state directly from WebSocket — no HTTP fetch needed
      dispatch({ type: 'SET_STATE', payload: tickMsg.state });
      cacheGameState(tickMsg.state);
      dispatch({ type: 'SET_OFFLINE', payload: false });
    } else {
      // Fallback to HTTP fetch if no state in tick message
      refreshState();
    }
    // Capture global events and TC value from tick broadcast
    if (tickMsg) {
      dispatch({ type: 'SET_TICK_DATA', payload: {
        globalEvents: tickMsg.globalEvents,
        tcValue: tickMsg.tcValue,
        tcMetrics: tickMsg.tcMetrics,
        tcHistory: tickMsg.tcHistory,
        timestamp: tickMsg.timestamp || Date.now(),
        tickMs: tickMsg.tickMs || 20000,
      } });
    }
    window.dispatchEvent(new CustomEvent('gameTick'));
  }, [refreshState]);

  const onChat = useCallback((msg) => {
    dispatch({ type: 'ADD_CHAT', payload: msg });
  }, []);

  const onChatDelete = useCallback((messageId) => {
    dispatch({ type: 'DELETE_CHAT', payload: messageId });
  }, []);

  const onAnnouncement = useCallback((msg) => {
    dispatch({ type: 'SET_ANNOUNCEMENT', payload: msg });
  }, []);

  const onConnectionChange = useCallback((connected) => {
    dispatch({ type: 'SET_WS_CONNECTED', payload: connected });
  }, []);

  const onDM = useCallback((msg) => {
    dispatch({ type: 'ADD_DM', payload: msg });
  }, []);

  const wsRef = useWebSocket(onTick, onChat, onChatDelete, onAnnouncement, onConnectionChange, onDM);

  const sendChat = useCallback((text, channel = 'global') => {
    sendWsMessage(wsRef, { type: 'chat', text, channel });
  }, [wsRef]);

  // Refresh state when app returns from background
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    // Also handle Capacitor resume event
    document.addEventListener('resume', refreshState);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('resume', refreshState);
    };
  }, [refreshState]);

  return (
    <GameContext.Provider value={{ state, dispatch, refreshState, applyState, sendChat, wsRef }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
