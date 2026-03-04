/**
 * Push notification sender using Firebase Cloud Messaging (FCM).
 * Vinnie-voiced notification copy.
 * Rate limited: max 3 push per day per player.
 */

let _admin = null;
let _messaging = null;

// Track daily push counts per player (resets in-memory on restart, which is fine)
const _dailyPushCount = new Map(); // playerId → count
let _lastResetDay = 0;

const MAX_PUSH_PER_DAY = 3;

/**
 * Initialize Firebase Admin SDK (lazy, only when first push is sent).
 */
async function initAdmin() {
  if (_admin) return;
  try {
    const admin = await import('firebase-admin');
    // Use GOOGLE_APPLICATION_CREDENTIALS env var or service account from env
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : undefined;

    if (serviceAccount) {
      _admin = admin.default.initializeApp({
        credential: admin.default.credential.cert(serviceAccount),
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      _admin = admin.default.initializeApp();
    } else {
      console.log('[push] No Firebase service account configured — push notifications disabled');
      return;
    }
    _messaging = _admin.messaging();
    console.log('[push] Firebase Admin initialized');
  } catch (err) {
    console.error('[push] Firebase Admin init error:', err.message);
  }
}

/**
 * Reset daily counters (called from tick loop).
 */
export function resetDailyPushCounts(gameDay) {
  if (gameDay !== _lastResetDay) {
    _dailyPushCount.clear();
    _lastResetDay = gameDay;
  }
}

/**
 * Send a push notification to a specific player.
 * @param {string} playerId
 * @param {string} fcmToken — the player's FCM device token
 * @param {string} title — notification title
 * @param {string} body — notification body (Vinnie voice)
 * @param {object} data — optional data payload (e.g. { panel: 'dashboard' })
 * @returns {boolean} whether the push was sent
 */
export async function sendPushToPlayer(playerId, fcmToken, title, body, data = {}) {
  if (!fcmToken) return false;

  // Rate limit
  const count = _dailyPushCount.get(playerId) || 0;
  if (count >= MAX_PUSH_PER_DAY) return false;

  await initAdmin();
  if (!_messaging) return false;

  try {
    await _messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: { ...data, playerId },
      android: {
        priority: 'high',
        notification: {
          channelId: 'tire_empire_main',
          icon: 'ic_notification',
          color: '#ffd54f',
        },
      },
    });
    _dailyPushCount.set(playerId, count + 1);
    return true;
  } catch (err) {
    // Token might be invalid — log but don't crash
    if (err.code === 'messaging/registration-token-not-registered') {
      console.log(`[push] Stale token for ${playerId}, should clear`);
    } else {
      console.error(`[push] Send error for ${playerId}:`, err.message);
    }
    return false;
  }
}

/**
 * Vinnie-voiced notification templates.
 * Called from tick loop to check conditions and send.
 */
export const VINNIE_NOTIFICATIONS = {
  cashLow: (cash) => ({
    title: "Vinnie says...",
    body: `Yo kid, your bank account's looking rough. Only $${Math.floor(cash)} left. Time to hustle.`,
    data: { panel: 'bank' },
  }),
  inventoryFull: () => ({
    title: "Vinnie says...",
    body: "Your warehouse is packed! Time to sell or expand, kid.",
    data: { panel: 'storage' },
  }),
  factoryDone: () => ({
    title: "Vinnie says...",
    body: "Your factory just finished a batch. Go check it out!",
    data: { panel: 'factory' },
  }),
  globalEvent: (eventName) => ({
    title: "Market Alert",
    body: `Heads up — ${eventName} just hit the market. Adjust your strategy, kid.`,
    data: { panel: 'dashboard' },
  }),
  noSalesDay: () => ({
    title: "Vinnie says...",
    body: "Zero sales today? Come on kid, check your prices or stock up.",
    data: { panel: 'pricing' },
  }),
  repMilestone: (rep) => ({
    title: "Vinnie says...",
    body: `Rep ${rep}! Not bad, kid. New doors are opening for you.`,
    data: { panel: 'dashboard' },
  }),
};

/**
 * Check conditions and send push notifications for a player.
 * Called once per tick from the tick loop.
 */
export async function checkAndSendPush(playerId, gameState, gameDay) {
  const g = gameState;
  if (!g.fcmToken) return;

  // Reset counters on new day
  resetDailyPushCounts(gameDay);

  // Don't spam — check notification preferences
  if (g.notifications === false) return;

  // Cash low (below $100 with shops)
  if (g.cash < 100 && (g.locations || []).length > 0) {
    const n = VINNIE_NOTIFICATIONS.cashLow(g.cash);
    await sendPushToPlayer(playerId, g.fcmToken, n.title, n.body, n.data);
  }

  // No sales for the day
  if (g.daySold === 0 && (g.locations || []).length > 0 && g.day > 5) {
    const n = VINNIE_NOTIFICATIONS.noSalesDay();
    await sendPushToPlayer(playerId, g.fcmToken, n.title, n.body, n.data);
  }
}
