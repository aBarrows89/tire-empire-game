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

// All stores are now Postgres-backed (no in-memory arrays)

// ── Ensure schema exists on first load ──
async function ensureSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        game_state    JSONB NOT NULL DEFAULT '{}',
        version       INTEGER NOT NULL DEFAULT 0
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
      CREATE TABLE IF NOT EXISTS player_listings (
        id            TEXT PRIMARY KEY,
        seller_id     TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active',
        data          JSONB NOT NULL DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS direct_trades (
        id            TEXT PRIMARY KEY,
        sender_id     TEXT NOT NULL,
        receiver_id   TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        data          JSONB NOT NULL DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS shop_sale_listings (
        id            TEXT PRIMARY KEY,
        seller_id     TEXT NOT NULL,
        city_id       TEXT NOT NULL DEFAULT '',
        status        TEXT NOT NULL DEFAULT 'active',
        asking_price  BIGINT NOT NULL DEFAULT 0,
        data          JSONB NOT NULL DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tournaments (
        id            TEXT PRIMARY KEY,
        data          JSONB NOT NULL DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW(),
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
      CREATE INDEX IF NOT EXISTS idx_listings_status ON player_listings(status);
      CREATE INDEX IF NOT EXISTS idx_listings_seller ON player_listings(seller_id);
      CREATE INDEX IF NOT EXISTS idx_trades_status ON direct_trades(status);
      CREATE INDEX IF NOT EXISTS idx_trades_players ON direct_trades(sender_id, receiver_id);
      CREATE INDEX IF NOT EXISTS idx_shop_sales_status ON shop_sale_listings(status);
      CREATE INDEX IF NOT EXISTS idx_shop_sales_seller ON shop_sale_listings(seller_id);

      -- Admin tools tables
      CREATE TABLE IF NOT EXISTS announcements (
        id            TEXT PRIMARY KEY,
        message       TEXT NOT NULL,
        style         TEXT NOT NULL DEFAULT 'info',
        active        BOOLEAN DEFAULT true,
        expires_at    TIMESTAMPTZ,
        created_by    TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ab_tests (
        id            TEXT PRIMARY KEY,
        name          TEXT,
        constant_key  TEXT,
        control_value TEXT,
        variant_value TEXT,
        metric        TEXT,
        active        BOOLEAN DEFAULT false,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS ab_test_assignments (
        player_id     TEXT NOT NULL,
        test_id       TEXT NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
        group_name    TEXT NOT NULL,
        PRIMARY KEY (player_id, test_id)
      );
      CREATE TABLE IF NOT EXISTS revenue_events (
        id            SERIAL PRIMARY KEY,
        player_id     TEXT,
        event_type    TEXT NOT NULL,
        revenue_cents INTEGER DEFAULT 0,
        platform      TEXT,
        metadata      JSONB DEFAULT '{}',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS scheduled_events (
        id            TEXT PRIMARY KEY,
        event_id      TEXT NOT NULL,
        trigger_day   INTEGER NOT NULL,
        duration      INTEGER,
        status        TEXT DEFAULT 'scheduled',
        created_by    TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS player_milestones (
        player_id     TEXT NOT NULL,
        milestone_id  TEXT NOT NULL,
        reached_day   INTEGER NOT NULL,
        reached_at    TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (player_id, milestone_id)
      );
      CREATE TABLE IF NOT EXISTS push_templates (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        title         TEXT NOT NULL,
        body          TEXT NOT NULL,
        segment       TEXT DEFAULT 'all',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS push_history (
        id            SERIAL PRIMARY KEY,
        template_id   TEXT,
        player_id     TEXT,
        title         TEXT NOT NULL,
        body          TEXT NOT NULL,
        sent_at       TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS reddit_threads (
        id            TEXT PRIMARY KEY,
        subreddit     TEXT NOT NULL,
        title         TEXT,
        body          TEXT,
        author        TEXT,
        url           TEXT NOT NULL,
        score         INTEGER DEFAULT 0,
        matched_keywords TEXT[],
        relevance     REAL DEFAULT 0,
        status        TEXT DEFAULT 'new',
        notes         TEXT,
        reviewed_at   TIMESTAMPTZ,
        engaged_at    TIMESTAMPTZ,
        fetched_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS referral_codes (
        code          TEXT PRIMARY KEY,
        channel       TEXT NOT NULL,
        campaign      TEXT,
        perks         JSONB DEFAULT '{}',
        max_uses      INTEGER DEFAULT 0,
        current_uses  INTEGER DEFAULT 0,
        active        BOOLEAN DEFAULT true,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS perks JSONB DEFAULT '{}';
      ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 0;
      ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS current_uses INTEGER DEFAULT 0;
      CREATE TABLE IF NOT EXISTS referral_events (
        id            SERIAL PRIMARY KEY,
        code          TEXT,
        player_id     TEXT,
        event_type    TEXT NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS player_contracts (
        id            TEXT PRIMARY KEY,
        buyer_id      TEXT NOT NULL,
        seller_id     TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'proposed',
        terms         JSONB NOT NULL DEFAULT '{}',
        history       JSONB DEFAULT '[]',
        deliveries    JSONB DEFAULT '[]',
        delivered_qty INTEGER DEFAULT 0,
        staged_qty    INTEGER DEFAULT 0,
        total_revenue INTEGER DEFAULT 0,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        completed_at  TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_pcontracts_buyer ON player_contracts(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_pcontracts_seller ON player_contracts(seller_id);
      CREATE INDEX IF NOT EXISTS idx_pcontracts_status ON player_contracts(status);

      CREATE TABLE IF NOT EXISTS reddit_comments (
        id            TEXT PRIMARY KEY,
        thread_id     TEXT NOT NULL REFERENCES reddit_threads(id),
        reddit_comment_id TEXT,
        body          TEXT NOT NULL,
        posted_by     TEXT,
        posted_at     TIMESTAMPTZ DEFAULT NOW(),
        deleted       BOOLEAN DEFAULT false
      );
      CREATE TABLE IF NOT EXISTS reddit_posts (
        id            TEXT PRIMARY KEY,
        subreddit     TEXT NOT NULL,
        title         TEXT NOT NULL,
        body          TEXT NOT NULL,
        reddit_post_id TEXT,
        url           TEXT,
        posted_by     TEXT,
        posted_at     TIMESTAMPTZ DEFAULT NOW(),
        deleted       BOOLEAN DEFAULT false
      );
      CREATE INDEX IF NOT EXISTS idx_reddit_posts_date ON reddit_posts(posted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reddit_comments_thread ON reddit_comments(thread_id);
      CREATE INDEX IF NOT EXISTS idx_reddit_status ON reddit_threads(status);
      CREATE INDEX IF NOT EXISTS idx_reddit_fetched ON reddit_threads(fetched_at DESC);
      CREATE INDEX IF NOT EXISTS idx_referral_code ON referral_events(code);
      CREATE INDEX IF NOT EXISTS idx_revenue_time ON revenue_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_scheduled_day ON scheduled_events(trigger_day);
      CREATE TABLE IF NOT EXISTS franchise_offerings (
        id              TEXT PRIMARY KEY,
        franchisor_id   TEXT NOT NULL,
        brand_name      TEXT NOT NULL,
        description     TEXT NOT NULL DEFAULT '',
        buy_in          BIGINT NOT NULL DEFAULT 50000,
        royalty_pct     REAL NOT NULL DEFAULT 0.07,
        monthly_fee     INTEGER NOT NULL DEFAULT 1500,
        required_brand  TEXT,
        min_rep         INTEGER NOT NULL DEFAULT 0,
        max_franchisees INTEGER NOT NULL DEFAULT 20,
        territory_ids   JSONB DEFAULT '[]',
        perks           JSONB DEFAULT '[]',
        active          BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS franchise_agreements (
        id                  TEXT PRIMARY KEY,
        offering_id         TEXT NOT NULL REFERENCES franchise_offerings(id),
        franchisor_id       TEXT NOT NULL,
        franchisee_id       TEXT NOT NULL,
        location_id         TEXT NOT NULL,
        brand_name          TEXT NOT NULL,
        buy_in_paid         BIGINT NOT NULL DEFAULT 0,
        royalty_pct         REAL NOT NULL DEFAULT 0.07,
        monthly_fee         INTEGER NOT NULL DEFAULT 1500,
        required_brand      TEXT,
        status              TEXT NOT NULL DEFAULT 'active',
        missed_payments     INTEGER NOT NULL DEFAULT 0,
        total_royalties_paid BIGINT NOT NULL DEFAULT 0,
        start_day           INTEGER NOT NULL DEFAULT 0,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_franchise_franchisor ON franchise_offerings(franchisor_id);
      CREATE INDEX IF NOT EXISTS idx_franchise_active ON franchise_offerings(active);
      CREATE INDEX IF NOT EXISTS idx_agreement_franchisee ON franchise_agreements(franchisee_id);
      CREATE INDEX IF NOT EXISTS idx_agreement_franchisor ON franchise_agreements(franchisor_id);
      CREATE INDEX IF NOT EXISTS idx_agreement_status ON franchise_agreements(status);
      INSERT INTO games (id) VALUES ('default') ON CONFLICT DO NOTHING;
    `);
    // Migration: add version column if missing (existing DBs)
    await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0`);
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
    row.version = row.version || 0;
    setCachedPlayer(id, row);
  }
  return row;
}

/** Version mismatch error for optimistic locking */
export class VersionConflictError extends Error {
  constructor(id, expected, actual) {
    super(`Version conflict for player ${id}: expected ${expected}, got ${actual}`);
    this.name = 'VersionConflictError';
  }
}

export async function createPlayer(id, name, gameState) {
  const { rows } = await pool.query(
    `INSERT INTO players (id, name, game_state) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET name = $2, game_state = $3::jsonb, updated_at = NOW()
     RETURNING *`,
    [id, name, JSON.stringify(gameState)]
  );
  const row = rows[0];
  if (row) {
    row.game_state = parseJson(row.game_state);
  }
  invalidatePlayer(id);
  return row;
}

export async function savePlayerState(id, gameState, expectedVersion = null) {
  // Hard cap on log size — prevents JSON bloat from crashing saves
  if (gameState && Array.isArray(gameState.log) && gameState.log.length > 100) {
    gameState = { ...gameState, log: gameState.log.slice(-100) };
  }
  if (expectedVersion !== null) {
    // Optimistic locking: only update if version matches
    const { rowCount } = await pool.query(
      `UPDATE players SET game_state = $2::jsonb, updated_at = NOW(), version = version + 1
       WHERE id = $1 AND version = $3`,
      [id, JSON.stringify(gameState), expectedVersion]
    );
    if (rowCount === 0) {
      invalidatePlayer(id);
      throw new VersionConflictError(id, expectedVersion, '?');
    }
  } else {
    // Non-versioned save (tick loop, migrations, etc.)
    // Guard: never regress the player day (prevents stale tick overwrites during deploy overlap)
    // EXCEPTION: if newDay is 0 or undefined (e.g. registration/admin), skip the guard
    const newDay = gameState.day || 0;
    let query, params;
    if (newDay > 0) {
      query = `UPDATE players SET game_state = $2::jsonb, updated_at = NOW(), version = version + 1
               WHERE id = $1 AND COALESCE((game_state->>'day')::int, 0) < $3`; -- strict: same-day re-saves blocked
      params = [id, JSON.stringify(gameState), newDay];
    } else {
      // No day guard for day-0 states (fresh registrations, admin resets)
      query = `UPDATE players SET game_state = $2::jsonb, updated_at = NOW(), version = version + 1 WHERE id = $1`;
      params = [id, JSON.stringify(gameState)];
    }
    const { rowCount } = await pool.query(query, params);
    if (rowCount === 0 && newDay > 0) {
      console.warn(`[pgStore] savePlayerState skipped for ${id}: DB day > ${newDay} (stale save)`);
    }
  }
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
    "SELECT id, game_state, version FROM players WHERE COALESCE((game_state->>'paused')::boolean, false) = false"
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
  // Always invalidate cache first — even if save fails, next read must hit DB fresh
  // so the day doesn't get re-computed from stale cached state
  invalidateGame();

  // Trim unbounded arrays before serializing to prevent JSON bloat
  const econClean = economy ? JSON.parse(JSON.stringify(economy)) : {};
  if (econClean.exchange?.orderBooks) {
    for (const ob of Object.values(econClean.exchange.orderBooks)) {
      if (ob.bids?.length > 50) ob.bids = ob.bids.slice(-50);
      if (ob.asks?.length > 50) ob.asks = ob.asks.slice(-50);
    }
  }
  if (econClean.exchange?.stocks) {
    for (const s of Object.values(econClean.exchange.stocks)) {
      if (s.priceHistory?.length > 90) s.priceHistory = s.priceHistory.slice(-90);
    }
  }

  try {
    const econStr = JSON.stringify(econClean);
    const shopsStr = JSON.stringify(aiShops || []);
    const liqStr = JSON.stringify(liquidation || []);
    const econKB = Math.round(econStr.length / 1024);
    const shopsKB = Math.round(shopsStr.length / 1024);
    if (econKB > 500) console.warn(`[pgStore] saveGame: economy is ${econKB}KB — consider trimming`);
    await pool.query(
      `UPDATE games SET week = $2, economy = $3::jsonb, ai_shops = $4::jsonb, liquidation = $5::jsonb, updated_at = NOW() WHERE id = $1`,
      [id, day, econStr, shopsStr, liqStr]
    );
    console.log(`[pgStore] saveGame day=${day} ok (economy ${econKB}KB, ai_shops ${shopsKB}KB)`);
  } catch (err) {
    console.error('[pgStore] saveGame FAILED day=' + day + ':', err.message);
    // Rethrow so the tick loop knows the save failed
    throw err;
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

// ── Player Marketplace Listings (Postgres-backed) ──

function _rowToListing(r) {
  const data = parseJson(r.data);
  return { id: r.id, sellerId: r.seller_id, status: r.status, ...data };
}

export async function getPlayerListings(filter = {}) {
  let query = 'SELECT * FROM player_listings WHERE 1=1';
  const params = [];
  if (filter.status) { params.push(filter.status); query += ` AND status = $${params.length}`; }
  if (filter.sellerId) { params.push(filter.sellerId); query += ` AND seller_id = $${params.length}`; }
  query += ' ORDER BY created_at DESC';
  const { rows } = await pool.query(query, params);
  return rows.map(_rowToListing);
}

export async function addPlayerListing(listing) {
  const { id, sellerId, status, ...rest } = listing;
  await pool.query(
    `INSERT INTO player_listings (id, seller_id, status, data) VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [id, sellerId, status || 'active', JSON.stringify(rest)]
  );
  return listing;
}

export async function updatePlayerListing(id, updates) {
  const existing = await getPlayerListingById(id);
  if (!existing) return null;
  const merged = { ...existing, ...updates };
  const { sellerId, status, ...rest } = merged;
  // Remove 'id' from data blob
  delete rest.id;
  await pool.query(
    `UPDATE player_listings SET seller_id = $2, status = $3, data = $4::jsonb, updated_at = NOW() WHERE id = $1`,
    [id, sellerId, status || 'active', JSON.stringify(rest)]
  );
  return merged;
}

export async function getPlayerListingById(id) {
  const { rows } = await pool.query('SELECT * FROM player_listings WHERE id = $1', [id]);
  return rows[0] ? _rowToListing(rows[0]) : null;
}

// ── Direct P2P Trades (Postgres-backed) ──

function _rowToTrade(r) {
  const data = parseJson(r.data);
  return { id: r.id, senderId: r.sender_id, receiverId: r.receiver_id, status: r.status, ...data };
}

export async function getDirectTrades(filter = {}) {
  let query = 'SELECT * FROM direct_trades WHERE 1=1';
  const params = [];
  if (filter.status) { params.push(filter.status); query += ` AND status = $${params.length}`; }
  if (filter.playerId) {
    params.push(filter.playerId);
    query += ` AND (sender_id = $${params.length} OR receiver_id = $${params.length})`;
  }
  query += ' ORDER BY created_at DESC';
  const { rows } = await pool.query(query, params);
  return rows.map(_rowToTrade);
}

export async function addDirectTrade(trade) {
  const { id, senderId, receiverId, status, ...rest } = trade;
  await pool.query(
    `INSERT INTO direct_trades (id, sender_id, receiver_id, status, data) VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [id, senderId, receiverId, status || 'pending', JSON.stringify(rest)]
  );
  return trade;
}

export async function getDirectTradeById(id) {
  const { rows } = await pool.query('SELECT * FROM direct_trades WHERE id = $1', [id]);
  return rows[0] ? _rowToTrade(rows[0]) : null;
}

export async function updateDirectTrade(id, updates) {
  const existing = await getDirectTradeById(id);
  if (!existing) return null;
  const merged = { ...existing, ...updates };
  const { senderId, receiverId, status, ...rest } = merged;
  delete rest.id;
  await pool.query(
    `UPDATE direct_trades SET sender_id = $2, receiver_id = $3, status = $4, data = $5::jsonb, updated_at = NOW() WHERE id = $1`,
    [id, senderId, receiverId, status || 'pending', JSON.stringify(rest)]
  );
  return merged;
}

// ── Tournaments (Postgres-backed) ──

export async function getTournament(id) {
  const { rows } = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
  return rows[0] ? parseJson(rows[0].data) : null;
}

export async function saveTournament(id, data) {
  await pool.query(
    `INSERT INTO tournaments (id, data) VALUES ($1, $2::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = NOW()`,
    [id, JSON.stringify(data)]
  );
}

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

// ── Shop Sale Listings (Postgres-backed) ──

function _rowToShopListing(r) {
  const data = parseJson(r.data);
  return {
    id: r.id, sellerId: r.seller_id, cityId: r.city_id,
    status: r.status, askingPrice: Number(r.asking_price),
    ...data,
  };
}

export async function getShopSaleListings(filter = {}) {
  let query = 'SELECT * FROM shop_sale_listings WHERE 1=1';
  const params = [];
  if (filter.status) { params.push(filter.status); query += ` AND status = $${params.length}`; }
  if (filter.sellerId) { params.push(filter.sellerId); query += ` AND seller_id = $${params.length}`; }
  query += ' ORDER BY created_at DESC';
  const { rows } = await pool.query(query, params);
  return rows.map(_rowToShopListing);
}

export async function addShopSaleListing(listing) {
  const { id, sellerId, cityId, status, askingPrice, ...rest } = listing;
  await pool.query(
    `INSERT INTO shop_sale_listings (id, seller_id, city_id, status, asking_price, data)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) ON CONFLICT (id) DO NOTHING`,
    [id, sellerId, cityId || '', status || 'active', askingPrice || 0, JSON.stringify(rest)]
  );
  return listing;
}

export async function getShopSaleListingById(id) {
  const { rows } = await pool.query('SELECT * FROM shop_sale_listings WHERE id = $1', [id]);
  return rows[0] ? _rowToShopListing(rows[0]) : null;
}

export async function updateShopSaleListing(id, updates) {
  const existing = await getShopSaleListingById(id);
  if (!existing) return null;
  const merged = { ...existing, ...updates };
  const { sellerId, cityId, status, askingPrice, ...rest } = merged;
  delete rest.id;
  await pool.query(
    `UPDATE shop_sale_listings SET seller_id = $2, city_id = $3, status = $4, asking_price = $5, data = $6::jsonb, updated_at = NOW() WHERE id = $1`,
    [id, sellerId, cityId || '', status || 'active', askingPrice || 0, JSON.stringify(rest)]
  );
  return merged;
}

export async function removeShopSaleListing(id) {
  const { rowCount } = await pool.query('DELETE FROM shop_sale_listings WHERE id = $1', [id]);
  return rowCount > 0;
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

// ── Player Contracts (P2P Factory Contracts) ──

export async function getPlayerContract(id) {
  const { rows } = await pool.query('SELECT * FROM player_contracts WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id, buyerId: r.buyer_id, sellerId: r.seller_id, status: r.status,
    terms: parseJson(r.terms), history: parseJson(r.history), deliveries: parseJson(r.deliveries),
    deliveredQty: r.delivered_qty, stagedQty: r.staged_qty, totalRevenue: r.total_revenue,
    createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
  };
}

export async function createPlayerContract(contract) {
  const { id, buyerId, sellerId, status, terms, history } = contract;
  await pool.query(
    `INSERT INTO player_contracts (id, buyer_id, seller_id, status, terms, history)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) ON CONFLICT (id) DO NOTHING`,
    [id, buyerId, sellerId, status || 'proposed', JSON.stringify(terms || {}), JSON.stringify(history || [])]
  );
  return contract;
}

export async function updatePlayerContract(id, updates) {
  const setClauses = [];
  const params = [id];
  let idx = 2;
  if (updates.status !== undefined) { setClauses.push(`status = $${idx++}`); params.push(updates.status); }
  if (updates.terms !== undefined) { setClauses.push(`terms = $${idx++}::jsonb`); params.push(JSON.stringify(updates.terms)); }
  if (updates.history !== undefined) { setClauses.push(`history = $${idx++}::jsonb`); params.push(JSON.stringify(updates.history)); }
  if (updates.deliveries !== undefined) { setClauses.push(`deliveries = $${idx++}::jsonb`); params.push(JSON.stringify(updates.deliveries)); }
  if (updates.deliveredQty !== undefined) { setClauses.push(`delivered_qty = $${idx++}`); params.push(updates.deliveredQty); }
  if (updates.stagedQty !== undefined) { setClauses.push(`staged_qty = $${idx++}`); params.push(updates.stagedQty); }
  if (updates.totalRevenue !== undefined) { setClauses.push(`total_revenue = $${idx++}`); params.push(updates.totalRevenue); }
  if (updates.completedAt !== undefined) { setClauses.push(`completed_at = $${idx++}`); params.push(updates.completedAt); }
  setClauses.push('updated_at = NOW()');
  if (setClauses.length === 1) return; // Only updated_at, nothing to do
  await pool.query(`UPDATE player_contracts SET ${setClauses.join(', ')} WHERE id = $1`, params);
}

export async function getPlayerContracts(filter = {}) {
  let query = 'SELECT * FROM player_contracts WHERE 1=1';
  const params = [];
  if (filter.buyerId) { params.push(filter.buyerId); query += ` AND buyer_id = $${params.length}`; }
  if (filter.sellerId) { params.push(filter.sellerId); query += ` AND seller_id = $${params.length}`; }
  if (filter.status) { params.push(filter.status); query += ` AND status = $${params.length}`; }
  if (filter.playerId) {
    params.push(filter.playerId);
    query += ` AND (buyer_id = $${params.length} OR seller_id = $${params.length})`;
  }
  query += ' ORDER BY created_at DESC';
  const { rows } = await pool.query(query, params);
  return rows.map(r => ({
    id: r.id, buyerId: r.buyer_id, sellerId: r.seller_id, status: r.status,
    terms: parseJson(r.terms), history: parseJson(r.history), deliveries: parseJson(r.deliveries),
    deliveredQty: r.delivered_qty, stagedQty: r.staged_qty, totalRevenue: r.total_revenue,
    createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
  }));
}

// ── Franchise Offerings ──

export async function createFranchiseOffering(offering) {
  await pool.query(
    `INSERT INTO franchise_offerings (id, franchisor_id, brand_name, description, buy_in, royalty_pct, monthly_fee, required_brand, min_rep, max_franchisees, territory_ids, perks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [offering.id, offering.franchisorId, offering.brandName, offering.description,
     offering.buyIn, offering.royaltyPct, offering.monthlyFee, offering.requiredBrand || null,
     offering.minRep || 0, offering.maxFranchisees || 20,
     JSON.stringify(offering.territoryIds || []), JSON.stringify(offering.perks || [])]
  );
}

export async function getFranchiseOfferings(activeOnly = true) {
  const q = activeOnly
    ? `SELECT fo.*, (SELECT COUNT(*) FROM franchise_agreements fa WHERE fa.offering_id = fo.id AND fa.status = 'active') as franchisee_count
       FROM franchise_offerings fo WHERE fo.active = true ORDER BY fo.created_at DESC`
    : `SELECT fo.*, (SELECT COUNT(*) FROM franchise_agreements fa WHERE fa.offering_id = fo.id AND fa.status = 'active') as franchisee_count
       FROM franchise_offerings fo ORDER BY fo.created_at DESC`;
  const { rows } = await pool.query(q);
  return rows.map(r => ({ ...r, territory_ids: parseJson(r.territory_ids), perks: parseJson(r.perks), franchiseeCount: parseInt(r.franchisee_count || 0) }));
}

export async function getFranchiseOfferingById(id) {
  const { rows } = await pool.query('SELECT * FROM franchise_offerings WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const r = rows[0];
  return { ...r, territory_ids: parseJson(r.territory_ids), perks: parseJson(r.perks) };
}

export async function updateFranchiseOffering(id, updates) {
  const sets = [];
  const vals = [];
  let i = 1;
  if (updates.active !== undefined) { sets.push(`active = $${i++}`); vals.push(updates.active); }
  if (updates.buyIn !== undefined) { sets.push(`buy_in = $${i++}`); vals.push(updates.buyIn); }
  if (updates.royaltyPct !== undefined) { sets.push(`royalty_pct = $${i++}`); vals.push(updates.royaltyPct); }
  if (updates.monthlyFee !== undefined) { sets.push(`monthly_fee = $${i++}`); vals.push(updates.monthlyFee); }
  if (updates.description !== undefined) { sets.push(`description = $${i++}`); vals.push(updates.description); }
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  await pool.query(`UPDATE franchise_offerings SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}

// ── Franchise Agreements ──

export async function createFranchiseAgreement(agreement) {
  await pool.query(
    `INSERT INTO franchise_agreements (id, offering_id, franchisor_id, franchisee_id, location_id, brand_name, buy_in_paid, royalty_pct, monthly_fee, required_brand, start_day)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [agreement.id, agreement.offeringId, agreement.franchisorId, agreement.franchiseeId,
     agreement.locationId, agreement.brandName, agreement.buyInPaid, agreement.royaltyPct,
     agreement.monthlyFee, agreement.requiredBrand || null, agreement.startDay || 0]
  );
}

export async function getFranchiseAgreements(filter = {}) {
  let q = 'SELECT * FROM franchise_agreements WHERE 1=1';
  const vals = [];
  let i = 1;
  if (filter.franchiseeId) { q += ` AND franchisee_id = $${i++}`; vals.push(filter.franchiseeId); }
  if (filter.franchisorId) { q += ` AND franchisor_id = $${i++}`; vals.push(filter.franchisorId); }
  if (filter.status) { q += ` AND status = $${i++}`; vals.push(filter.status); }
  q += ' ORDER BY created_at DESC';
  const { rows } = await pool.query(q, vals);
  return rows;
}

export async function getFranchiseAgreementById(id) {
  const { rows } = await pool.query('SELECT * FROM franchise_agreements WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function updateFranchiseAgreement(id, updates) {
  const sets = [];
  const vals = [];
  let i = 1;
  if (updates.status !== undefined) { sets.push(`status = $${i++}`); vals.push(updates.status); }
  if (updates.missedPayments !== undefined) { sets.push(`missed_payments = $${i++}`); vals.push(updates.missedPayments); }
  if (updates.totalRoyaltiesPaid !== undefined) { sets.push(`total_royalties_paid = $${i++}`); vals.push(updates.totalRoyaltiesPaid); }
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  await pool.query(`UPDATE franchise_agreements SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}
