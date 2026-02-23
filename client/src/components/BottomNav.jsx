import React from 'react';
import { useGame } from '../context/GameContext.jsx';

const TABS = [
  { id: 'dashboard', icon: '📊', label: 'Home' },
  { id: 'source', icon: '🔧', label: 'Source' },
  { id: 'pricing', icon: '💲', label: 'Prices' },
  { id: 'storage', icon: '📦', label: 'Storage' },
  { id: 'shop', icon: '🏪', label: 'Shops' },
  { id: 'staff', icon: '👥', label: 'Staff' },
  { id: 'bank', icon: '🏦', label: 'Bank' },
  { id: 'supplier', icon: '🚚', label: 'Supply' },
  { id: 'log', icon: '📋', label: 'Log' },
];

export default function BottomNav() {
  const { state, dispatch } = useGame();

  return (
    <div className="bottom-nav">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`nav-btn ${state.activePanel === tab.id ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'SET_PANEL', payload: tab.id })}
        >
          <span className="nav-icon">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
