import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { getState, useWebSocket, sendWsMessage } from '../api/client.js';

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
    case 'SET_PANEL':
      return { ...state, activePanel: action.payload, viewingProfile: null };
    case 'SET_VIEWING_PROFILE':
      return { ...state, viewingProfile: action.payload, activePanel: 'profile' };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

const initialState = {
  game: null,
  activePanel: 'dashboard',
  loading: true,
  error: null,
  logHistory: [],
  viewingProfile: null,
  chatMessages: [],
};

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  const refreshState = useCallback(async () => {
    try {
      const data = await getState();
      dispatch({ type: 'SET_STATE', payload: data });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
    }
  }, []);

  // Initial load
  useEffect(() => { refreshState(); }, [refreshState]);

  // WebSocket tick handler — refresh state on each tick
  const onTick = useCallback(() => {
    refreshState();
  }, [refreshState]);

  const onChat = useCallback((msg) => {
    dispatch({ type: 'ADD_CHAT', payload: msg });
  }, []);

  const wsRef = useWebSocket(onTick, onChat);

  const sendChat = useCallback((text) => {
    sendWsMessage(wsRef, { type: 'chat', text });
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
