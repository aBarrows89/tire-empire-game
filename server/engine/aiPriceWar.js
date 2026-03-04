import { TIRES } from '../../shared/constants/tires.js';
import { CITIES } from '../../shared/constants/cities.js';

/**
 * Update AI shop prices in response to player pricing and market conditions.
 * Called every 3 days from tickLoop.
 *
 * 6c: Competitor Price Wars — AI shops gradually react to undercutting,
 * can't-compete shops eventually close, inflation/deflation affects base prices.
 *
 * @param {Array} aiShops - AI shop objects
 * @param {Object} playerPriceAvg - Average player prices per tire type
 * @param {Object} marketPrices - unused (kept for compat)
 * @param {Object} ctx - Context: inflationIndex, commodities, players
 */
export function updateAIPrices(aiShops, playerPriceAvg, marketPrices, ctx = {}) {
  const inflMult = ctx.inflationIndex || 1.0;
  const players = ctx.players || [];

  // Build per-city player price map for localized price wars
  const cityPlayerPrices = {};
  for (const p of players) {
    const gs = p.game_state;
    if (!gs || !gs.prices || !gs.locations) continue;
    for (const loc of gs.locations) {
      if (!loc.cityId) continue;
      if (!cityPlayerPrices[loc.cityId]) cityPlayerPrices[loc.cityId] = {};
      for (const [k, price] of Object.entries(gs.prices)) {
        if (!cityPlayerPrices[loc.cityId][k]) cityPlayerPrices[loc.cityId][k] = [];
        cityPlayerPrices[loc.cityId][k].push(price);
      }
    }
  }

  // Track shops that are getting squeezed out
  const shopsToClose = [];

  for (const shop of aiShops) {
    if (!shop.prices) continue;

    // Track how many tires this shop is being undercut on
    let undercutCount = 0;
    let totalTires = 0;

    // Use city-local player prices if available, fall back to global average
    const localPrices = shop.cityId ? cityPlayerPrices[shop.cityId] : null;

    for (const [k, t] of Object.entries(TIRES)) {
      if (!shop.prices[k]) continue;
      totalTires++;

      // Get the effective player price in this city
      let playerPrice;
      if (localPrices && localPrices[k] && localPrices[k].length > 0) {
        // Use lowest local player price (most aggressive competitor)
        playerPrice = Math.min(...localPrices[k]);
      } else {
        playerPrice = playerPriceAvg[k] || t.def;
      }

      const aiPrice = shop.prices[k];
      // Inflation adjusts the "natural" default price
      const inflatedDef = Math.round(t.def * inflMult);

      // Player significantly undercutting (>10% below AI): AI responds over 5-10 days
      // At 3-day intervals, each step is ~5-8% price drop
      if (playerPrice < aiPrice * 0.90) {
        undercutCount++;
        const gap = (aiPrice - playerPrice) / aiPrice; // 0.10 to 0.50+
        // Larger gaps = faster response (up to 10% per step)
        const dropRate = Math.min(0.10, 0.03 + gap * 0.12);
        const floor = Math.round(t.def * 0.65); // AI won't go below 65% of default
        shop.prices[k] = Math.max(floor, Math.round(aiPrice * (1 - dropRate)));
      } else if (playerPrice < aiPrice * 0.95) {
        // Mild undercutting: slow response (2% per step)
        undercutCount++;
        const floor = Math.round(t.def * 0.70);
        shop.prices[k] = Math.max(floor, Math.round(aiPrice * 0.98));
      } else if (aiPrice < inflatedDef * 0.80) {
        // AI price is way below natural: slowly recover (when no pressure)
        shop.prices[k] = Math.min(inflatedDef, Math.round(aiPrice * 1.04));
      } else if (playerPrice > aiPrice * 1.15) {
        // Players priced high: AI raises toward inflated default
        shop.prices[k] = Math.min(Math.round(inflatedDef * 1.10), Math.round(aiPrice * 1.03));
      }

      // Inflation drift: slowly adjust all prices toward inflation-adjusted default
      if (Math.abs(inflMult - 1.0) > 0.02) {
        const drift = (inflatedDef - shop.prices[k]) * 0.02; // 2% per step toward inflation target
        shop.prices[k] = Math.round(shop.prices[k] + drift);
      }

      // Hard clamp to tire bounds
      shop.prices[k] = Math.max(t.lo || 1, Math.min(t.hi || 999, shop.prices[k]));
    }

    // Track shops being squeezed: if >60% of tires are undercut and shop wealth is low
    if (totalTires > 0 && undercutCount / totalTires > 0.6) {
      shop._undercutDays = (shop._undercutDays || 0) + 3;
      // After 30+ days of being squeezed and low wealth, shop closes
      if (shop._undercutDays >= 30 && (shop.wealth || 0) < 50000) {
        shopsToClose.push(shop.id);
      }
    } else {
      // Pressure relieved — reset counter (slowly)
      shop._undercutDays = Math.max(0, (shop._undercutDays || 0) - 1);
    }
  }

  // Remove shops that went out of business (max 2 per update to keep it gradual)
  if (shopsToClose.length > 0) {
    const toRemove = new Set(shopsToClose.slice(0, 2));
    const beforeCount = aiShops.length;
    const remaining = aiShops.filter(s => !toRemove.has(s.id));
    // Only close if we'd keep at least 20 shops
    if (remaining.length >= 20) {
      aiShops.length = 0;
      aiShops.push(...remaining);
    }
  }

  return aiShops;
}
