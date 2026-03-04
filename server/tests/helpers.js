import { init } from '../engine/init.js';

/**
 * Create a mock game state with optional overrides.
 */
export function mockState(overrides = {}) {
  const g = init('TestPlayer', 1);
  Object.assign(g, overrides);
  g.log = g.log || [];
  return g;
}

/**
 * Create a mock context with a fail spy.
 */
export function mockCtx(overrides = {}) {
  const ctx = {
    failCalled: false,
    failMsg: null,
    playerId: 'test-player-1',
    NODE_ENV: 'test',
    fail(msg) {
      ctx.failCalled = true;
      ctx.failMsg = msg;
    },
    getGame: async () => ({ economy: {} }),
    getPlayer: async () => null,
    savePlayerState: async () => {},
    saveGame: async () => {},
    addShopSaleListing: async () => {},
    removeShopSaleListing: async () => {},
    getShopSaleListings: async () => [],
    trackEvent: () => {},
    ...overrides,
  };
  return ctx;
}
