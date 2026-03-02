/**
 * Factory Brand System Helpers
 * Branded tire construction, effective cost calculation, customer tiers
 */

import { TIRES } from '../constants/tires.js';
import { FACTORY } from '../constants/factory.js';
import { RAW_MATERIALS, FACTORY_DISCOUNT_TIERS_DEFAULT, EXCLUSIVE_TIRES } from '../constants/factoryBrand.js';

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
