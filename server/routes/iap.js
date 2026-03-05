// ═══════════════════════════════════════════════════════════════
// In-App Purchase Validation Routes
// Validates receipts from Google Play and Apple App Store
// before granting TireCoins or premium status
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getPlayer, savePlayerState } from '../db/queries.js';
import { uid } from '../../shared/helpers/random.js';
import { MONET } from '../../shared/constants/monetization.js';

const router = Router();

// ═══════════════════════════════════════
// POST /api/iap/validate
// cordova-plugin-purchase sends receipts here automatically
// ═══════════════════════════════════════
router.post('/validate', async (req, res) => {
  try {
    const receipt = req.body;

    if (!receipt || !receipt.id) {
      return res.status(400).json({ ok: false, message: 'Invalid receipt' });
    }

    const platform = receipt.platform || 'unknown';
    const transactionId = receipt.transactionId || receipt.id;
    const productId = receipt.products?.[0]?.id || receipt.id;

    console.log(`[IAP] Validating ${platform} receipt for product: ${productId}, tx: ${transactionId}`);

    // ── Platform-specific validation ──
    let valid = false;
    let validationResult = null;

    if (platform === 'android-playstore' || platform === 'google-play') {
      validationResult = await validateGooglePlay(receipt);
      valid = validationResult.valid;
    } else if (platform === 'apple-appstore' || platform === 'ios-appstore') {
      validationResult = await validateAppleAppStore(receipt);
      valid = validationResult.valid;
    } else {
      // Development/testing — validate against known product IDs
      const knownIds = [
        ...(MONET.tcPurchase?.tiers || []).map(t => t.id),
        'premium_monthly', 'premium_yearly',
      ];
      if (knownIds.includes(productId)) {
        valid = true;
        validationResult = { valid: true, reason: 'dev_mode' };
        console.log(`[IAP] Dev mode validation for ${productId} — auto-approved`);
      }
    }

    if (!valid) {
      console.warn(`[IAP] Validation FAILED for ${productId}:`, validationResult?.reason);
      return res.status(200).json({
        ok: false,
        data: { id: transactionId, latest_receipt: true },
        message: validationResult?.reason || 'Validation failed',
      });
    }

    // ── Receipt valid — respond to cordova-plugin-purchase ──
    // The plugin expects this specific response format to mark the purchase as verified
    console.log(`[IAP] ✅ Validated ${productId} (tx: ${transactionId})`);

    // Log for admin dashboard
    try {
      const { pool } = await import('../db/pool.js');
      await pool.query(
        `INSERT INTO revenue_events (id, player_id, event_type, data) VALUES ($1, $2, 'iap_validated', $3::jsonb)`,
        [uid(), 'system', JSON.stringify({ productId, transactionId, platform, timestamp: Date.now() })]
      );
    } catch (e) { /* non-critical */ }

    res.json({
      ok: true,
      data: {
        id: transactionId,
        latest_receipt: true,
        transaction: { type: 'android-playstore', id: transactionId },
      },
    });

  } catch (err) {
    console.error('[IAP] Validation error:', err);
    res.status(500).json({ ok: false, message: 'Server error during validation' });
  }
});

