-- Tire Empire database schema
-- Run: psql -d tire_empire -f schema.sql

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
  player_id     TEXT PRIMARY KEY REFERENCES players(id),
  name          TEXT NOT NULL,
  wealth        BIGINT NOT NULL DEFAULT 0,
  reputation    REAL NOT NULL DEFAULT 0,
  locations     INTEGER NOT NULL DEFAULT 0,
  week          INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_wealth ON leaderboard(wealth DESC);
CREATE INDEX IF NOT EXISTS idx_players_updated ON players(updated_at);

-- Insert default game row
INSERT INTO games (id) VALUES ('default') ON CONFLICT DO NOTHING;
