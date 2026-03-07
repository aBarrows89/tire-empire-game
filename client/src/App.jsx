import React, { useState, useRef, useEffect, useCallback } from 'react';
import AuthGate from './components/AuthGate.jsx';
import { GameProvider, useGame } from './context/GameContext.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import TutorialOverlay from './components/TutorialOverlay.jsx';
import Header from './components/Header.jsx';
import BottomNav from './components/BottomNav.jsx';
import VinniePopup from './components/VinniePopup.jsx';
import AchievementToast from './components/AchievementToast.jsx';
import NotificationToast from './components/NotificationToast.jsx';
import ChatOverlay from './components/ChatOverlay.jsx';
import PullToRefresh from './components/PullToRefresh.jsx';
import PanelTransition from './components/PanelTransition.jsx';
import PanelErrorBoundary from './components/PanelErrorBoundary.jsx';
import AdBanner from './components/AdBanner.jsx';
import PremiumModal from './components/PremiumModal.jsx';
import { useAds } from './hooks/useAds.js';
import { startMusic } from './api/sounds.js';
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
import EcommercePanel from './components/panels/EcommercePanel.jsx';
import WholesalePanel from './components/panels/WholesalePanel.jsx';
import ExchangePanel from './components/panels/ExchangePanel.jsx';
import MapPanel from './components/panels/MapPanel.jsx';
import FranchisePanel from './components/panels/FranchisePanel.jsx';
import ReportsPanel from './components/panels/ReportsPanel.jsx';
import TireCoinStorePanel from './components/panels/TireCoinStorePanel.jsx';

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
  ecommerce: EcommercePanel,
  wholesale: WholesalePanel,
  exchange: ExchangePanel,
  map: MapPanel,
  franchise: FranchisePanel,
  reports: ReportsPanel,
  store: TireCoinStorePanel,
};

function SplashScreen() {
  return (
    <div className="splash-screen">
      <div className="splash-bg" />
      <div className="splash-overlay">
        <div className="splash-title">TIRE EMPIRE</div>
        <div className="splash-bar-track">
          <div className="splash-bar-fill" />
        </div>
        <div className="splash-text">Initializing Systems...</div>
      </div>
    </div>
  );
}

