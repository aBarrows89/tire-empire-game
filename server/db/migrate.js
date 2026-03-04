/**
 * One-time migration: populate player_financials and player_stats
 * from existing game_state JSONB blobs.
 *
 * Usage: node server/db/migrate.js
 *
 * Safe to run multiple times — uses UPSERT.
 */
import { pool } from './pool.js';

async function migrate() {
  console.log('[migrate] Starting hot table migration...');

  // Ensure tables exist
  await pool.query(`
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
  `);

  // Read all players
  const { rows } = await pool.query('SELECT id, game_state FROM players');
  console.log(`[migrate] Found ${rows.length} players to migrate`);

  let financialsCount = 0;
  let statsCount = 0;

  for (const row of rows) {
    const g = typeof row.game_state === 'string' ? JSON.parse(row.game_state) : row.game_state;

    // Financials
    try {
      await pool.query(
        `INSERT INTO player_financials (player_id, cash, bank_balance, tire_coins, is_premium, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (player_id) DO UPDATE SET
           cash = $2, bank_balance = $3, tire_coins = $4, is_premium = $5, updated_at = NOW()`,
        [row.id, g.cash || 0, g.bankBalance || 0, g.tireCoins || 0, g.isPremium || false]
      );
      financialsCount++;
    } catch (err) {
      console.error(`[migrate] Financials error for ${row.id}:`, err.message);
    }

    // Stats
    try {
      await pool.query(
        `INSERT INTO player_stats (player_id, reputation, day, total_rev, day_rev, day_profit, day_sold, total_sold, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (player_id) DO UPDATE SET
           reputation = $2, day = $3, total_rev = $4, day_rev = $5, day_profit = $6, day_sold = $7, total_sold = $8, updated_at = NOW()`,
        [row.id, g.reputation || 0, g.day || 1, g.totalRev || 0, g.dayRev || 0, g.dayProfit || 0, g.daySold || 0, g.totalSold || 0]
      );
      statsCount++;
    } catch (err) {
      console.error(`[migrate] Stats error for ${row.id}:`, err.message);
    }
  }

  console.log(`[migrate] Done! Migrated ${financialsCount} financials, ${statsCount} stats`);
  await pool.end();
  process.exit(0);
}

migrate().catch(err => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
