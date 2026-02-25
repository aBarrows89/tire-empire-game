export const FACTORY = {
  buildCost: 5000000,
  minRep: 75,
  minLocations: 5,

  levels: [
    { level: 1, dailyCapacity: 50, upgradeCost: 0, qualityMax: 0.85, name: 'Small Plant' },
    { level: 2, dailyCapacity: 150, upgradeCost: 2000000, qualityMax: 0.92, name: 'Regional Factory' },
    { level: 3, dailyCapacity: 500, upgradeCost: 10000000, qualityMax: 1.0, name: 'National Plant' },
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
};
