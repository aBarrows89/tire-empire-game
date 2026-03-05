import React, { useState, useRef, useEffect } from 'react';
import { useGame } from '../context/GameContext.jsx';
import { getInv } from '@shared/helpers/inventory.js';
import { hapticsLight } from '../api/haptics.js';

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
  { id: 'ecommerce', icon: '\u{1F4BB}', label: 'E-Com' },
  { id: 'wholesale', icon: '\u{1F69B}', label: 'Wholesale' },
  { id: 'exchange', icon: '\u{1F4C8}', label: 'Exchange' },
  { id: 'franchise', icon: '\u{1F3EA}', label: 'Franchise' },
  { id: 'map', icon: '\u{1F5FA}', label: 'Map' },
  { id: 'achievements', icon: '\u{1F3C5}', label: 'Awards' },
  { id: 'store', icon: '\u{1FA99}', label: 'TC Store' },
  { id: 'profile', icon: '\u{1F464}', label: 'Profile' },
  { id: 'log', icon: '\u{1F4CB}', label: 'Log' },
  { id: 'reports', icon: '\u{1F4CA}', label: 'Reports' },
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
  unlocked.add('reports');
  unlocked.add('store');

  if (g.hasFactory || g.reputation >= 50) unlocked.add('factory');

  // E-commerce: show if unlocked or meets requirements
  if (g.hasEcom || (g.reputation >= 30 && g.cash >= 50000)) unlocked.add('ecommerce');

  // Wholesale: show if unlocked or meets requirements
  if (g.hasWholesale || (g.reputation >= 25 && g.locations.length >= 2)) unlocked.add('wholesale');

  // Exchange: show if has brokerage or meets requirements
  if (g.stockExchange?.hasBrokerage || (g.reputation >= 10 && (g.locations || []).length >= 1)) unlocked.add('exchange');

  // Franchise: visible at rep 50+ (teaser) or if already franchising
  if (g.hasFactory || g.reputation >= 50 || (g.franchises || []).length > 0 || g.franchiseOffering?.active) unlocked.add('franchise');

  // Map: available once you have any shop
  if ((g.locations || []).length > 0) unlocked.add('map');

  return unlocked;
}

export default function BottomNav() {
  const { state, dispatch } = useGame();
  const [showMore, setShowMore] = useState(false);
  const [tutorialTarget, setTutorialTarget] = useState(null);
  const g = state.game;
  const seenMsgCount = useRef(0);
  const [unreadChat, setUnreadChat] = useState(0);

  // Listen for tutorial highlight events
  useEffect(() => {
    const handler = (e) => setTutorialTarget(e.detail || null);
    window.addEventListener('tutorialHighlight', handler);
    return () => window.removeEventListener('tutorialHighlight', handler);
  }, []);

  // Track unread chat messages
  const msgCount = (state.chatMessages || []).length;
  useEffect(() => {
    if (msgCount > seenMsgCount.current) {
      setUnreadChat(prev => prev + (msgCount - seenMsgCount.current));
    }
    seenMsgCount.current = msgCount;
  }, [msgCount]);

  if (!g) return null;

  const unlocked = getUnlockedTabs(g);

  const primaryVisible = PRIMARY_TABS.filter(t => unlocked.has(t.id));

  // Check if active panel is in secondary — if so, highlight "More"
  const activeInSecondary = SECONDARY_TABS.some(t => t.id === state.activePanel);

  const selectTab = (id) => {
    hapticsLight();
    dispatch({ type: 'SET_PANEL', payload: id });
    setShowMore(false);
  };

  return (
    <>
      {/* Expandable grid overlay */}
      {showMore && (
        <div className="more-overlay" onClick={() => setShowMore(false)}>
          <div className="more-grid" onClick={e => e.stopPropagation()}>
            {SECONDARY_TABS.map(tab => {
              const isUnlocked = unlocked.has(tab.id);
              return (
                <button
                  key={tab.id}
                  className={`more-grid-btn${!isUnlocked ? ' locked' : ''}${state.activePanel === tab.id ? ' active' : ''}${tutorialTarget === tab.id ? ' tutorial-pulse' : ''}`}
                  onClick={() => selectTab(tab.id)}
                  data-tutorial-target={tab.id}
                >
                  <span className="more-grid-icon">{tab.icon}</span>
                  {!isUnlocked && <span className="lock-badge">{'\u{1F512}'}</span>}
                  <span className="more-grid-label">{tab.label}</span>
                </button>
              );
            })}
            <button
              className="more-grid-btn"
              onClick={() => {
                hapticsLight();
                setShowMore(false);
                setUnreadChat(0);
                window.dispatchEvent(new CustomEvent('toggleChat'));
              }}
              style={{ position: 'relative' }}
            >
              <span className="more-grid-icon">{'\u{1F4AC}'}</span>
              <span className="more-grid-label">Chat</span>
              {unreadChat > 0 && (
                <span className="nav-badge">{unreadChat > 99 ? '99+' : unreadChat}</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="bottom-nav">
        {primaryVisible.map(tab => (
          <button
            key={tab.id}
            className={`nav-btn ${state.activePanel === tab.id && !activeInSecondary ? 'active' : ''}${tutorialTarget === tab.id ? ' tutorial-pulse' : ''}`}
            onClick={() => { selectTab(tab.id); }}
            data-tutorial-target={tab.id}
          >
            <span className="nav-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
        <button
          className={`nav-btn ${showMore || activeInSecondary ? 'active' : ''}${tutorialTarget && SECONDARY_TABS.some(t => t.id === tutorialTarget) && !showMore ? ' tutorial-pulse' : ''}`}
          onClick={() => setShowMore(!showMore)}
          style={{ position: 'relative' }}
        >
          <span className="nav-icon">{showMore ? '\u2716' : '\u2630'}</span>
          More
          {unreadChat > 0 && !showMore && (
            <span className="nav-badge">{unreadChat > 99 ? '99+' : unreadChat}</span>
          )}
        </button>
      </div>
    </>
  );
}
