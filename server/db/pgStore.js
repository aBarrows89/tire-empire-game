import { pool } from './pool.js';
import {
  getCachedPlayer, setCachedPlayer, invalidatePlayer,
  getCachedGame, setCachedGame, invalidateGame,
  getCachedLeaderboard, setCachedLeaderboard, invalidateLeaderboard,
  invalidateAllPlayers,
} from './playerCache.js';

// ── Per-player in-memory mutex to serialize actions ──
const playerLocks = new Map();
export async function withPlayerLock(playerId, fn) {
  // Get or create a lock queue for this player
  if (!playerLocks.has(playerId)) playerLocks.set(playerId, Promise.resolve());
  // Chain onto the existing lock
  const prev = playerLocks.get(playerId);
  let release;
  const next = new Promise(resolve => { release = resolve; });
  playerLocks.set(playerId, next);
  await prev; // Wait for previous action on this player to finish
  try {
    return await fn();
  } finally {
    release();
    // Clean up if no more waiters
    if (playerLocks.get(playerId) === next) playerLocks.delete(playerId);
  }
}

// ── In-memory stores for features without dedicated tables ──
const playerListings = [];
const directTrades = [];
const tournaments = new Map();
const shopSaleListings = [];

// ── Ensure schema exists on first load ──
async function ensureSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        game_state    JSONB NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS games (
        id            TEXT PRIMARY KEY DEFAULT 'default',
        week          INTEGER NOT NULL DEFAULT 1,
        tick_ms       INTEGER NOT NULL DEFAULT 60000,
        economy       JSONB NOT NULL DEFAULT '{}',
        ai_shops      JSONB NOT NULL DEFAULT '[]',
        liquidation   JSONB NOT NULL DEFAULT '[]',
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS leaderboard (
        player_id     TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        wealth        BIGINT NOT NULL DEFAULT 0,
        reputation    REAL NOT NULL DEFAULT 0,
        locations     INTEGER NOT NULL DEFAULT 0,
        week          INTEGER NOT NULL DEFAULT 0,
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS files (
        id            TEXT PRIMARY KEY,
        filename      TEXT NOT NULL,
        content_type  TEXT NOT NULL DEFAULT 'application/octet-stream',
        data          BYTEA NOT NULL,
        uploaded_at   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id            TEXT PRIMARY KEY,
        player_id     TEXT NOT NULL,
        player_name   TEXT NOT NULL,
        channel       TEXT NOT NULL DEFAULT 'global',
        text          TEXT NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dm_messages (
        id            TEXT PRIMARY KEY,
        from_id       TEXT NOT NULL,
        from_name     TEXT NOT NULL DEFAULT '',
        to_id         TEXT NOT NULL,
        text          TEXT NOT NULL,
        read          BOOLEAN DEFAULT false,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS chat_reports (
        id            TEXT PRIMARY KEY,
        reporter_id   TEXT NOT NULL,
        message_id    TEXT NOT NULL,
        reason        TEXT NOT NULL DEFAULT '',
        status        TEXT NOT NULL DEFAULT 'pending',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS chat_mutes_db (
        player_id     TEXT PRIMARY KEY,
        muted_by      TEXT,
        reason        TEXT DEFAULT '',
        expires_at    TIMESTAMPTZ,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS analytics_events (
        id            SERIAL PRIMARY KEY,
        player_id     TEXT,
        event_type    TEXT NOT NULL,
        event_data    JSONB DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS player_financials (
        player_id     TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        cash          REAL NOT NULL DEFAULT 0,
        bank_balance  REAL NOT NULL DEFAULT 0,
        tire_coins    REAL NOT NULL DEFAULT 0,
        is_premium    BOOLEAN DEFAULT false,
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS player_stats (
        player_id     TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        reputation    REAL NOT NULL DEFAULT 0,
        day           INTEGER NOT NULL DEFAULT 1,
        total_rev     REAL NOT NULL DEFAULT 0,
        day_rev       REAL NOT NULL DEFAULT 0,
        day_profit    REAL NOT NULL DEFAULT 0,
        day_sold      INTEGER NOT NULL DEFAULT 0,
        total_sold    INTEGER NOT NULL DEFAULT 0,
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_type_date ON analytics_events(event_type, created_at);
      CREATE INDEX IF NOT EXISTS idx_analytics_player_date ON analytics_events(player_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_chat_channel_date ON chat_messages(channel, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_dm_participants ON dm_messages(from_id, to_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_dm_to ON dm_messages(to_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chat_reports_status ON chat_reports(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_wealth ON leaderboard(wealth DESC);
      CREATE INDEX IF NOT EXISTS idx_players_updated ON players(updated_at);
      INSERT INTO games (id) VALUES ('default') ON CONFLICT DO NOTHING;
    `);
    console.log('[pgStore] Schema ensured');
  } catch (err) {
    console.error('[pgStore] Schema creation error:', err.message);
  }
}

await ensureSchema();

// Helper: ensure JSONB fields are parsed (pg sometimes returns strings)
function parseJson(val) {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return val; }
  }
  return val;
}

// ── Players ──

export async function getPlayer(id) {
  const cached = getCachedPlayer(id);
  if (cached) return cached;
  const { rows } = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
  const row = rows[0] || null;
  if (row) {
    row.game_state = parseJson(row.game_state);
    setCachedPlayer(id, row);
  }
  return row;
}

export async function createPlayer(id, name, gameState) {
  const { rows } = await pool.query(
    `INSERT INTO players (id, name, game_state) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET name = $2, game_state = $3::jsonb, updated_at = NOW()
     RETURNING *`,
    [id, name, JSON.stringify(gameState)]
  );
  invalidatePlayer(id);
  return rows[0];
}

export async function savePlayerState(id, gameState) {
  // UPDATE only — never re-create a deleted player
  await pool.query(
    `UPDATE players SET game_state = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [id, JSON.stringify(gameState)]
  );
  // Dual-write hot fields to dedicated tables (non-blocking, fire-and-forget)
  _syncHotTables(id, gameState).catch(() => {});
  // Write-through: update cache immediately
  invalidatePlayer(id);
}

/**
 * Lightweight save — only financials and stats tables.
 * Used by tick loop for most ticks where only numbers change.
 */
export async function savePlayerFinancials(id, gameState) {
  await pool.query(
    `INSERT INTO player_financials (player_id, cash, bank_balance, tire_coins, is_premium, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (player_id) DO UPDATE SET
       cash = $2, bank_balance = $3, tire_coins = $4, is_premium = $5, updated_at = NOW()`,
    [id, gameState.cash || 0, gameState.bankBalance || 0, gameState.tireCoins || 0, gameState.isPremium || false]
  );
}

export async function savePlayerStats(id, gameState) {
  await pool.query(
    `INSERT INTO player_stats (player_id, reputation, day, total_rev, day_rev, day_profit, day_sold, total_sold, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (player_id) DO UPDATE SET
       reputation = $2, day = $3, total_rev = $4, day_rev = $5, day_profit = $6, day_sold = $7, total_sold = $8, updated_at = NOW()`,
    [id, gameState.reputation || 0, gameState.day || 1, gameState.totalRev || 0, gameState.dayRev || 0, gameState.dayProfit || 0, gameState.daySold || 0, gameState.totalSold || 0]
  );
}

/**
 * Sync hot fields to dedicated tables (dual-write).
 * Called as fire-and-forget from savePlayerState.
 */
async function _syncHotTables(id, g) {
  try {
    await Promise.all([
      savePlayerFinancials(id, g),
      savePlayerStats(id, g),
    ]);
  } catch (err) {
    // Non-critical — JSONB is the source of truth during migration
    console.error('[pgStore] Hot table sync error:', err.message);
  }
}

export async function isCompanyNameTaken(name, excludeId = null) {
  const { rows } = await pool.query(
    "SELECT id FROM players WHERE LOWER(game_state->>'companyName') = LOWER($1)",
    [name.trim()]
  );
  if (excludeId) return rows.some(r => r.id !== excludeId);
  return rows.length > 0;
}

export async function getAllActivePlayers() {
  const { rows } = await pool.query(
    "SELECT id, game_state FROM players WHERE (game_state->>'paused')::boolean IS NOT TRUE"
  );
  for (const r of rows) r.game_state = parseJson(r.game_state);
  return rows;
}

export async function removePlayer(id) {
  const { rowCount } = await pool.query('DELETE FROM players WHERE id = $1', [id]);
  await pool.query('DELETE FROM leaderboard WHERE player_id = $1', [id]);
  invalidatePlayer(id);
  invalidateLeaderboard();
  return rowCount > 0;
}

// ── Games ──

export async function getGame(id = 'default') {
  const cached = getCachedGame();
  if (cached && cached.id === id) return cached;
  const { rows } = await pool.query('SELECT * FROM games WHERE id = $1', [id]);
  const row = rows[0] || null;
  if (row) {
    row.day = row.week; // Map DB column name to code property name
    row.economy = parseJson(row.economy);
    row.ai_shops = parseJson(row.ai_shops);
    row.liquidation = parseJson(row.liquidation);
    if (!Array.isArray(row.ai_shops)) row.ai_shops = [];
    if (!Array.isArray(row.liquidation)) row.liquidation = [];
    setCachedGame(row);
  }
  return row;
}

export async function saveGame(id, day, economy, aiShops, liquidation) {
  try {
    const econStr = JSON.stringify(economy || {});
    const shopsStr = JSON.stringify(aiShops || []);
    const liqStr = JSON.stringify(liquidation || []);
    await pool.query(
      `UPDATE games SET week = $2, economy = $3::jsonb, ai_shops = $4::jsonb, liquidation = $5::jsonb, updated_at = NOW() WHERE id = $1`,
      [id, day, econStr, shopsStr, liqStr]
    );
    invalidateGame();
  } catch (err) {
    console.error('[pgStore] saveGame error:', err.message);
  }
}

// ── Leaderboard ──

export async function getLeaderboard(limit = 20) {
  const cached = getCachedLeaderboard();
  if (cached && cached._limit >= limit) return cached.rows.slice(0, limit);
  const { rows } = await pool.query(
    'SELECT * FROM leaderboard ORDER BY wealth DESC LIMIT $1',
    [limit]
  );
  setCachedLeaderboard({ rows, _limit: limit });
  return rows;
}

export async function upsertLeaderboard(playerId, name, wealth, reputation, locations, day, isPremium) {
  await pool.query(
    `INSERT INTO leaderboard (player_id, name, wealth, reputation, locations, week, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (player_id) DO UPDATE SET
       name = $2, wealth = $3, reputation = $4, locations = $5, week = $6, updated_at = NOW()`,
    [playerId, name, wealth, reputation, locations, day]
  );
  invalidateLeaderboard();
}

// ── Player Marketplace Listings (in-memory) ──

export async function getPlayerListings(filter = {}) {
  let results = [...playerListings];
  if (filter.status) results = results.filter(l => l.status === filter.status);
  if (filter.sellerId) results = results.filter(l => l.sellerId === filter.sellerId);
  return results;
}

export async function addPlayerListing(listing) {
  playerListings.push(listing);
  return listing;
}

export async function updatePlayerListing(id, updates) {
  const idx = playerListings.findIndex(l => l.id === id);
  if (idx === -1) return null;
  Object.assign(playerListings[idx], updates);
  return playerListings[idx];
}

export async function getPlayerListingById(id) {
  return playerListings.find(l => l.id === id) || null;
}

// ── Direct P2P Trades (in-memory) ──

export async function getDirectTrades(filter = {}) {
  let results = [...directTrades];
  if (filter.status) results = results.filter(t => t.status === filter.status);
  if (filter.playerId) results = results.filter(t => t.senderId === filter.playerId || t.receiverId === filter.playerId);
  return results;
}

export async function addDirectTrade(trade) {
  directTrades.push(trade);
  return trade;
}

export async function getDirectTradeById(id) {
  return directTrades.find(t => t.id === id) || null;
}

export async function updateDirectTrade(id, updates) {
  const idx = directTrades.findIndex(t => t.id === id);
  if (idx === -1) return null;
  Object.assign(directTrades[idx], updates);
  return directTrades[idx];
}

// ── Tournaments (in-memory) ──

export async function getTournament(id) { return tournaments.get(id) || null; }
export async function saveTournament(id, data) { tournaments.set(id, data); }

// ── Chat Messages (DB-backed) ──

export async function getChatMessages(limit = 50, channel = null) {
  let query, params;
  if (channel) {
    query = 'SELECT * FROM chat_messages WHERE channel = $1 ORDER BY created_at DESC LIMIT $2';
    params = [channel, limit];
  } else {
    query = 'SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT $1';
    params = [limit];
  }
  const { rows } = await pool.query(query, params);
  // Return in chronological order (oldest first)
  return rows.reverse().map(r => ({
    id: r.id, playerId: r.player_id, playerName: r.player_name,
    channel: r.channel, text: r.text, timestamp: new Date(r.created_at).getTime(),
  }));
}

export async function addChatMessage(msg) {
  await pool.query(
    `INSERT INTO chat_messages (id, player_id, player_name, channel, text, created_at)
     VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))`,
    [msg.id, msg.playerId, msg.playerName, msg.channel || 'global', msg.text, msg.timestamp]
  );
  return msg;
}

export async function deleteChatMessage(messageId) {
  const { rowCount } = await pool.query('DELETE FROM chat_messages WHERE id = $1', [messageId]);
  return rowCount > 0;
}

export async function cleanOldChatMessages(daysOld = 7) {
  const { rowCount } = await pool.query(
    `DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '1 day' * $1`, [daysOld]
  );
  return rowCount;
}

// ── Direct Messages (DB-backed) ──

export async function addDM(msg) {
  await pool.query(
    `INSERT INTO dm_messages (id, from_id, from_name, to_id, text, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [msg.id, msg.fromId, msg.fromName, msg.toId, msg.text]
  );
  return msg;
}

export async function getDMs(playerId1, playerId2, limit = 50) {
  const { rows } = await pool.query(
    `SELECT * FROM dm_messages
     WHERE (from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1)
     ORDER BY created_at DESC LIMIT $3`,
    [playerId1, playerId2, limit]
  );
  return rows.reverse().map(r => ({
    id: r.id, fromId: r.from_id, fromName: r.from_name, toId: r.to_id,
    text: r.text, read: r.read, timestamp: new Date(r.created_at).getTime(),
  }));
}

export async function getRecentDMPartners(playerId, limit = 20) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (partner) partner, partner_name, last_at FROM (
       SELECT to_id AS partner, '' AS partner_name, MAX(created_at) AS last_at
       FROM dm_messages WHERE from_id = $1 GROUP BY to_id
       UNION ALL
       SELECT from_id AS partner, from_name AS partner_name, MAX(created_at) AS last_at
       FROM dm_messages WHERE to_id = $1 GROUP BY from_id, from_name
     ) sub ORDER BY partner, last_at DESC LIMIT $2`,
    [playerId, limit]
  );
  return rows;
}

export async function getUnreadDMCount(playerId) {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM dm_messages WHERE to_id = $1 AND read = false',
    [playerId]
  );
  return rows[0]?.count || 0;
}

export async function markDMsRead(playerId, fromId) {
  await pool.query(
    'UPDATE dm_messages SET read = true WHERE to_id = $1 AND from_id = $2 AND read = false',
    [playerId, fromId]
  );
}

// ── Chat Reports (DB-backed) ──

export async function addChatReport(report) {
  await pool.query(
    `INSERT INTO chat_reports (id, reporter_id, message_id, reason, created_at) VALUES ($1, $2, $3, $4, NOW())`,
    [report.id, report.reporterId, report.messageId, report.reason || '']
  );
  return report;
}

export async function getChatReports(status = 'pending', limit = 50) {
  const { rows } = await pool.query(
    'SELECT * FROM chat_reports WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
    [status, limit]
  );
  return rows;
}

export async function updateChatReport(id, updates) {
  if (updates.status) {
    await pool.query('UPDATE chat_reports SET status = $1 WHERE id = $2', [updates.status, id]);
  }
}

// ── Chat Mutes (DB-backed) ──

export async function getChatMutes() {
  const { rows } = await pool.query('SELECT * FROM chat_mutes_db');
  const result = {};
  for (const r of rows) {
    result[r.player_id] = {
      mutedBy: r.muted_by, reason: r.reason,
      expiresAt: r.expires_at ? new Date(r.expires_at).getTime() : null,
      mutedAt: new Date(r.created_at).getTime(),
    };
  }
  return result;
}

export async function setChatMute(playerId, data) {
  await pool.query(
    `INSERT INTO chat_mutes_db (player_id, muted_by, reason, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (player_id) DO UPDATE SET muted_by = $2, reason = $3, expires_at = $4, created_at = NOW()`,
    [playerId, data.mutedBy || null, data.reason || '', data.expiresAt ? new Date(data.expiresAt) : null]
  );
}

export async function removeChatMute(playerId) {
  await pool.query('DELETE FROM chat_mutes_db WHERE player_id = $1', [playerId]);
}

// ── Shop Sale Listings (in-memory) ──

export async function getShopSaleListings(filter = {}) {
  let results = [...shopSaleListings];
  if (filter.status) results = results.filter(l => l.status === filter.status);
  if (filter.sellerId) results = results.filter(l => l.sellerId === filter.sellerId);
  return results;
}

export async function addShopSaleListing(listing) {
  shopSaleListings.push(listing);
  return listing;
}

export async function getShopSaleListingById(id) {
  return shopSaleListings.find(l => l.id === id) || null;
}

export async function updateShopSaleListing(id, updates) {
  const idx = shopSaleListings.findIndex(l => l.id === id);
  if (idx === -1) return null;
  Object.assign(shopSaleListings[idx], updates);
  return shopSaleListings[idx];
}

export async function removeShopSaleListing(id) {
  const idx = shopSaleListings.findIndex(l => l.id === id);
  if (idx === -1) return false;
  shopSaleListings.splice(idx, 1);
  return true;
}

// ── File Storage ──

export async function saveFile(id, filename, contentType, data) {
  await pool.query(
    `INSERT INTO files (id, filename, content_type, data) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET filename = $2, content_type = $3, data = $4, uploaded_at = NOW()`,
    [id, filename, contentType, data]
  );
}

export async function getFile(id) {
  const { rows } = await pool.query('SELECT * FROM files WHERE id = $1', [id]);
  return rows[0] || null;
}
