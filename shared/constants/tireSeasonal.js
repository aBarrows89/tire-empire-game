/**
 * Per-tire-type seasonal demand multipliers.
 * Applied on top of the base seasonal demand modifier.
 */
const TIRE_SEASONAL = {
  // Winter tires: huge demand in winter, low in summer
  winter: { Spring: 0.8, Summer: 0.5, Fall: 1.2, Winter: 2.0 },

  // All-Season: slight boost in transitional seasons
  allSeason: { Spring: 1.3, Summer: 1.0, Fall: 1.3, Winter: 0.9 },

  // Performance: summer driving season peak
  performance: { Spring: 1.1, Summer: 1.5, Fall: 0.9, Winter: 0.7 },

  // Used tires: people replace before winter
  used_junk: { Spring: 1.0, Summer: 1.0, Fall: 1.2, Winter: 1.0 },
  used_poor: { Spring: 1.0, Summer: 1.0, Fall: 1.2, Winter: 1.0 },
  used_good: { Spring: 1.0, Summer: 1.0, Fall: 1.2, Winter: 1.0 },
  used_premium: { Spring: 1.0, Summer: 1.0, Fall: 1.2, Winter: 1.0 },

  // AG tires: planting season (spring) and harvest (fall)
  atv: { Spring: 1.4, Summer: 1.0, Fall: 1.3, Winter: 0.7 },
  implement: { Spring: 1.4, Summer: 1.0, Fall: 1.3, Winter: 0.7 },
  tractor: { Spring: 1.4, Summer: 1.0, Fall: 1.3, Winter: 0.7 },

  // Light truck: steady, slight winter boost
  lightTruck: { Spring: 1.0, Summer: 1.0, Fall: 1.1, Winter: 1.1 },

  // Commercial: year-round, minor seasonal variation
  commercial: { Spring: 1.0, Summer: 1.0, Fall: 1.0, Winter: 1.0 },

  // EV tires: growing market, slight summer bump
  evTire: { Spring: 1.1, Summer: 1.2, Fall: 1.0, Winter: 0.9 },

  // Run-flat: steady premium demand
  runFlat: { Spring: 1.0, Summer: 1.1, Fall: 1.0, Winter: 0.9 },
};

/**
 * Get the seasonal demand multiplier for a tire type in a given season.
 * @param {string} tireKey — key from TIRES (e.g. 'winter', 'allSeason')
 * @param {string} season — 'Spring', 'Summer', 'Fall', or 'Winter'
 * @returns {number} multiplier (default 1.0)
 */
export function getTireSeasonMult(tireKey, season) {
  const entry = TIRE_SEASONAL[tireKey];
  if (!entry) return 1.0;
  return entry[season] || 1.0;
}

export { TIRE_SEASONAL };
