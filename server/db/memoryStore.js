const players = new Map();
const games = new Map();
const leaderboard = new Map();
const playerListings = [];
const directTrades = [];
const tournaments = new Map();
const chatMessages = [];
const shopSaleListings = [];

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

    async saveGame(id, day, economy, aiShops, liquidation) {
      const existing = games.get(id);
      if (existing) {
        existing.day = day;
        existing.economy = economy;
        existing.ai_shops = aiShops;
        existing.liquidation = liquidation;
        existing.updated_at = new Date().toISOString();
      } else {
        games.set(id, {
          id,
          day,
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

    async upsertLeaderboard(playerId, name, wealth, reputation, locations, day, isPremium) {
      leaderboard.set(playerId, {
        player_id: playerId,
        name,
        wealth,
        reputation,
        locations,
        day,
        isPremium: !!isPremium,
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

    // Direct P2P trades (no escrow)
    async getDirectTrades(filter = {}) {
      let results = [...directTrades];
      if (filter.status) results = results.filter(t => t.status === filter.status);
      if (filter.playerId) results = results.filter(t => t.senderId === filter.playerId || t.receiverId === filter.playerId);
      return results;
    },

    async addDirectTrade(trade) {
      directTrades.push(trade);
      return trade;
    },

    async getDirectTradeById(id) {
      return directTrades.find(t => t.id === id) || null;
    },

    async updateDirectTrade(id, updates) {
      const idx = directTrades.findIndex(t => t.id === id);
      if (idx === -1) return null;
      Object.assign(directTrades[idx], updates);
      return directTrades[idx];
    },

    // Tournaments
    async getTournament(id) { return tournaments.get(id) || null; },
    async saveTournament(id, data) { tournaments.set(id, data); },

    // Chat messages
    async getChatMessages(limit = 50) { return chatMessages.slice(-limit); },
    async addChatMessage(msg) {
      chatMessages.push(msg);
      if (chatMessages.length > 500) chatMessages.splice(0, chatMessages.length - 500);
      return msg;
    },

    // Shop sale listings (shared marketplace)
    async getShopSaleListings(filter = {}) {
      let results = [...shopSaleListings];
      if (filter.status) results = results.filter(l => l.status === filter.status);
      if (filter.sellerId) results = results.filter(l => l.sellerId === filter.sellerId);
      return results;
    },

    async addShopSaleListing(listing) {
      shopSaleListings.push(listing);
      return listing;
    },

    async getShopSaleListingById(id) {
      return shopSaleListings.find(l => l.id === id) || null;
    },

    async updateShopSaleListing(id, updates) {
      const idx = shopSaleListings.findIndex(l => l.id === id);
      if (idx === -1) return null;
      Object.assign(shopSaleListings[idx], updates);
      return shopSaleListings[idx];
    },

    async removeShopSaleListing(id) {
      const idx = shopSaleListings.findIndex(l => l.id === id);
      if (idx === -1) return false;
      shopSaleListings.splice(idx, 1);
      return true;
    },

    // Remove a player (used for AI phase-out)
    async removePlayer(id) {
      const existed = players.has(id);
      players.delete(id);
      leaderboard.delete(id);
      return existed;
    },
  };
}
