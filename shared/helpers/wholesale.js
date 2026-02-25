import { WS_BASE_MARGIN, WS_VOL_BONUS, WS_RELATIONSHIP_BONUS } from '../constants/wholesale.js';
import { TPO_BRANDS } from '../constants/tpoBrands.js';
import { VOL_TIERS } from '../constants/wholesale.js';
import { getCap, getInv } from './inventory.js';
import { Rf } from './format.js';

export function getVolTier(monthlyVol) {
  let best = VOL_TIERS[0];
  for (const t of VOL_TIERS) {
    if (monthlyVol >= t.min) best = t;
  }
  return best;
}

export function getWsVolBonus(monthlyVol) {
  let best = WS_VOL_BONUS[0];
  for (const t of WS_VOL_BONUS) {
    if (monthlyVol >= t.minVol) best = t;
  }
  return best;
}

export function getWsMargin(g, client) {
  const base = Rf(WS_BASE_MARGIN.min, WS_BASE_MARGIN.max);
  const volBonus = getWsVolBonus(g.monthlyPurchaseVol || 0).bonus;
  const daysActive = Math.max(0, (g.day || g.week || 0) - (client?.joinedDay || client?.joinedWeek || 0));
  const relBonus = Math.min(.05, Math.floor(daysActive / 30) * WS_RELATIONSHIP_BONUS);
  return base + volBonus + relBonus;
}

export function getWsAvailSpace(g) {
  const totalCap = getCap(g);
  const ownInv = getInv(g);
  const tpoSpace = (g.tpoContracts || []).reduce((a, c) => {
    const brand = TPO_BRANDS.find(b => b.id === c.brandId);
    if (!brand) return a;
    return a + Math.floor(Math.min(brand.tiresStored[1], (totalCap - ownInv) * .4));
  }, 0);
  return Math.max(0, totalCap - ownInv - tpoSpace);
}
