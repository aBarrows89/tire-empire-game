import React, { useState } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { getInv } from '@shared/helpers/inventory.js';

// Primary tabs always visible in bottom bar
const PRIMARY_TABS = [
  { id: 'dashboard', icon: '\u{1F4CA}', label: 'Home' },
  { id: 'shop', icon: '\u{1F3EA}', label: 'Shops' },
  { id: 'marketplace', icon: '\u{1F4E2}', label: 'Market' },
  { id: 'leaderboard', icon: '\u{1F3C6}', label: 'Ranks' },
];

// Secondary tabs shown in expandable grid
const SECONDARY_TABS = [
  { id: 'source', icon: '\u{1F527}', label: 'Source' },
  { id: 'pricing', icon: '\u{1F4B2}', label: 'Prices' },
  { id: 'storage', icon: '\u{1F4E6}', label: 'Storage' },
  { id: 'bank', icon: '\u{1F3E6}', label: 'Bank' },
  { id: 'supplier', icon: '\u{1F69A}', label: 'Supply' },
  { id: 'staff', icon: '\u{1F465}', label: 'Staff' },
  { id: 'trade', icon: '\u{1F91D}', label: 'Trade' },
  { id: 'factory', icon: '\u{1F3ED}', label: 'Factory' },
  { id: 'achievements', icon: '\u{1F3C5}', label: 'Awards' },
  { id: 'profile', icon: '\u{1F464}', label: 'Profile' },
  { id: 'log', icon: '\u{1F4CB}', label: 'Log' },
];

function getUnlockedTabs(g) {
  const inv = getInv(g);
  const unlocked = new Set(['dashboard', 'source', 'pricing', 'log', 'profile', 'leaderboard']);

  // Storage: as soon as you have any tires
  if (inv > 0 || g.storage.length > 1 || g.totalSold > 0) unlocked.add('storage');

  // Bank: once you have some reputation or need cash
  if (g.reputation >= 3 || g.cash < 50 || g.loans.length > 0) unlocked.add('bank');

  // Shop: once you're getting established
  if (g.cash >= 20000 || g.reputation >= 15 || g.locations.length > 0) unlocked.add('shop');

  // Staff: once you have a shop or enough cash
  if (g.locations.length > 0 || g.cash >= 50000) unlocked.add('staff');

  // Supplier: once you have rep
  if (g.reputation >= 8 || g.unlockedSuppliers.length > 0) unlocked.add('supplier');

  // Marketplace & Trade
  if (g.locations.length > 0 || g.reputation >= 10 || g.cash >= 50000) {
    unlocked.add('marketplace');
    unlocked.add('trade');
  }

  unlocked.add('achievements');

  if (g.hasFactory || g.reputation >= 70) unlocked.add('factory');

  return unlocked;
}

export default function BottomNav() {
  const { state, dispatch } = useGame();
  const [showMore, setShowMore] = useState(false);
  const g = state.game;
  if (!g) return null;

  const unlocked = getUnlockedTabs(g);

  const primaryVisible = PRIMARY_TABS.filter(t => unlocked.has(t.id));
  const secondaryVisible = SECONDARY_TABS.filter(t => unlocked.has(t.id));

  // Check if active panel is in secondary — if so, highlight "More"
  const activeInSecondary = secondaryVisible.some(t => t.id === state.activePanel);

  const selectTab = (id) => {
    dispatch({ type: 'SET_PANEL', payload: id });
    setShowMore(false);
  };

  return (
    <>
      {/* Expandable grid overlay */}
      {showMore && (
        <div className="more-overlay" onClick={() => setShowMore(false)}>
          <div className="more-grid" onClick={e => e.stopPropagation()}>
            {secondaryVisible.map(tab => (
              <button
                key={tab.id}
                className={`more-grid-btn ${state.activePanel === tab.id ? 'active' : ''}`}
                onClick={() => selectTab(tab.id)}
              >
                <span className="more-grid-icon">{tab.icon}</span>
                <span className="more-grid-label">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="bottom-nav">
        {primaryVisible.map(tab => (
          <button
            key={tab.id}
            className={`nav-btn ${state.activePanel === tab.id && !activeInSecondary ? 'active' : ''}`}
            onClick={() => { selectTab(tab.id); }}
          >
            <span className="nav-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
        <button
          className={`nav-btn ${showMore || activeInSecondary ? 'active' : ''}`}
          onClick={() => setShowMore(!showMore)}
        >
          <span className="nav-icon">{showMore ? '\u2716' : '\u2630'}</span>
          More
        </button>
      </div>
    </>
  );
}
