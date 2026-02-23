import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { getState, useWebSocket } from '../api/client.js';

const GameContext = createContext();

function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_STATE':
      return {
        ...state,
        game: action.payload,
        loading: false,
        // Accumulate logs across ticks
        logHistory: [
          ...(action.payload.log || []).map(l => ({ week: action.payload.week, msg: l })),
          ...(state.logHistory || []),
        ].slice(0, 100),
      };
    case 'SET_PANEL':
      return { ...state, activePanel: action.payload };
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

  useWebSocket(onTick);

  return (
    <GameContext.Provider value={{ state, dispatch, refreshState }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
