import { TIRES } from '../../shared/constants/tires.js';

/**
 * Update AI shop prices in response to player pricing.
 * Called weekly from tickLoop.
 */
export function updateAIPrices(aiShops, playerPriceAvg, marketPrices) {
  for (const shop of aiShops) {
    if (!shop.prices) continue;
    for (const [k, t] of Object.entries(TIRES)) {
      if (!shop.prices[k]) continue;
      const playerPrice = playerPriceAvg[k] || t.def;
      const aiPrice = shop.prices[k];
      // Player significantly undercutting: AI gradually lowers
      if (playerPrice < aiPrice * 0.85) {
        const floor = Math.round(t.def * 0.75);
        shop.prices[k] = Math.max(floor, Math.round(aiPrice * 0.95));
      } else if (playerPrice > aiPrice * 1.2) {
        // Player left, AI raises back toward default
        shop.prices[k] = Math.min(Math.round(t.def * 1.1), Math.round(aiPrice * 1.03));
      }
    }
  }
  return aiShops;
}
