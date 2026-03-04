// ═══════════════════════════════════════════════════════════════
// BOT SCENARIOS — pre-built economy manipulation scenarios
// ═══════════════════════════════════════════════════════════════

/**
 * Pre-built scenarios that admins can trigger to create specific market conditions.
 * Each scenario operates on the current set of active bots.
 */
export const BOT_SCENARIOS = {
  marketCrash: {
    label: 'Market Crash',
    description: 'All bots dump inventory and undercut prices, simulating a market panic.',
    async execute(bots, params) {
      let affected = 0;
      for (const bot of bots) {
        const g = bot.game_state;
        if (!g._botConfig) continue;
        // Queue directive to dump inventory
        g._botConfig.overrides = g._botConfig.overrides || {};
        g._botConfig.overrides.directives = g._botConfig.overrides.directives || [];
        g._botConfig.overrides.directives.push({ type: 'dump_inventory', params: { discountPct: params?.discountPct || 50 } });
        g._botConfig.overrides.pricingMode = 'undercut';
        affected++;
      }
      return { affected, message: `${affected} bots entering panic sell mode` };
    },
  },

  bullRun: {
    label: 'Bull Run',
    description: 'All bots raise prices and invest heavily, simulating an economic boom.',
    async execute(bots, params) {
      let affected = 0;
      for (const bot of bots) {
        const g = bot.game_state;
        if (!g._botConfig) continue;
        g._botConfig.overrides = g._botConfig.overrides || {};
        g._botConfig.overrides.pricingMode = 'premium';
        g._botConfig.overrides.directives = g._botConfig.overrides.directives || [];
        g._botConfig.overrides.directives.push({ type: 'buy_spree', params: { budget: params?.budget || 100000 } });
        affected++;
      }
      return { affected, message: `${affected} bots entering bull mode` };
    },
  },

  expansionWave: {
    label: 'Expansion Wave',
    description: 'Bots aggressively open new shops across all cities.',
    async execute(bots, params) {
      let affected = 0;
      const shopCount = params?.shopsPerBot || 2;
      for (const bot of bots) {
        const g = bot.game_state;
        if (!g._botConfig) continue;
        g._botConfig.overrides = g._botConfig.overrides || {};
        g._botConfig.overrides.directives = g._botConfig.overrides.directives || [];
        for (let i = 0; i < shopCount; i++) {
          g._botConfig.overrides.directives.push({ type: 'add_shop' });
        }
        affected++;
      }
      return { affected, message: `${affected} bots opening ${shopCount} shops each` };
    },
  },

  botCulling: {
    label: 'Bot Culling',
    description: 'Weakest bots go bankrupt and are removed from the game.',
    async execute(bots, params) {
      const percentage = params?.percentage || 30;
      const sorted = [...bots]
        .filter(b => b.game_state._botConfig)
        .sort((a, b) => (a.game_state.cash || 0) - (b.game_state.cash || 0));
      const cullCount = Math.ceil(sorted.length * percentage / 100);
      const toCull = sorted.slice(0, cullCount);

      for (const bot of toCull) {
        const g = bot.game_state;
        g._botConfig.overrides = g._botConfig.overrides || {};
        g._botConfig.overrides.directives = g._botConfig.overrides.directives || [];
        g._botConfig.overrides.directives.push({ type: 'go_bankrupt' });
      }
      return { affected: toCull.length, message: `${toCull.length} weakest bots marked for bankruptcy` };
    },
  },

  shuffle: {
    label: 'Personality Shuffle',
    description: 'Randomly reassign all bot personalities and intensities.',
    async execute(bots, params) {
      const personalities = ['conservative', 'aggressive', 'balanced', 'adventurous', 'opportunist'];
      let affected = 0;
      for (const bot of bots) {
        const g = bot.game_state;
        if (!g._botConfig) continue;
        g._botConfig.personality = personalities[Math.floor(Math.random() * personalities.length)];
        g._botConfig.intensity = Math.floor(Math.random() * 10) + 1;
        affected++;
      }
      return { affected, message: `${affected} bots reshuffled` };
    },
  },

  targetDethrone: {
    label: 'Dethrone Target',
    description: 'All bots focus on undercutting a specific player\'s prices and territory.',
    async execute(bots, params) {
      if (!params?.targetPlayerId) return { affected: 0, message: 'No target specified' };
      let affected = 0;
      for (const bot of bots) {
        const g = bot.game_state;
        if (!g._botConfig) continue;
        g._botConfig.overrides = g._botConfig.overrides || {};
        g._botConfig.overrides.targetPlayerId = params.targetPlayerId;
        g._botConfig.overrides.pricingMode = 'undercut';
        affected++;
      }
      return { affected, message: `${affected} bots targeting player ${params.targetPlayerId}` };
    },
  },
};
