import { STORAGE } from '../constants/storage.js';

const LOC_BASE_CAP = 50; // base tire capacity per shop location

export function getCap(g) {
  return g.storage.reduce((a, s) => a + STORAGE[s.type].cap, 0) +
    g.locations.reduce((a, l) => a + LOC_BASE_CAP + (l.locStorage || 0), 0);
}

export function getInv(g) {
  return Object.values(g.inventory).reduce((a, b) => a + b, 0);
}

/** Sum of a single location's inventory */
export function getLocInv(loc) {
  if (!loc.inventory) return 0;
  return Object.values(loc.inventory).reduce((a, b) => a + b, 0);
}

/** Capacity for a single location (base 50 + upgrades) */
export function getLocCap(loc) {
  return LOC_BASE_CAP + (loc.locStorage || 0);
}

/** Capacity of central storage (van/garage/warehouse, NOT shop floors) */
export function getStorageCap(g) {
  return g.storage.reduce((a, s) => a + STORAGE[s.type].cap, 0);
}

/**
 * Rebuild g.inventory as aggregate of all location inventories + warehouseInventory.
 * Must be called at the end of simWeek after per-location writes.
 */
export function rebuildGlobalInv(g) {
  const agg = {};
  // Sum warehouse inventory
  for (const [k, v] of Object.entries(g.warehouseInventory || {})) {
    agg[k] = (agg[k] || 0) + v;
  }
  // Sum all location inventories
  for (const loc of g.locations) {
    if (!loc.inventory) continue;
    for (const [k, v] of Object.entries(loc.inventory)) {
      agg[k] = (agg[k] || 0) + v;
    }
  }
  g.inventory = agg;
}

export function addA(arr, id) {
  return arr.includes(id) ? arr : [...arr, id];
}
