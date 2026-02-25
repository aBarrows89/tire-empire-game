export const SUPPLIER_REL_TIERS = [
  { min: 0, level: 0, label: 'New Account', discBonus: 0, freeSampleChance: 0 },
  { min: 100, level: 1, label: 'Regular', discBonus: 0.01, freeSampleChance: 0 },
  { min: 500, level: 2, label: 'Preferred', discBonus: 0.02, freeSampleChance: 0.02 },
  { min: 2000, level: 3, label: 'Key Account', discBonus: 0.04, freeSampleChance: 0.05 },
  { min: 5000, level: 4, label: 'Strategic Partner', discBonus: 0.06, freeSampleChance: 0.08 },
  { min: 15000, level: 5, label: 'Elite Partner', discBonus: 0.10, freeSampleChance: 0.12 },
];

export function getSupplierRelTier(totalPurchased) {
  let tier = SUPPLIER_REL_TIERS[0];
  for (const t of SUPPLIER_REL_TIERS) {
    if (totalPurchased >= t.min) tier = t;
    else break;
  }
  return tier;
}
