export const FRANCHISE = {
  unlockCost: 500000,
  minLocations: 3,
  minRep: 40,
  franchiseFee: 25000,          // Base fee for 1st franchise location
  franchiseFeeScale: 1.5,       // Each additional franchise costs 1.5x the previous
  royaltyRate: 0.05,            // 5% ongoing royalty on franchise revenue
  royaltyRateDecay: 0.005,      // Royalty drops 0.5% per franchise (min 2%) — volume discount
  templateMaxCount: 5,          // Expanded from 3 to 5 templates
};
