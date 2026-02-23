import { pool } from './pool.js';

export async function getPlayer(id) {
  const { rows } = await pool.query('SELECT * FROM players WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function createPlayer(id, name, gameState) {
  const { rows } = await pool.query(
    'INSERT INTO players (id, name, game_state) VALUES ($1, $2, $3) RETURNING *',
    [id, name, gameState]
  );
  return rows[0];
}

export async function savePlayerState(id, gameState) {
  await pool.query(
    'UPDATE players SET game_state = $2, updated_at = NOW() WHERE id = $1',
    [id, gameState]
  );
}

export async function getAllActivePlayers() {
  const { rows } = await pool.query(
    "SELECT id, game_state FROM players WHERE (game_state->>'paused')::boolean IS NOT TRUE"
  );
  return rows;
}

export async function getGame(id = 'default') {
  const { rows } = await pool.query('SELECT * FROM games WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function saveGame(id, week, economy, aiShops, liquidation) {
  await pool.query(
    'UPDATE games SET week = $2, economy = $3, ai_shops = $4, liquidation = $5, updated_at = NOW() WHERE id = $1',
    [id, week, economy, aiShops, liquidation]
  );
}

export async function getLeaderboard(limit = 20) {
  const { rows } = await pool.query(
    'SELECT * FROM leaderboard ORDER BY wealth DESC LIMIT $1',
    [limit]
  );
  return rows;
}

export async function upsertLeaderboard(playerId, name, wealth, reputation, locations, week) {
  await pool.query(
    `INSERT INTO leaderboard (player_id, name, wealth, reputation, locations, week, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (player_id) DO UPDATE SET
       name = $2, wealth = $3, reputation = $4, locations = $5, week = $6, updated_at = NOW()`,
    [playerId, name, wealth, reputation, locations, week]
  );
}
