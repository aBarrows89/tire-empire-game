import { Capacitor, registerPlugin } from '@capacitor/core';

const AdMob = registerPlugin('AdMob');
const isNative = Capacitor.isNativePlatform();

// Google test ad unit IDs — replace with production IDs before release
const AD_UNITS = {
  ios: {
    banner: 'ca-app-pub-3940256099942544/2934735716',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
  },
  android: {
    banner: 'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
  },
};

function getAdUnit(type) {
  const platform = Capacitor.getPlatform();
  const units = platform === 'ios' ? AD_UNITS.ios : AD_UNITS.android;
  return units[type];
}

/** Initialize AdMob (call once on app start) */
export async function initAds() {
  if (!isNative) return;
  try {
    await AdMob.initialize({
      initializeForTesting: true,
    });
  } catch (e) {
    console.warn('AdMob init failed:', e);
  }
}

/** Show a banner ad at the bottom of the screen */
export async function showBanner() {
  if (!isNative) return;
  try {
    await AdMob.showBanner({
      adId: getAdUnit('banner'),
      position: 'BOTTOM_CENTER',
      margin: 0,
      isTesting: true,
    });
  } catch (e) {
    console.warn('Banner show failed:', e);
  }
}

/** Hide the banner ad */
export async function hideBanner() {
  if (!isNative) return;
  try {
    await AdMob.hideBanner();
  } catch (e) {
    console.warn('Banner hide failed:', e);
  }
}

/** Prepare an interstitial ad (call ahead of time) */
export async function prepareInterstitial() {
  if (!isNative) return;
  try {
    await AdMob.prepareInterstitial({
      adId: getAdUnit('interstitial'),
      isTesting: true,
    });
  } catch (e) {
    console.warn('Interstitial prepare failed:', e);
  }
}

/** Show the prepared interstitial */
export async function showInterstitial() {
  if (!isNative) return;
  try {
    await AdMob.showInterstitial();
  } catch (e) {
    console.warn('Interstitial show failed:', e);
  }
}

/** Prepare a rewarded video ad */
export async function prepareRewarded() {
  if (!isNative) return;
  try {
    await AdMob.prepareRewardVideoAd({
      adId: getAdUnit('rewarded'),
      isTesting: true,
    });
  } catch (e) {
    console.warn('Rewarded prepare failed:', e);
  }
}

/**
 * Show the prepared rewarded video.
 * Returns a Promise that resolves to true if the user earned the reward,
 * or false if they dismissed / error occurred.
 */
export function showRewarded() {
  if (!isNative) {
    // Web fallback: simulate a successful reward for dev/testing
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let rewarded = false;

    const onReward = AdMob.addListener('onRewardedVideoAdReward', () => {
      rewarded = true;
    });

    const onDismiss = AdMob.addListener('onRewardedVideoAdDismissed', () => {
      cleanup();
      resolve(rewarded);
    });

    const onFail = AdMob.addListener('onRewardedVideoAdFailedToLoad', () => {
      cleanup();
      resolve(false);
    });

    function cleanup() {
      onReward?.remove?.();
      onDismiss?.remove?.();
      onFail?.remove?.();
    }

    AdMob.showRewardVideoAd().catch(() => {
      cleanup();
      resolve(false);
    });
  });
}
