import { TIRES } from './tires.js';
import { shopCost } from './shop.js';

export const AI_BUYER_NAMES = [
  'AutoGroup Capital', 'DriveNation Holdings', 'WheelWorks Inc.',
  'TireLand Ventures', 'QuickStop Auto', 'Rubber Road Partners',
  'Axle Point Equity', 'TreadMark Co.', 'MotorMile Retail',
  'PitStop Acquisitions', 'BayView Tire Corp.', 'Summit Auto Group',
  'CrossRoads Tire', 'Velocity Holdings', 'FlatLine Investments',
  'TurnKey Auto LLC',
];

export const SHOP_BID = {
  minBidsPerDay: 0,
  maxBidsPerDay: 2,
  bidMinPct: 0.65,
  bidMaxPct: 1.05,
  expiryDays: 7,
  paymentWeights: { cash: 0.60, installment: 0.25, revShare: 0.15 },
  installmentDownMin: 0.20,
  installmentDownMax: 0.40,
  installmentMonthsMin: 12,
  installmentMonthsMax: 36,
  revShareUpfront: 0.10,
  revSharePctMin: 0.05,
  revSharePctMax: 0.15,
  revShareMonthsMin: 12,
  revShareMonthsMax: 24,
  minOwnershipDays: 90, // must own shop at least 90 days before listing
};

/**
 * Calculate the valuation of a shop/location.
 * @param {object} loc - location object
 * @param {object} city - CITIES entry for this location
 * @returns {object} { baseValue, inventoryValue, loyaltyBonus, revenueBonus, totalValue }
 */
export function getShopValuation(loc, city) {
  const baseValue = city ? shopCost(city) : 120000;

  let inventoryValue = 0;
  for (const [k, qty] of Object.entries(loc.inventory || {})) {
    const t = TIRES[k];
    if (t && qty > 0) inventoryValue += qty * t.bMin;
  }

  const loyaltyBonus = Math.min(
    baseValue * 0.50,
    (loc.loyalty || 0) * baseValue * 0.005
  );

  const dailyRev = (loc.dailyStats && loc.dailyStats.rev) || 0;
  const revenueBonus = dailyRev * 30 * 12; // 1 year of projected revenue

  const rawTotal = Math.round(baseValue + inventoryValue + loyaltyBonus + revenueBonus);
  // Floor: shop is always worth at least 50% of base city cost
  const totalValue = Math.max(rawTotal, Math.round(baseValue * 0.5));

  return { baseValue, inventoryValue, loyaltyBonus: Math.round(loyaltyBonus), revenueBonus: Math.round(revenueBonus), totalValue };
}
