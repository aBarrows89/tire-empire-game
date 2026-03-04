import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { getState, useWebSocket, sendWsMessage } from '../api/client.js';
import { cacheGameState, getCachedGameState, getPendingActions, clearPendingActions } from '../services/offlineCache.js';
import { postAction } from '../api/client.js';

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
      try { localStorage.setItem('te_activePanel', action.payload); } catch {}
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

const savedPanel = (() => { try { return localStorage.getItem('te_activePanel'); } catch { return null; } })();

const initialState = {
  game: null,
  activePanel: savedPanel || 'dashboard',
  loading: true,
  error: null,
  logHistory: [],
  viewingProfile: null,
  chatMessages: [],
  offline: false,
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

  // Initial load
  useEffect(() => { refreshState(); }, [refreshState]);

  // WebSocket tick handler — refresh state on each tick
  const onTick = useCallback((tickMsg) => {
    refreshState();
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

  const wsRef = useWebSocket(onTick, onChat, onChatDelete, onAnnouncement);

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
    <GameContext.Provider value={{ state, dispatch, refreshState, sendChat }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
