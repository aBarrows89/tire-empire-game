import React from 'react';
import { GameProvider, useGame } from './context/GameContext.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import TutorialOverlay from './components/TutorialOverlay.jsx';
import Header from './components/Header.jsx';
import BottomNav from './components/BottomNav.jsx';
import DashboardPanel from './components/panels/DashboardPanel.jsx';
import SourcePanel from './components/panels/SourcePanel.jsx';
import PricingPanel from './components/panels/PricingPanel.jsx';
import StoragePanel from './components/panels/StoragePanel.jsx';
import ShopPanel from './components/panels/ShopPanel.jsx';
import StaffPanel from './components/panels/StaffPanel.jsx';
import BankPanel from './components/panels/BankPanel.jsx';
import SupplierPanel from './components/panels/SupplierPanel.jsx';
import WeeklyLogPanel from './components/panels/WeeklyLogPanel.jsx';

const PANELS = {
  dashboard: DashboardPanel,
  source: SourcePanel,
  pricing: PricingPanel,
  storage: StoragePanel,
  shop: ShopPanel,
  staff: StaffPanel,
  bank: BankPanel,
  supplier: SupplierPanel,
  log: WeeklyLogPanel,
};

function GameLayout() {
  const { state } = useGame();

  if (state.loading) return <div className="loading">Loading Tire Empire...</div>;
  if (state.error) return <div className="loading">Error: {state.error}</div>;

  const g = state.game;

  // Show welcome screen if no company name set
  if (!g.companyName) return <WelcomeScreen />;

  // Show tutorial if not completed
  if (!g.tutorialDone) return <TutorialOverlay />;

  const Panel = PANELS[state.activePanel] || DashboardPanel;

  return (
    <>
      <Header />
      <div className="main">
        <Panel />
      </div>
      <BottomNav />
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
