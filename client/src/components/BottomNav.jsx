import React from 'react';
import { useGame } from '../context/GameContext.jsx';
import { getInv } from '@shared/helpers/inventory.js';

const TABS = [
  { id: 'dashboard', icon: '\u{1F4CA}', label: 'Home' },
  { id: 'source', icon: '\u{1F527}', label: 'Source' },
  { id: 'pricing', icon: '\u{1F4B2}', label: 'Prices' },
  { id: 'storage', icon: '\u{1F4E6}', label: 'Storage' },
  { id: 'bank', icon: '\u{1F3E6}', label: 'Bank' },
  { id: 'shop', icon: '\u{1F3EA}', label: 'Shops' },
  { id: 'staff', icon: '\u{1F465}', label: 'Staff' },
  { id: 'supplier', icon: '\u{1F69A}', label: 'Supply' },
  { id: 'profile', icon: '\u{1F464}', label: 'Profile' },
  { id: 'log', icon: '\u{1F4CB}', label: 'Log' },
];

/**
 * Determine which tabs are unlocked based on game progression.
 * Early game shows only Dashboard, Source, Pricing, Log.
 * Other tabs unlock as the player progresses.
 */
function getUnlockedTabs(g) {
  const inv = getInv(g);
  const unlocked = new Set(['dashboard', 'source', 'pricing', 'log', 'profile']);

  // Storage: once you have > 12 tires or bought any storage beyond van
  if (inv > 12 || g.storage.length > 1) unlocked.add('storage');

  // Bank: once you have some reputation or need cash
  if (g.reputation >= 3 || g.cash < 50 || g.loans.length > 0) unlocked.add('bank');

  // Shop: once you're getting established
  if (g.cash >= 20000 || g.reputation >= 15 || g.locations.length > 0) unlocked.add('shop');

  // Staff: once you have a shop
  if (g.locations.length > 0) unlocked.add('staff');

  // Supplier (new tires): once you have rep and some cash
  if (g.reputation >= 8 || g.unlockedSuppliers.length > 0) unlocked.add('supplier');

  return unlocked;
}

export default function BottomNav() {
  const { state, dispatch } = useGame();
  const g = state.game;
  if (!g) return null;

  const unlocked = getUnlockedTabs(g);
  const visibleTabs = TABS.filter(t => unlocked.has(t.id));

  return (
    <div className="bottom-nav">
      {visibleTabs.map(tab => (
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
