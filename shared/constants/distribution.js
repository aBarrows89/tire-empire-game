export const DIST_UNLOCK_COST = 500000;
export const DIST_MONTHLY = 12000;
export const DIST_MIN_REP = 50;
export const DIST_MIN_LOCS = 5;
export const DIST_MIN_STORAGE = "distCenter";

// ── US Regions for distribution centers ──
// Each region covers a set of states. Having a DC in a region gives
// faster delivery (ecom/wholesale) and lower freight costs for shops in that region.
export const REGIONS = {
  northeast: { n: "Northeast", states: ["CT","DE","DC","MA","MD","ME","NH","NJ","NY","PA","RI","VT"] },
  southeast: { n: "Southeast", states: ["AL","FL","GA","KY","LA","MS","NC","SC","TN","VA","WV"] },
  midwest:   { n: "Midwest",   states: ["IA","IL","IN","KS","MI","MN","MO","ND","NE","OH","SD","WI"] },
  southwest: { n: "Southwest", states: ["AR","AZ","NM","OK","TX"] },
  west:      { n: "West",      states: ["CA","CO","HI","ID","MT","NV","OR","UT","WA","WY"] },
  alaska:    { n: "Alaska",    states: ["AK"] },
};

// Per-DC costs and bonuses
export const DC_OPEN_COST = 250000;       // Cost to open an additional DC (first is included in unlock)
export const DC_MONTHLY = 8000;           // Monthly operating cost per DC
export const DC_CAPACITY = 6000;          // Extra warehouse capacity per DC
export const DC_MAX = 6;                  // Max DCs (one per region)
export const DC_DELIVERY_BONUS = 0.25;    // +25% ecom/wholesale delivery speed in covered region
export const DC_FREIGHT_DISCOUNT = 0.15;  // -15% freight cost for shops in covered region

/**
 * Get the region ID for a given state abbreviation.
 * @param {string} state - Two-letter state code
 * @returns {string|null} Region ID or null
 */
export function getRegionForState(state) {
  for (const [regionId, region] of Object.entries(REGIONS)) {
    if (region.states.includes(state)) return regionId;
  }
  return null;
}

/**
 * Get set of region IDs covered by a player's distribution centers.
 * @param {object} g - Player game state
 * @returns {Set<string>} Set of covered region IDs
 */
export function getCoveredRegions(g) {
  return new Set((g.distCenters || []).map(dc => dc.regionId));
}
