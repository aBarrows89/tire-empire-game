import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { getState, useWebSocket, sendWsMessage } from '../api/client.js';
import { cacheGameState, getCachedGameState, getPendingActions, clearPendingActions } from '../services/offlineCache.js';
import { postAction } from '../api/client.js';
import { safeSetItem, safeGetItem } from '../services/storage.js';

const GameContext = createContext();

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_STATE':
      return {
        ...state,
        game: action.payload,
        loading: false,
        logHistory: [
          ...(action.payload.log || []).map(l => {
            const entry = typeof l === 'string' ? { msg: l, cat: 'other' } : l;
            return { day: action.payload.day || action.payload.week, ...entry };
          }),
          ...(state.logHistory || []),
        ].slice(0, 200),
      };
    case 'ADD_CHAT':
      return {
        ...state,
        chatMessages: [...(state.chatMessages || []), action.payload].slice(-200),
      };
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
      return { ...state, error: action.payload };
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
      dispatch({ type: 'SET_STATE', payload: { game: actionResult.state } });
    }
  }, [dispatch]);


  // Initial load
  useEffect(() => { refreshState(); }, [refreshState]);

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
