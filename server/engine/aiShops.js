import { R, Rf } from '../../shared/helpers/format.js';
import { uid } from '../../shared/helpers/random.js';
import { CITIES } from '../../shared/constants/cities.js';
import { PERS, SH_NAMES, SH_SUFFIX } from '../../shared/constants/personality.js';
import { TIRES } from '../../shared/constants/tires.js';
import { getCitySlots } from '../../shared/helpers/market.js';

/**
 * Generate a single AI shop for a given city.
 */
export function genAIShop(cityId) {
  const city = CITIES.find(c => c.id === cityId);
  if (!city) return null;

  // Pick personality — ag cities get ag_dealer more often
  let pers;
  if (city.agPct && Math.random() < city.agPct) {
    pers = PERS.find(p => p.t === "ag_dealer");
  }
  if (!pers) {
    const nonAg = PERS.filter(p => p.t !== "ag_dealer");
    pers = nonAg[R(0, nonAg.length - 1)];
  }

  const name = `${SH_NAMES[R(0, SH_NAMES.length - 1)]} ${SH_SUFFIX[R(0, SH_SUFFIX.length - 1)]}`;

  // Build inventory based on personality
  const inv = {};
  const prices = {};
  for (const [k, t] of Object.entries(TIRES)) {
    if (t.ag && !pers.ag) continue;
    if (t.used && !pers.uf) continue;
    inv[k] = R(5, 50);
    prices[k] = Math.round(t.def * pers.pm * Rf(.9, 1.1));
  }

  return {
    id: uid(),
    cityId,
    name,
    personality: pers.t,
    ic: pers.ic,
    reputation: pers.rb,
    wealth: pers.wb,
    inventory: inv,
    prices,
    weeklyBuys: R(3, 15),
  };
}

/**
 * Populate AI shops for all cities up to their slot limits.
 */
export function initAIShops() {
  const shops = [];
  for (const city of CITIES) {
    const slots = getCitySlots(city);
    const count = R(Math.floor(slots.aiMax * .4), slots.aiMax);
    for (let i = 0; i < count; i++) {
      const shop = genAIShop(city.id);
      if (shop) shops.push(shop);
    }
  }
  return shops;
}