function GameLayout() {
  const { state, dispatch, sendChat, refreshState, wsRef } = useGame();
  const [chatOpen, setChatOpen] = useState(false);
  const [toastAch, setToastAch] = useState(null);
  const [toastNotifs, setToastNotifs] = useState(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const shownRef = useRef(new Set());
  const notifShownDayRef = useRef(0);
  const prevPanelRef = useRef(null);
  // Once we've seen a companyName, never flash back to WelcomeScreen mid-session.
  // Back with sessionStorage so it survives component remounts (error boundaries, etc.)
  const confirmedCompanyRef = useRef(
    (() => { try { return sessionStorage.getItem('te_confirmedCompany'); } catch { return null; } })()
  );

  // Open chat overlay when a DM is requested from profile
  useEffect(() => {
    if (state.pendingDM) setChatOpen(true);
  }, [state.pendingDM]);

  // Minimum splash duration
  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), 2200);
    return () => clearTimeout(timer);
  }, []);

  // Start background music on first user interaction (autoplay policy)
  useEffect(() => {
    const tryStart = () => { startMusic(); document.removeEventListener('click', tryStart); };
    document.addEventListener('click', tryStart);
    return () => document.removeEventListener('click', tryStart);
  }, []);

  // Listen for openPremiumModal event (from profile, Vinnie, etc.)
  const openPremium = useCallback(() => setShowPremiumModal(true), []);
  useEffect(() => {
    window.addEventListener('openPremiumModal', openPremium);
    return () => window.removeEventListener('openPremiumModal', openPremium);
  }, [openPremium]);

  // Listen for toggleChat event (from BottomNav More menu)
  const toggleChat = useCallback(() => setChatOpen(o => !o), []);
  useEffect(() => {
    window.addEventListener('toggleChat', toggleChat);
    return () => window.removeEventListener('toggleChat', toggleChat);
  }, [toggleChat]);

  const g = state.game;

  // Ad system — manages banner, interstitial cooldown
  const adState = useAds(g?.isPremium);

  // Track panel switches for interstitial gating
  useEffect(() => {
    if (prevPanelRef.current && prevPanelRef.current !== state.activePanel) {
      adState.trackPanelSwitch();
    }
    prevPanelRef.current = state.activePanel;
  }, [state.activePanel, adState]);

  // Listen for game ticks to maybe show interstitial
  useEffect(() => {
    const handler = () => adState.maybeShowInterstitial();
    window.addEventListener('gameTick', handler);
    return () => window.removeEventListener('gameTick', handler);
  }, [adState]);

  if (state.loading || !splashDone) return <SplashScreen />;
  if (state.error) return (
    <div className="loading" style={{ flexDirection: 'column', gap: 12, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 32 }}>🔧</div>
      <div style={{ fontWeight: 700 }}>Connection Error</div>
      <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 300 }}>{state.error}</div>
      <button
        className="btn"
        style={{ marginTop: 8 }}
        onClick={() => window.location.reload()}
      >
        Retry
      </button>
    </div>
  );

  // Show welcome screen only if we've never confirmed a company name this session.
  // Backed by sessionStorage so it survives component remounts (error boundaries,
  // auth re-renders, etc.) — prevents the "hire staff → WelcomeScreen" bug.
  if (g?.companyName) {
    confirmedCompanyRef.current = g.companyName;
    try { sessionStorage.setItem('te_confirmedCompany', g.companyName); } catch {}
  }
  if (!confirmedCompanyRef.current) return <WelcomeScreen />;

  // Check for new achievements — deduplicated via shownRef
  if (g._newAchievements && g._newAchievements.length > 0 && !toastAch) {
    const unseen = g._newAchievements.filter(a => !shownRef.current.has(a.id));
    if (unseen.length > 0) {
      for (const a of unseen) shownRef.current.add(a.id);
      setToastAch(unseen);
    }
  }

  // Check for new notifications — deduplicated per day
  if (g._notifications && g._notifications.length > 0 && !toastNotifs && notifShownDayRef.current !== g.day) {
    notifShownDayRef.current = g.day;
    setToastNotifs(g._notifications);
  }

  const Panel = PANELS[state.activePanel] || DashboardPanel;

  return (
    <>
      <Header />
      {/* Ad banner — IN document flow so it never covers content */}
      {!g.isPremium && (
        <AdBanner onOpenPremium={() => setShowPremiumModal(true)} />
      )}
      {state.offline && (
        <div className="offline-banner">
          {'\u{1F4E1}'} Offline Mode — Actions will sync when connected
        </div>
      )}
      <div className="main">
        <PullToRefresh onRefresh={refreshState}>
          <PanelErrorBoundary panelKey={state.activePanel}>
            <PanelTransition panelKey={state.activePanel}>
              <Panel />
            </PanelTransition>
          </PanelErrorBoundary>
        </PullToRefresh>
      </div>
      <BottomNav />
      {!g.tutorialDone && <TutorialOverlay />}
      <PanelErrorBoundary panelKey="vinnie-popup">
        <VinniePopup />
      </PanelErrorBoundary>

      {/* Vinnie Announcement (admin broadcast) */}
      {state.announcement && (
        <div className="vinnie-popup-backdrop" onClick={() => dispatch({ type: 'SET_ANNOUNCEMENT', payload: null })}>
          <div className="vinnie-popup-card" onClick={e => e.stopPropagation()}>
            <div className="vinnie-popup-emoji">{'\u{1F9D4}'}</div>
            <div className="vinnie-popup-title">Message from Vinnie</div>
            <div className="vinnie-popup-message">{typeof state.announcement.message === 'string' ? state.announcement.message : String(state.announcement.message || '')}</div>
            <div className="vinnie-popup-actions">
              <button className="btn btn-full btn-sm btn-outline" onClick={() => dispatch({ type: 'SET_ANNOUNCEMENT', payload: null })}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Modal */}
      {showPremiumModal && (
        <PremiumModal onClose={() => setShowPremiumModal(false)} />
      )}

      {/* Achievement Toast */}
      {toastAch && toastAch.length > 0 && (
        <AchievementToast
          achievements={toastAch}
          onDismiss={() => setToastAch(null)}
          hasCelebration={(g.cosmetics || []).includes('celebration')}
        />
      )}

      {/* Notification Toast */}
      {toastNotifs && toastNotifs.length > 0 && (
        <NotificationToast
          notifications={toastNotifs}
          onDismiss={() => setToastNotifs(null)}
        />
      )}

      {/* Chat Overlay */}
      <ChatOverlay
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={state.chatMessages || []}
        onSend={sendChat}
        wsRef={wsRef}
        pendingDM={state.pendingDM}
        onDMOpened={() => dispatch({ type: 'OPEN_DM', payload: null })}
      />
    </>
  );
}

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null, asyncErrors: [] };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidMount() {
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  handleGlobalError = (event) => {
    this.setState(prev => ({
      asyncErrors: [...prev.asyncErrors, `[window.error] ${event.message} at ${event.filename}:${event.lineno}`].slice(-5),
    }));
  };

  handleUnhandledRejection = (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
    this.setState(prev => ({
      asyncErrors: [...prev.asyncErrors, `[unhandledrejection] ${msg}`].slice(-5),
    }));
  };

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-screen">
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#x1F6A8;</div>
          <h2 style={{ margin: '0 0 8px' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: 16 }}>The app hit an unexpected error.</p>
          <pre style={{ color: '#ef5350', fontSize: 11, maxWidth: '90vw', overflow: 'auto', padding: 8, background: '#1a1a2e', borderRadius: 6, marginBottom: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-all', textAlign: 'left' }}>
            {this.state.error?.message || 'Unknown error'}{'\n'}{this.state.error?.stack || ''}
            {this.state.asyncErrors.length > 0 ? '\n\n--- Async Errors ---\n' + this.state.asyncErrors.join('\n') : ''}
          </pre>
          <button className="btn btn-green" onClick={() => window.location.reload()}>
            Restart App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthGate>
        <GameProvider>
          <GameLayout />
        </GameProvider>
      </AuthGate>
    </ErrorBoundary>
  );
}
