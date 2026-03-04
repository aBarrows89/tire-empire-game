export const FACTORY = {
  buildCost: 3500000,   // 16h: Reduced from $5M to $3.5M for realistic ROI
  minRep: 75,
  minLocations: 5,

  levels: [
    { level: 1, dailyCapacity: 80, upgradeCost: 0, qualityMax: 0.85, name: 'Small Plant' },  // 16h: 50→80
    { level: 2, dailyCapacity: 150, upgradeCost: 2000000, qualityMax: 0.92, name: 'Regional Factory' },
    { level: 3, dailyCapacity: 500, upgradeCost: 10000000, qualityMax: 1.0, name: 'National Plant' },
    { level: 4, dailyCapacity: 1500, upgradeCost: 35000000, qualityMax: 1.0, name: 'Mega Plant' },
    { level: 5, dailyCapacity: 5000, upgradeCost: 100000000, qualityMax: 1.0, name: 'Continental' },
    { level: 6, dailyCapacity: 15000, upgradeCost: 500000000, qualityMax: 1.0, name: 'Global' },
  ],

  productionCost: {
    allSeason: 35,
    performance: 55,
    winter: 50,
    lightTruck: 65,
    commercial: 90,
    evTire: 70,
    runFlat: 60,
  },

  monthlyOverhead: 50000,

  // Per-level monthly overhead
  monthlyOverheadByLevel: [0, 50000, 100000, 250000, 600000, 1500000, 5000000],

  // Multiple factories
  maxFactories: 4,
  additionalFactoryCosts: [8000000, 15000000, 30000000],
  factoryMinRep: [75, 80, 90, 95],

  // Asset values for wealth calculation
  factoryValue: [0, 5000000, 7000000, 17000000, 52000000, 152000000, 652000000], // index = level

  // Factory staffing
  staff: {
    lineWorkers: { salary: 3200, capacityBoost: 10, label: 'Line Worker' },
    inspectors: { salary: 4500, defectReduce: 0.025, label: 'Quality Inspector' },
    engineers: { salary: 6500, qualityBoost: 0.005, label: 'R&D Engineer' },
    manager: { salary: 7000, efficiencyBoost: 0.20, max: 1, label: 'Factory Manager' },
  },

  // R&D system — lower base defect, better inspector effectiveness
  baseDefectRate: 0.12,
  minDefectRate: 0.01,

  // Volume discounts on production cost (more granular tiers)
  volumeDiscounts: [
    { minQty: 50, discount: 0.05 },
    { minQty: 100, discount: 0.10 },
    { minQty: 200, discount: 0.18 },
    { minQty: 300, discount: 0.25 },
    { minQty: 500, discount: 0.30 },
  ],
};
