import { pool } from './pool.js';

// ── In-memory stores for features without dedicated tables ──
const playerListings = [];
const directTrades = [];
const tournaments = new Map();
const chatMessages = [];
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
  const { rows } = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
  const row = rows[0] || null;
  if (row) row.game_state = parseJson(row.game_state);
  return row;
}

export async function createPlayer(id, name, gameState) {
  const { rows } = await pool.query(
    `INSERT INTO players (id, name, game_state) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET name = $2, game_state = $3::jsonb, updated_at = NOW()
     RETURNING *`,
    [id, name, JSON.stringify(gameState)]
  );
  return rows[0];
}

export async function savePlayerState(id, gameState) {
  // Upsert: create if not exists, update if exists
  await pool.query(
    `INSERT INTO players (id, name, game_state) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET game_state = $3::jsonb, updated_at = NOW()`,
    [id, gameState?.name || gameState?.companyName || 'Player', JSON.stringify(gameState)]
  );
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
  return rowCount > 0;
}

// ── Games ──

export async function getGame(id = 'default') {
  const { rows } = await pool.query('SELECT * FROM games WHERE id = $1', [id]);
  const row = rows[0] || null;
  if (row) {
    row.economy = parseJson(row.economy);
    row.ai_shops = parseJson(row.ai_shops);
    row.liquidation = parseJson(row.liquidation);
    if (!Array.isArray(row.ai_shops)) row.ai_shops = [];
    if (!Array.isArray(row.liquidation)) row.liquidation = [];
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
  } catch (err) {
    console.error('[pgStore] saveGame error:', err.message);
  }
}

// ── Leaderboard ──

export async function getLeaderboard(limit = 20) {
  const { rows } = await pool.query(
    'SELECT * FROM leaderboard ORDER BY wealth DESC LIMIT $1',
    [limit]
  );
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

// ── Chat Messages (in-memory) ──

export async function getChatMessages(limit = 50) { return chatMessages.slice(-limit); }
export async function addChatMessage(msg) {
  chatMessages.push(msg);
  if (chatMessages.length > 500) chatMessages.splice(0, chatMessages.length - 500);
  return msg;
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
