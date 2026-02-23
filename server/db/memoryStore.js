const players = new Map();
const games = new Map();
const leaderboard = new Map();
const playerListings = [];

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

    async isCompanyNameTaken(name, excludeId = null) {
      const lower = name.toLowerCase().trim();
      for (const p of players.values()) {
        if (excludeId && p.id === excludeId) continue;
        const cn = p.game_state?.companyName;
        if (cn && cn.toLowerCase().trim() === lower) return true;
      }
      return false;
    },

    async getAllActivePlayers() {
      const results = [];
      for (const p of players.values()) {
        results.push({ id: p.id, game_state: p.game_state });
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

    // Player marketplace listings
    async getPlayerListings(filter = {}) {
      let results = [...playerListings];
      if (filter.status) results = results.filter(l => l.status === filter.status);
      if (filter.sellerId) results = results.filter(l => l.sellerId === filter.sellerId);
      return results;
    },

    async addPlayerListing(listing) {
      playerListings.push(listing);
      return listing;
    },

    async updatePlayerListing(id, updates) {
      const idx = playerListings.findIndex(l => l.id === id);
      if (idx === -1) return null;
      Object.assign(playerListings[idx], updates);
      return playerListings[idx];
    },

    async getPlayerListingById(id) {
      return playerListings.find(l => l.id === id) || null;
    },
  };
}
