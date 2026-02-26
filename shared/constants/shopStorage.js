export const SHOP_STORAGE_UPGRADES = [
  { id: 'shelving',      n: 'Shelving',       add: 30,  cost: 2000,  ic: '\u{1F4DA}' },
  { id: 'backRoom',      n: 'Back Room',      add: 75,  cost: 6000,  ic: '\u{1F6AA}' },
  { id: 'expandedFloor', n: 'Expanded Floor', add: 150, cost: 15000, ic: '\u{1F3ED}' },
  { id: 'megaStore',     n: 'Mega Store',     add: 300, cost: 35000, ic: '\u{1F3E2}' },
];
// Cumulative caps: 30 -> 105 -> 255 -> 555 (total capacity: 80 -> 155 -> 305 -> 605)

/**
 * Get the next available storage upgrade for a location.
 * @param {object} loc - location object with locStorage field
 * @returns {object|null} next upgrade tier with cumCap, or null if maxed
 */
export function getNextUpgrade(loc) {
  const cur = loc.locStorage || 0;
  let cum = 0;
  for (const tier of SHOP_STORAGE_UPGRADES) {
    cum += tier.add;
    if (cur < cum) return { ...tier, cumCap: cum };
  }
  return null; // maxed out
}
