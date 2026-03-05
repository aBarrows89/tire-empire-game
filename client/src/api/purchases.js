// ═══════════════════════════════════════════════════════════════
// In-App Purchase Service — cordova-plugin-purchase (CdvPurchase)
// Works with Capacitor for both Android (Google Play) and iOS (App Store)
// ═══════════════════════════════════════════════════════════════
//
// SETUP REQUIRED:
// 1. npm install cordova-plugin-purchase
// 2. npx cap sync
// 3. Create products in Google Play Console / App Store Connect with these IDs:
//    tc_100, tc_500, tc_1200, tc_3000, tc_7000, tc_15000, premium_monthly, premium_yearly
// 4. Set GOOGLE_PLAY_KEY env var on server (Base64 RSA key from Play Console)
//
// On web builds, this module returns stubs that show "download the app" prompts.
// ═══════════════════════════════════════════════════════════════

import { MONET } from '@shared/constants/monetization.js';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

// Product IDs must match what's registered in the app stores
const TC_PRODUCT_IDS = (MONET.tcPurchase?.tiers || []).map(t => t.id);
const SUB_PRODUCT_IDS = ['premium_monthly', 'premium_yearly'];
const ALL_PRODUCT_IDS = [...TC_PRODUCT_IDS, ...SUB_PRODUCT_IDS];

let store = null;
let initialized = false;
let onPurchaseComplete = null; // Callback set by the UI

/**
 * Initialize the IAP store. Call once on app start.
 * @param {Function} onComplete - Called with { tierId, receipt, platform } after successful purchase
 */
export async function initPurchases(onComplete) {
  if (!isNative) {
    console.log('[IAP] Web build — purchases disabled');
    initialized = true;
    return;
  }

  onPurchaseComplete = onComplete;

  try {
    // CdvPurchase is a global set by cordova-plugin-purchase
    store = window.CdvPurchase?.store;
    if (!store) {
      console.warn('[IAP] CdvPurchase not available — plugin may not be installed');
      return;
    }

    const { ProductType, Platform } = window.CdvPurchase;

    // Register consumable TC products
    for (const id of TC_PRODUCT_IDS) {
      store.register({
        id,
        type: ProductType.CONSUMABLE,
        platform: Platform.GOOGLE_PLAY, // Also handles iOS if building for both
      });
    }

    // Register subscription products
    for (const id of SUB_PRODUCT_IDS) {
      store.register({
        id,
        type: ProductType.PAID_SUBSCRIPTION,
        platform: Platform.GOOGLE_PLAY,
      });
    }

    // Set up the server-side validation URL
    const apiBase = import.meta.env.VITE_API_URL || '';
    store.validator = `${apiBase}/api/iap/validate`;

    // Listen for verified purchases
    store.when().verified(async (receipt) => {
      console.log('[IAP] Purchase verified:', receipt);

      // Finish the transaction (consume it)
      receipt.finish();

      // Notify the UI
      const product = receipt.products?.[0];
      if (product && onPurchaseComplete) {
        onPurchaseComplete({
          tierId: product.id,
          receipt: JSON.stringify(receipt.sourceReceipt || {}),
          platform: receipt.platform,
          transactionId: receipt.transactionId,
        });
      }
    });

    // Listen for purchase errors
    store.when().unverified((receipt) => {
      console.error('[IAP] Purchase verification failed:', receipt);
    });

    // Initialize
    await store.initialize([
      Platform.GOOGLE_PLAY,
      // Platform.APPLE_APPSTORE, // Uncomment when building for iOS
    ]);

    initialized = true;
    console.log('[IAP] Store initialized with', ALL_PRODUCT_IDS.length, 'products');

  } catch (err) {
    console.error('[IAP] Init error:', err);
  }
}

/**
 * Get product pricing from the store (localized prices from Google/Apple)
 * @returns {Object} Map of productId → { price, currency, title, description }
 */
export function getProductPricing() {
  if (!store || !isNative) {
    // Return fallback pricing from constants
    const pricing = {};
    for (const tier of (MONET.tcPurchase?.tiers || [])) {
      pricing[tier.id] = {
        price: `$${tier.price}`,
        priceRaw: tier.price,
        currency: 'USD',
        title: tier.label,
        description: `${tier.tc} TireCoins`,
        canPurchase: isNative,
      };
    }
    pricing.premium_monthly = {
      price: `$${MONET.premiumTiers?.monthly?.price || 4.99}`,
      priceRaw: MONET.premiumTiers?.monthly?.price || 4.99,
      title: 'PRO Monthly',
      canPurchase: isNative,
    };
    pricing.premium_yearly = {
      price: `$${MONET.premiumTiers?.yearly?.price || 29.99}`,
      priceRaw: MONET.premiumTiers?.yearly?.price || 29.99,
      title: 'PRO Yearly',
      canPurchase: isNative,
    };
    return pricing;
  }

  const pricing = {};
  for (const id of ALL_PRODUCT_IDS) {
    const product = store.get(id);
    if (product) {
      const offer = product.offers?.[0];
      pricing[id] = {
        price: offer?.pricingPhases?.[0]?.price || product.pricing?.price || `$${product.price || '?'}`,
        priceRaw: offer?.pricingPhases?.[0]?.priceMicros ? offer.pricingPhases[0].priceMicros / 1000000 : null,
        currency: offer?.pricingPhases?.[0]?.currency || 'USD',
        title: product.title || id,
        description: product.description || '',
        canPurchase: product.canPurchase || false,
      };
    }
  }
  return pricing;
}

/**
 * Initiate a purchase flow
 * @param {string} productId - Product ID to purchase
 * @returns {Promise<boolean>} true if purchase flow started
 */
export async function purchaseProduct(productId) {
  if (!isNative) {
    // On web, show download prompt
    return { success: false, reason: 'web', message: 'Download the Tire Empire app to purchase TireCoins!' };
  }

  if (!store) {
    return { success: false, reason: 'not_initialized', message: 'Store not ready. Try again.' };
  }

  try {
    const product = store.get(productId);
    if (!product) {
      return { success: false, reason: 'product_not_found', message: 'Product not available.' };
    }

    const offer = product.offers?.[0];
    if (!offer) {
      return { success: false, reason: 'no_offer', message: 'Product not available for purchase.' };
    }

    // This opens the native Google Play / App Store purchase dialog
    await store.order(offer);
    return { success: true };

  } catch (err) {
    console.error('[IAP] Purchase error:', err);
    return { success: false, reason: 'error', message: err.message || 'Purchase failed.' };
  }
}

/**
 * Restore previous purchases (subscriptions)
 */
export async function restorePurchases() {
  if (!store || !isNative) return [];
  try {
    await store.restorePurchases();
    return store.verifiedPurchases || [];
  } catch (err) {
    console.error('[IAP] Restore error:', err);
    return [];
  }
}

/**
 * Check if IAP is available
 */
export function isIAPAvailable() {
  return isNative && initialized;
}
