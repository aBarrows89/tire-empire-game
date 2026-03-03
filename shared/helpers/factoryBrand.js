/**
 * Factory Brand System Helpers
 * Branded tire construction, effective cost calculation, customer tiers
 */

import { TIRES } from '../constants/tires.js';
import { FACTORY } from '../constants/factory.js';
import { RAW_MATERIALS, FACTORY_DISCOUNT_TIERS_DEFAULT, EXCLUSIVE_TIRES, TIRE_ATTR_WEIGHTS, RUBBER_FARM, SYNTHETIC_LAB } from '../constants/factoryBrand.js';
import { RD_PROJECTS, CERTIFICATIONS } from '../constants/factoryBrand.js';

/** Returns the branded inventory key for a base tire type */
export function getBrandTireKey(baseType) {
  return `brand_${baseType}`;
}

/**
 * Construct a virtual TIRES entry for a branded tire.
 * Uses production cost as bMin/bMax (for COGS), wholesale price as def.
 */
export function getBrandTire(factory, baseType) {
  const baseTire = TIRES[baseType];
  const prodCost = FACTORY.productionCost[baseType];
  if (!baseTire || !prodCost) return null;

  const brandName = factory.brandName || 'Custom';
  const wsPrice = factory.wholesalePrices?.[baseType] || Math.round(prodCost * 1.5);

  return {
    n: `${brandName} ${baseTire.n}`,
    bMin: prodCost,
    bMax: prodCost,
    def: wsPrice,
    lo: Math.round(prodCost * 0.9),
    hi: Math.round(baseTire.hi * 1.2),
    branded: true,
    brandName,
    baseType,
  };
}

/**
 * Merge static TIRES with player's branded tire definitions.
 * Used in retail sales loops so branded tires can sell in shops.
 */
export function getAllTires(g) {
  const merged = { ...TIRES };

  if (!g.hasFactory || !g.factory) return merged;

  const factory = g.factory;

  // Standard producible types
  for (const baseType of Object.keys(FACTORY.productionCost)) {
    const key = getBrandTireKey(baseType);
    const brandTire = getBrandTire(factory, baseType);
    if (brandTire) merged[key] = brandTire;
  }

  // Exclusive R&D tires
  for (const exclusiveKey of (factory.unlockedSpecials || [])) {
    const excDef = EXCLUSIVE_TIRES[exclusiveKey];
    if (excDef) {
      merged[exclusiveKey] = {
        n: `${factory.brandName || 'Custom'} ${excDef.n}`,
        bMin: excDef.baseCost,
        bMax: excDef.baseCost,
        def: excDef.def,
        lo: excDef.lo,
        hi: excDef.hi,
        branded: true,
        exclusive: true,
        brandName: factory.brandName,
      };
    }
  }

  return merged;
}

/**
 * Get effective production cost after raw material price indices.
 * avgMaterialIndex is the mean of rubber/steel/chemicals indices.
 */
export function getEffectiveProductionCost(factory, tireType) {
  const baseCost = FACTORY.productionCost[tireType];
  if (!baseCost) return 0;

  const rm = factory.rawMaterials || {};
  const rubberIdx = rm.rubber ?? RAW_MATERIALS.rubber.base;
  const steelIdx = rm.steel ?? RAW_MATERIALS.steel.base;
  const chemIdx = rm.chemicals ?? RAW_MATERIALS.chemicals.base;
  const avgIdx = (rubberIdx + steelIdx + chemIdx) / 3;

  return Math.round(baseCost * avgIdx);
}

/**
 * Get the customer discount tier based on total units purchased.
 * Mirrors getSupplierRelTier pattern but uses factory's custom tiers.
 */
export function getCustomerTier(factory, totalPurchased) {
  const tiers = factory.discountTiers || FACTORY_DISCOUNT_TIERS_DEFAULT;
  let tier = tiers[0];
  for (const t of tiers) {
    if (totalPurchased >= t.min) tier = t;
    else break;
  }
  return tier;
}

/**
 * Compute tire performance attributes from factory state.
 * Returns { grip, durability, comfort, treadLife, efficiency } each 0-100.
 */
export function computeTireAttributes(factory) {
  const q = factory.qualityRating || 0.80;
  const base = q * 50; // quality 0.80 = 40, 1.0 = 50

  let grip = base, durability = base, comfort = base, treadLife = base, efficiency = base;

  // R&D bonuses from completed projects
  const completedRD = new Set();
  for (const proj of (factory.rdProjects || [])) {
    // Only count completed projects (not in queue)
    // We check unlockedSpecials + qualityBoost applied
  }
  // Check which RD ids have been completed via unlockedSpecials or quality already above base
  const rdIds = new Set();
  for (const proj of RD_PROJECTS) {
    if (proj.unlocksExclusive && (factory.unlockedSpecials || []).includes(proj.unlocksExclusive)) {
      rdIds.add(proj.id);
    }
    // qualityBoost projects are completed if quality is above base + boost
    if (proj.qualityBoost && (factory.qualityRating || 0.80) > 0.80 + (proj.qualityBoost || 0) * 0.5) {
      rdIds.add(proj.id);
    }
  }

  if (rdIds.has('ultraGrip'))   { grip += 20; }
  if (rdIds.has('silentRide'))  { comfort += 20; }
  if (rdIds.has('evOptimized')) { efficiency += 15; comfort += 10; }

  // Certification bonuses
  const earnedCerts = new Set((factory.certifications || []).filter(c => c.earned).map(c => c.id));
  if (earnedCerts.has('speed_h'))  { grip += 10; durability += 5; }
  if (earnedCerts.has('speed_v'))  { grip += 15; durability += 10; }
  if (earnedCerts.has('iso_9001')) { grip += 10; durability += 10; comfort += 10; treadLife += 10; efficiency += 10; }

  // Raw material quality: cheap rubber (< 0.9) = better grip + treadLife
  const rubberIdx = factory.rawMaterials?.rubber ?? 1.0;
  if (rubberIdx < 0.9) { grip += 5; treadLife += 5; }

  // Cap at 100
  return {
    grip: Math.min(100, Math.round(grip)),
    durability: Math.min(100, Math.round(durability)),
    comfort: Math.min(100, Math.round(comfort)),
    treadLife: Math.min(100, Math.round(treadLife)),
    efficiency: Math.min(100, Math.round(efficiency)),
  };
}

/**
 * Get demand multiplier based on tire attributes and tire type weights.
 * Returns weighted score / 50, clamped to [0.7, 1.8].
 */
export function getTireAttrMultiplier(attrs, tireType) {
  const baseType = (tireType || '').replace('brand_', '');
  const weights = TIRE_ATTR_WEIGHTS[baseType] || TIRE_ATTR_WEIGHTS.default;
  const score = attrs.grip * weights.grip
    + attrs.durability * weights.durability
    + attrs.comfort * weights.comfort
    + attrs.treadLife * weights.treadLife
    + attrs.efficiency * weights.efficiency;
  return Math.max(0.7, Math.min(1.8, score / 50));
}
