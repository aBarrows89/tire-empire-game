import { Capacitor, registerPlugin } from '@capacitor/core';

const AdMob = registerPlugin('AdMob');
const isNative = Capacitor.isNativePlatform();

export async function initAds() {
  if (isNative) {
    try {
      await AdMob.initialize();
    } catch (e) {
      console.warn('AdMob init failed:', e);
    }
  }
}

export async function showBanner() {
  if (isNative) {
    try {
      await AdMob.showBanner();
    } catch (e) {
      console.warn('Banner show failed:', e);
    }
  }
}

export async function hideBanner() {
  if (isNative) {
    try {
      await AdMob.hideBanner();
    } catch (e) {
      console.warn('Banner hide failed:', e);
    }
  }
}

export async function showInterstitial() {
  if (isNative) {
    try {
      await AdMob.showInterstitial();
    } catch (e) {
      console.warn('Interstitial failed:', e);
    }
  }
}
