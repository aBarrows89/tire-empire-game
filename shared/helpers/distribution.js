import { DIST_MIN_REP, DIST_MIN_LOCS, DIST_MIN_STORAGE, DIST_UNLOCK_COST } from '../constants/distribution.js';

export function canUnlockDist(g) {
  return g.reputation >= DIST_MIN_REP &&
    g.locations.length >= DIST_MIN_LOCS &&
    g.storage.some(s => s.type === DIST_MIN_STORAGE) &&
    g.hasWholesale &&
    g.cash >= DIST_UNLOCK_COST;
}
