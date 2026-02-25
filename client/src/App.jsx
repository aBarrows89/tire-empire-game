import React, { useState, useRef } from 'react';
import { GameProvider, useGame } from './context/GameContext.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import TutorialOverlay from './components/TutorialOverlay.jsx';
import Header from './components/Header.jsx';
import BottomNav from './components/BottomNav.jsx';
import VinniePopup from './components/VinniePopup.jsx';
import AchievementToast from './components/AchievementToast.jsx';
import ChatOverlay from './components/ChatOverlay.jsx';
import DashboardPanel from './components/panels/DashboardPanel.jsx';
import SourcePanel from './components/panels/SourcePanel.jsx';
import PricingPanel from './components/panels/PricingPanel.jsx';
import StoragePanel from './components/panels/StoragePanel.jsx';
import ShopPanel from './components/panels/ShopPanel.jsx';
import StaffPanel from './components/panels/StaffPanel.jsx';
import BankPanel from './components/panels/BankPanel.jsx';
import SupplierPanel from './components/panels/SupplierPanel.jsx';
import WeeklyLogPanel from './components/panels/WeeklyLogPanel.jsx';
import ProfilePanel from './components/panels/ProfilePanel.jsx';
import MarketplacePanel from './components/panels/MarketplacePanel.jsx';
import LeaderboardPanel from './components/panels/LeaderboardPanel.jsx';
import TradePanel from './components/panels/TradePanel.jsx';
import AchievementsPanel from './components/panels/AchievementsPanel.jsx';
import FactoryPanel from './components/panels/FactoryPanel.jsx';

const PANELS = {
  dashboard: DashboardPanel,
  source: SourcePanel,
  pricing: PricingPanel,
  storage: StoragePanel,
  shop: ShopPanel,
  staff: StaffPanel,
  bank: BankPanel,
  supplier: SupplierPanel,
  marketplace: MarketplacePanel,
  leaderboard: LeaderboardPanel,
  trade: TradePanel,
  log: WeeklyLogPanel,
  profile: ProfilePanel,
  achievements: AchievementsPanel,
  factory: FactoryPanel,
};

function GameLayout() {
  const { state, sendChat } = useGame();
  const [chatOpen, setChatOpen] = useState(false);
  const [toastAch, setToastAch] = useState(null);
  const shownRef = useRef(new Set());

  if (state.loading) return <div className="loading">Loading Tire Empire...</div>;
  if (state.error) return <div className="loading">Error: {state.error}</div>;

  const g = state.game;

  // Show welcome screen if no company name set
  if (!g.companyName) return <WelcomeScreen />;

  // Show tutorial if not completed
  if (!g.tutorialDone) return <TutorialOverlay />;

  // Check for new achievements — deduplicated via shownRef
  if (g._newAchievements && g._newAchievements.length > 0 && !toastAch) {
    const unseen = g._newAchievements.filter(a => !shownRef.current.has(a.id));
    if (unseen.length > 0) {
      for (const a of unseen) shownRef.current.add(a.id);
      setToastAch(unseen);
    }
  }

  const Panel = PANELS[state.activePanel] || DashboardPanel;

  return (
    <>
      <Header />
      <div className="main">
        <Panel />
      </div>
      <BottomNav />
      <VinniePopup />

      {/* Achievement Toast */}
      {toastAch && toastAch.length > 0 && (
        <AchievementToast
          achievements={toastAch}
          onDismiss={() => setToastAch(null)}
          hasCelebration={(g.cosmetics || []).includes('celebration')}
        />
      )}

      {/* Chat FAB */}
      <button
        className="chat-fab"
        onClick={() => setChatOpen(o => !o)}
        aria-label="Open chat"
      >
        {'\uD83D\uDCAC'}
      </button>

      {/* Chat Overlay */}
      <ChatOverlay
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={state.chatMessages || []}
        onSend={sendChat}
      />
    </>
  );
}

export default function App() {
  return (
    <GameProvider>
      <GameLayout />
    </GameProvider>
  );
}
