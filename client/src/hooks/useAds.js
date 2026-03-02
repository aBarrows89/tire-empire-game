import { useEffect, useRef, useCallback } from 'react';
import { initAds, showBanner, hideBanner, prepareInterstitial, showInterstitial } from '../services/ads.js';
import { MONET } from '@shared/constants/monetization.js';

const COOLDOWN_MS = MONET.interstitialCooldownMs;
const MIN_SWITCHES = MONET.interstitialMinPanelSwitches;

/**
 * Ad management hook for App.jsx.
 * Handles: initialization, native banner show/hide, interstitial gating.
 * Rewarded ads are managed by RewardedAdButton (self-contained).
 */
export function useAds(isPremium) {
  const initRef = useRef(false);
  const lastInterstitialRef = useRef(0);
  const panelSwitchRef = useRef(0);

  // Initialize ads once (skip for premium)
  useEffect(() => {
    if (isPremium || initRef.current) return;
    initRef.current = true;
    initAds();
    prepareInterstitial();
  }, [isPremium]);

  // Native banner: show for free users, hide for premium
  useEffect(() => {
    if (isPremium) {
      hideBanner();
      document.body.classList.remove('has-native-ad-banner');
    } else {
      showBanner();
      document.body.classList.add('has-native-ad-banner');
    }
    return () => {
      hideBanner();
      document.body.classList.remove('has-native-ad-banner');
    };
  }, [isPremium]);

  /** Track panel switches (call when activePanel changes) */
  const trackPanelSwitch = useCallback(() => {
    panelSwitchRef.current += 1;
  }, []);

  /**
   * Maybe show an interstitial ad.
   * Only fires if: not premium, 5+ min since last one, 3+ panel switches.
   */
  const maybeShowInterstitial = useCallback(() => {
    if (isPremium) return;
    const now = Date.now();
    if (now - lastInterstitialRef.current < COOLDOWN_MS) return;
    if (panelSwitchRef.current < MIN_SWITCHES) return;

    lastInterstitialRef.current = now;
    panelSwitchRef.current = 0;
    showInterstitial().then(() => {
      prepareInterstitial();
    });
  }, [isPremium]);

  return { trackPanelSwitch, maybeShowInterstitial };
}
