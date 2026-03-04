// ═══════════════════════════════════════════════════════════════
// SUPPLIER CONTRACT TEMPLATES — fixed-price contracts for Tier 3+
// ═══════════════════════════════════════════════════════════════

// Contract types offered by suppliers based on relationship tier
export const CONTRACT_TYPES = {
  // Returns/overstock: below market, bulk, short window, may include damaged
  overstock: {
    id: 'overstock',
    label: 'Overstock Deal',
    description: 'Discounted bulk lot — take them all within the window',
    discountRange: [0.15, 0.30],  // 15-30% below current market
    qtyRange: [500, 5000],
    durationDays: 30,
    deliveryMode: 'bulk',         // All at once on acceptance
    penaltyForDefault: 0.10,
    minTier: 3,
  },
  // Volume lock: lock in a price over months, daily delivery
  volumeLock: {
    id: 'volumeLock',
    label: 'Volume Lock',
    description: 'Lock in today\'s price for months — delivered daily',
    discountRange: [0.02, 0.08],  // Slight discount for commitment
    qtyRange: [2000, 10000],
    durationDays: 180,
    deliveryMode: 'daily',
    dailyAllotmentPct: 0.01,      // ~1% of total per day
    penaltyForDefault: 0.15,
    minTier: 3,
  },
  // Seasonal pre-buy: order ahead of season for a discount
  seasonalPreBuy: {
    id: 'seasonalPreBuy',
    label: 'Seasonal Pre-Buy',
    description: 'Pre-order before the season rush for a discount',
    discountRange: [0.10, 0.20],  // 10-20% off
    qtyRange: [1000, 3000],
    durationDays: 90,
    deliveryMode: 'scheduled',    // Delivery starts on a specific day
    deliveryLeadDays: 30,         // Delivery starts 30 days after signing
    penaltyForDefault: 0.12,
    minTier: 4,
  },
};

// How many contract offers a player gets per month by tier
export const OFFERS_PER_MONTH = {
  3: 1,   // Key Account: 1 offer/month
  4: 2,   // Strategic Partner: 2/month
  5: 3,   // Elite Partner: 3/month
};

// Tire types that can appear in contracts (no used tires)
export const CONTRACTABLE_TIRES = [
  'allSeason', 'performance', 'winter', 'lightTruck', 'commercial',
  'evTire', 'runFlat', 'luxuryTouring', 'premiumAllWeather',
  'tractor', 'implement', 'atv',
];

// Seasonal pre-buy: which tires are seasonal and when offers appear
export const SEASONAL_TIRES = {
  winter: { tires: ['winter'], offerSeasons: ['Summer', 'Fall'] },
  ag: { tires: ['tractor', 'implement', 'atv'], offerSeasons: ['Winter', 'Spring'] },
};
