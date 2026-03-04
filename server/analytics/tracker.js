/**
 * Analytics event tracker — buffers events in memory, flushes to DB every 10s.
 * Graceful shutdown flushes remaining buffer on SIGTERM.
 */
import { pool } from '../db/pool.js';

const FLUSH_INTERVAL_MS = 10_000;
const MAX_BUFFER_SIZE = 500;
let _buffer = [];
let _flushTimer = null;

/**
 * Track an analytics event.
 * @param {string} playerId
 * @param {string} eventType — e.g. 'action_performed', 'session_start', 'chat_sent'
 * @param {object} data — arbitrary event data
 */
export function trackEvent(playerId, eventType, data = {}) {
  _buffer.push({ playerId, eventType, data, ts: new Date() });
  if (_buffer.length >= MAX_BUFFER_SIZE) {
    flush();
  }
}

/**
 * Flush buffered events to the database.
 */
export async function flush() {
  if (_buffer.length === 0) return;
  const batch = _buffer.splice(0);
  try {
    // Build a bulk INSERT
    const values = [];
    const params = [];
    let idx = 1;
    for (const evt of batch) {
      values.push(`($${idx}, $${idx + 1}, $${idx + 2}::jsonb, $${idx + 3})`);
      params.push(evt.playerId, evt.eventType, JSON.stringify(evt.data), evt.ts);
      idx += 4;
    }
    await pool.query(
      `INSERT INTO analytics_events (player_id, event_type, event_data, created_at) VALUES ${values.join(',')}`,
      params
    );
  } catch (err) {
    console.error('[analytics] Flush error:', err.message);
    // Put failed events back (at the front) so we don't lose them
    _buffer.unshift(...batch);
    // Cap buffer to prevent memory leak on persistent failures
    if (_buffer.length > MAX_BUFFER_SIZE * 2) {
      _buffer = _buffer.slice(-MAX_BUFFER_SIZE);
    }
  }
}

/**
 * Start the periodic flush timer.
 */
export function startAnalytics() {
  if (_flushTimer) return;
  _flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  console.log('[analytics] Started (flush every 10s)');
}

/**
 * Stop analytics and flush remaining buffer.
 */
export async function stopAnalytics() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  await flush();
  console.log('[analytics] Stopped and flushed');
}

/**
 * Clean up old analytics events (retention: N days).
 */
export async function cleanOldAnalytics(retentionDays = 90) {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM analytics_events WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [retentionDays]
    );
    return rowCount;
  } catch (err) {
    console.error('[analytics] Cleanup error:', err.message);
    return 0;
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await stopAnalytics();
});
process.on('SIGINT', async () => {
  await stopAnalytics();
});

// ── Query helpers for admin dashboard ──

export async function getOverviewStats() {
  try {
    const now = new Date();
    const dayAgo = new Date(now - 86400000);
    const weekAgo = new Date(now - 7 * 86400000);
    const monthAgo = new Date(now - 30 * 86400000);

    const [dau, wau, mau, totalPlayers, totalEvents] = await Promise.all([
      pool.query(`SELECT COUNT(DISTINCT player_id) as c FROM analytics_events WHERE created_at > $1`, [dayAgo]),
      pool.query(`SELECT COUNT(DISTINCT player_id) as c FROM analytics_events WHERE created_at > $1`, [weekAgo]),
      pool.query(`SELECT COUNT(DISTINCT player_id) as c FROM analytics_events WHERE created_at > $1`, [monthAgo]),
      pool.query(`SELECT COUNT(*) as c FROM players`),
      pool.query(`SELECT COUNT(*) as c FROM analytics_events`),
    ]);

    return {
      dau: parseInt(dau.rows[0]?.c || 0),
      wau: parseInt(wau.rows[0]?.c || 0),
      mau: parseInt(mau.rows[0]?.c || 0),
      totalPlayers: parseInt(totalPlayers.rows[0]?.c || 0),
      totalEvents: parseInt(totalEvents.rows[0]?.c || 0),
    };
  } catch (err) {
    console.error('[analytics] getOverviewStats error:', err.message);
    return { dau: 0, wau: 0, mau: 0, totalPlayers: 0, totalEvents: 0 };
  }
}

export async function getFunnelStats() {
  try {
    const [tutDone, shopOpened, premiumConv, factoryBuilt] = await Promise.all([
      pool.query(`SELECT COUNT(DISTINCT player_id) as c FROM analytics_events WHERE event_type = 'tutorial_done'`),
      pool.query(`SELECT COUNT(DISTINCT player_id) as c FROM analytics_events WHERE event_type = 'action_performed' AND event_data->>'action' = 'openShop'`),
      pool.query(`SELECT COUNT(DISTINCT player_id) as c FROM analytics_events WHERE event_type = 'action_performed' AND event_data->>'action' = 'buyPremium'`),
      pool.query(`SELECT COUNT(DISTINCT player_id) as c FROM analytics_events WHERE event_type = 'action_performed' AND event_data->>'action' = 'buildFactory'`),
    ]);

    return {
      tutorialComplete: parseInt(tutDone.rows[0]?.c || 0),
      shopOpened: parseInt(shopOpened.rows[0]?.c || 0),
      premiumConversion: parseInt(premiumConv.rows[0]?.c || 0),
      factoryBuilt: parseInt(factoryBuilt.rows[0]?.c || 0),
    };
  } catch (err) {
    console.error('[analytics] getFunnelStats error:', err.message);
    return { tutorialComplete: 0, shopOpened: 0, premiumConversion: 0, factoryBuilt: 0 };
  }
}

export async function getTimeSeries(metric = 'session_start', interval = 'day', days = 30) {
  try {
    const since = new Date(Date.now() - days * 86400000);
    const { rows } = await pool.query(
      `SELECT date_trunc($1, created_at) as bucket, COUNT(*) as count
       FROM analytics_events
       WHERE event_type = $2 AND created_at > $3
       GROUP BY bucket ORDER BY bucket`,
      [interval, metric, since]
    );
    return rows.map(r => ({ date: r.bucket, count: parseInt(r.count) }));
  } catch (err) {
    console.error('[analytics] getTimeSeries error:', err.message);
    return [];
  }
}

export async function getActionBreakdown(days = 7) {
  try {
    const since = new Date(Date.now() - days * 86400000);
    const { rows } = await pool.query(
      `SELECT event_data->>'action' as action, COUNT(*) as count
       FROM analytics_events
       WHERE event_type = 'action_performed' AND created_at > $1
       GROUP BY action ORDER BY count DESC LIMIT 30`,
      [since]
    );
    return rows.map(r => ({ action: r.action, count: parseInt(r.count) }));
  } catch (err) {
    console.error('[analytics] getActionBreakdown error:', err.message);
    return [];
  }
}