// ═══════════════════════════════════════
// POST /api/iap/grant
// Called by the client AFTER purchase is verified
// Grants TC or premium status to the player
// ═══════════════════════════════════════
router.post('/grant', authMiddleware, async (req, res) => {
  try {
    const { tierId, transactionId, platform } = req.body;

    if (!tierId || !transactionId) {
      return res.status(400).json({ error: 'Missing tierId or transactionId' });
    }

    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;

    // ── Prevent double-granting same transaction ──
    if (!g._processedTransactions) g._processedTransactions = [];
    if (g._processedTransactions.includes(transactionId)) {
      return res.json({ ok: true, message: 'Already granted', tireCoins: g.tireCoins });
    }

    // ── TC Purchase ──
    const tcTier = (MONET.tcPurchase?.tiers || []).find(t => t.id === tierId);
    if (tcTier) {
      let tcToGrant = tcTier.tc;

      // First purchase ever? Double it
      if (!g._firstTcPurchase) {
        tcToGrant = Math.floor(tcToGrant * (MONET.tcPurchase.firstPurchaseMultiplier || 2.0));
        g._firstTcPurchase = g.day;
      }

      // Premium bonus
      if (g.isPremium) {
        tcToGrant = Math.floor(tcToGrant * (1 + (MONET.tcPurchase.premiumPurchaseBonus || 0.20)));
      }

      // Grant TC (bypasses cap — paid TC should never be lost)
      g.tireCoins = (g.tireCoins || 0) + tcToGrant;
      g._totalTcPurchased = (g._totalTcPurchased || 0) + tcToGrant;
      g._purchaseHistory = g._purchaseHistory || [];
      g._purchaseHistory.push({
        tierId, tc: tcToGrant, price: tcTier.price,
        transactionId, platform,
        day: g.day, timestamp: Date.now(),
      });
      if (g._purchaseHistory.length > 50) g._purchaseHistory.shift();

      g.log.push({ msg: `💰 Purchased ${tcToGrant} TireCoins!${tcTier.bonus > 0 ? ` (+${tcTier.bonus} bonus)` : ''}`, cat: 'event' });

      console.log(`[IAP] Granted ${tcToGrant} TC to player ${req.playerId} (${tierId})`);
    }

    // ── Premium Subscription ──
    else if (tierId === 'premium_monthly' || tierId === 'premium_yearly') {
      g.isPremium = true;
      g.premiumSince = g.day;
      g.premiumTier = tierId;
      g.premiumPlatform = platform;
      if (!g.cosmetics) g.cosmetics = [];
      if (!g.cosmetics.includes('gold_name')) g.cosmetics.push('gold_name');

      // Yearly signup bonus
      if (tierId === 'premium_yearly') {
        g.tireCoins = (g.tireCoins || 0) + 500;
        g.log.push({ msg: `⭐ PRO Yearly activated! +500 TC signup bonus`, cat: 'event' });
      } else {
        g.log.push({ msg: `⭐ PRO Monthly activated!`, cat: 'event' });
      }

      console.log(`[IAP] Premium activated for player ${req.playerId} (${tierId})`);
    }

    else {
      return res.status(400).json({ error: 'Unknown product tier' });
    }

    // Record transaction to prevent double-grant
    g._processedTransactions.push(transactionId);
    if (g._processedTransactions.length > 200) g._processedTransactions = g._processedTransactions.slice(-100);

    await savePlayerState(req.playerId, g, player.version);

    // Log to revenue_events
    try {
      const { pool } = await import('../db/pool.js');
      await pool.query(
        `INSERT INTO revenue_events (id, player_id, event_type, data) VALUES ($1, $2, 'iap_granted', $3::jsonb)`,
        [uid(), req.playerId, JSON.stringify({
          tierId, transactionId, platform,
          tcGranted: tcTier?.tc || 0,
          price: tcTier?.price || MONET.premiumTiers?.[tierId.replace('premium_', '')]?.price || 0,
        })]
      );
    } catch (e) { /* non-critical */ }

    res.json({
      ok: true,
      tireCoins: g.tireCoins,
      isPremium: g.isPremium,
    });

  } catch (err) {
    console.error('[IAP] Grant error:', err);
    res.status(500).json({ error: 'Failed to grant purchase' });
  }
});

