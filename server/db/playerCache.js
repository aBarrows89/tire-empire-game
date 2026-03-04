/**
 * Server-side LRU cache for player states, game state, and leaderboard.
 * Write-through: saves immediately update cache.
 * TTL-based expiry prevents stale reads.
 */

const MAX_PLAYER_ENTRIES = 200;
const PLAYER_TTL_MS = 30_000; // 30 seconds
const GAME_TTL_MS = 60_000;   // 1 minute (invalidated on tick anyway)
const LEADERBOARD_TTL_MS = 60_000; // 60 seconds

// ── Player cache ──
const _playerCache = new Map(); // id → { data, ts }
const _playerOrder = [];        // LRU order (most recent at end)

export function getCachedPlayer(id) {
  const entry = _playerCache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.ts > PLAYER_TTL_MS) {
    _playerCache.delete(id);
    const idx = _playerOrder.indexOf(id);
    if (idx !== -1) _playerOrder.splice(idx, 1);
    return null;
  }
  // Move to end (most recently used)
  const idx = _playerOrder.indexOf(id);
  if (idx !== -1) _playerOrder.splice(idx, 1);
  _playerOrder.push(id);
  return entry.data;
}

export function setCachedPlayer(id, data) {
  _playerCache.set(id, { data, ts: Date.now() });
  const idx = _playerOrder.indexOf(id);
  if (idx !== -1) _playerOrder.splice(idx, 1);
  _playerOrder.push(id);
  // Evict oldest if over capacity
  while (_playerOrder.length > MAX_PLAYER_ENTRIES) {
    const oldest = _playerOrder.shift();
    _playerCache.delete(oldest);
  }
}

export function invalidatePlayer(id) {
  _playerCache.delete(id);
  const idx = _playerOrder.indexOf(id);
  if (idx !== -1) _playerOrder.splice(idx, 1);
}

export function invalidateAllPlayers() {
  _playerCache.clear();
  _playerOrder.length = 0;
}

// ── Game cache ──
let _gameCache = null; // { data, ts }

export function getCachedGame() {
  if (!_gameCache) return null;
  if (Date.now() - _gameCache.ts > GAME_TTL_MS) {
    _gameCache = null;
    return null;
  }
  return _gameCache.data;
}

export function setCachedGame(data) {
  _gameCache = { data, ts: Date.now() };
}

export function invalidateGame() {
  _gameCache = null;
}

// ── Leaderboard cache ──
let _lbCache = null; // { data, ts }

export function getCachedLeaderboard() {
  if (!_lbCache) return null;
  if (Date.now() - _lbCache.ts > LEADERBOARD_TTL_MS) {
    _lbCache = null;
    return null;
  }
  return _lbCache.data;
}

export function setCachedLeaderboard(data) {
  _lbCache = { data, ts: Date.now() };
}

export function invalidateLeaderboard() {
  _lbCache = null;
}

// ── Stats ──
export function getCacheStats() {
  return {
    playerEntries: _playerCache.size,
    playerMaxEntries: MAX_PLAYER_ENTRIES,
    gameHit: !!_gameCache,
    leaderboardHit: !!_lbCache,
  };
}
