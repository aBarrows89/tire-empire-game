const players = new Map();
const games = new Map();
const leaderboard = new Map();

export function createMemoryStore() {
  return {
    async getPlayer(id) {
      return players.get(id) || null;
    },

    async createPlayer(id, name, gameState) {
      const row = {
        id,
        name,
        game_state: gameState,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      players.set(id, row);
      return row;
    },

    async savePlayerState(id, gameState) {
      const existing = players.get(id);
      if (existing) {
        existing.game_state = gameState;
        existing.updated_at = new Date().toISOString();
      }
    },

    async getAllActivePlayers() {
      const results = [];
      for (const p of players.values()) {
        if (!p.game_state?.paused) {
          results.push({ id: p.id, game_state: p.game_state });
        }
      }
      return results;
    },

    async getGame(id = 'default') {
      return games.get(id) || null;
    },

    async saveGame(id, week, economy, aiShops, liquidation) {
      const existing = games.get(id);
      if (existing) {
        existing.week = week;
        existing.economy = economy;
        existing.ai_shops = aiShops;
        existing.liquidation = liquidation;
        existing.updated_at = new Date().toISOString();
      } else {
        games.set(id, {
          id,
          week,
          tick_ms: 60000,
          economy,
          ai_shops: aiShops,
          liquidation,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    },

    async getLeaderboard(limit = 20) {
      const rows = [...leaderboard.values()];
      rows.sort((a, b) => b.wealth - a.wealth);
      return rows.slice(0, limit);
    },

    async upsertLeaderboard(playerId, name, wealth, reputation, locations, week) {
      leaderboard.set(playerId, {
        player_id: playerId,
        name,
        wealth,
        reputation,
        locations,
        week,
        updated_at: new Date().toISOString(),
      });
    },
  };
}