// ═══════════════════════════════════════
// Google Play Receipt Validation
// Uses the Google Play Developer API (androidpublisher v3)
// ═══════════════════════════════════════
async function validateGooglePlay(receipt) {
  const playKey = process.env.GOOGLE_PLAY_KEY;

  if (!playKey) {
    console.warn('[IAP] GOOGLE_PLAY_KEY not set — skipping server validation');
    // In dev, accept all receipts. In prod, this should reject.
    if (process.env.NODE_ENV === 'production') {
      return { valid: false, reason: 'Server not configured for Google Play validation' };
    }
    return { valid: true, reason: 'dev_no_key' };
  }

  try {
    // Parse the service account key
    const serviceAccount = JSON.parse(Buffer.from(playKey, 'base64').toString('utf-8'));

    // Get OAuth2 token from Google
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: await createGoogleJWT(serviceAccount),
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      return { valid: false, reason: 'Failed to get Google auth token' };
    }

    const packageName = 'com.tireempire.app';
    const productId = receipt.products?.[0]?.id || receipt.id;
    const purchaseToken = receipt.purchaseToken || receipt.receipt?.purchaseToken;

    if (!purchaseToken) {
      return { valid: false, reason: 'No purchase token in receipt' };
    }

    // Verify with Google Play Developer API
    const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;
    const verifyResponse = await fetch(verifyUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!verifyResponse.ok) {
      const err = await verifyResponse.text();
      return { valid: false, reason: `Google API error: ${verifyResponse.status} ${err}` };
    }

    const purchaseData = await verifyResponse.json();

    // purchaseState: 0 = purchased, 1 = canceled, 2 = pending
    if (purchaseData.purchaseState !== 0) {
      return { valid: false, reason: `Purchase state: ${purchaseData.purchaseState}` };
    }

    // consumptionState: 0 = not consumed, 1 = consumed
    // For consumables, we need to consume after granting
    return { valid: true, purchaseData };

  } catch (err) {
    console.error('[IAP] Google Play validation error:', err);
    return { valid: false, reason: err.message };
  }
}

// ═══════════════════════════════════════
// Apple App Store Receipt Validation
// Uses App Store Server API v2 (storekit2)
// ═══════════════════════════════════════
async function validateAppleAppStore(receipt) {
  const appleKey = process.env.APPLE_IAP_SHARED_SECRET;

  if (!appleKey) {
    console.warn('[IAP] APPLE_IAP_SHARED_SECRET not set — skipping Apple validation');
    if (process.env.NODE_ENV === 'production') {
      return { valid: false, reason: 'Server not configured for Apple validation' };
    }
    return { valid: true, reason: 'dev_no_key' };
  }

  try {
    // For App Store Server API v2
    const receiptData = receipt.receipt?.appStoreReceipt || receipt.appStoreReceipt;
    if (!receiptData) {
      return { valid: false, reason: 'No App Store receipt data' };
    }

    // Verify with Apple
    const verifyUrl = process.env.NODE_ENV === 'production'
      ? 'https://buy.itunes.apple.com/verifyReceipt'
      : 'https://sandbox.itunes.apple.com/verifyReceipt';

    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'receipt-data': receiptData,
        password: appleKey,
        'exclude-old-transactions': true,
      }),
    });

    const result = await verifyResponse.json();

    // status 0 = valid
    if (result.status === 0) {
      return { valid: true, appleData: result };
    }

    // status 21007 = sandbox receipt sent to production — retry sandbox
    if (result.status === 21007) {
      const sandboxResponse = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'receipt-data': receiptData,
          password: appleKey,
          'exclude-old-transactions': true,
        }),
      });
      const sandboxResult = await sandboxResponse.json();
      return { valid: sandboxResult.status === 0, appleData: sandboxResult };
    }

    return { valid: false, reason: `Apple status: ${result.status}` };

  } catch (err) {
    console.error('[IAP] Apple validation error:', err);
    return { valid: false, reason: err.message };
  }
}

// ═══════════════════════════════════════
// JWT creation for Google Play API auth
// ═══════════════════════════════════════
async function createGoogleJWT(serviceAccount) {
  // Simple JWT creation for Google service account
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(payload)}`;

  // Sign with the private key
  const crypto = await import('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');

  return `${unsigned}.${signature}`;
}

export default router;
