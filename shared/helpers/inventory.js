import { STORAGE } from '../constants/storage.js';

export function getCap(g) {
  return g.storage.reduce((a, s) => a + STORAGE[s.type].cap, 0) +
    g.locations.reduce((a, l) => a + (l.locStorage || 0), 0);
}

export function getInv(g) {
  return Object.values(g.inventory).reduce((a, b) => a + b, 0);
}

export function addA(arr, id) {
  return arr.includes(id) ? arr : [...arr, id];
}
