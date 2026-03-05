export const MAP_FLOOR = { allSeason: .82, performance: .85, winter: .80, lightTruck: .80, commercial: .78 };

export const VOL_TIERS = [
  { min: 0, disc: 0, label: "Standard" },
  { min: 200, disc: .03, label: "Bronze (3% off)" },
  { min: 500, disc: .06, label: "Silver (6% off)" },
  { min: 1500, disc: .10, label: "Gold (10% off)" },
  { min: 5000, disc: .15, label: "Platinum (15% off)" },
  { min: 15000, disc: .20, label: "Diamond (20% off)" },
];

export const WS_BASE_MARGIN = { min: .03, max: .08 };

export const WS_VOL_BONUS = [
  { minVol: 0, bonus: 0, label: "No Vol Bonus" },
  { minVol: 200, bonus: .02, label: "+2% (Silver Vol)" },
  { minVol: 500, bonus: .04, label: "+4% (Gold Vol)" },
  { minVol: 1000, bonus: .06, label: "+6% (Platinum Vol)" },
  { minVol: 2500, bonus: .08, label: "+8% (Diamond Vol)" },
];

export const WS_RELATIONSHIP_BONUS = .005;
export const WS_DELIVERY_COST = { min: 4, max: 8 };
export const WS_STORAGE_COST = .50;
export const WS_MIN_REP = 30;
export const WS_MIN_STORAGE = 2000;

// Player-to-player wholesale constants
export const P2P_DELIVERY_FEE = 6;        // flat per-tire delivery cost
export const P2P_COMMISSION = 0.03;        // 3% platform commission on sales

// ── Wholesale Upgrades ──
// Players invest cash to improve their wholesale operation
export const WS_UPGRADES = {
  clientCapacity: {
    name: 'Client Capacity',
    desc: 'Serve more wholesale clients simultaneously',
    icon: '👥',
    levels: [
      { level: 1, maxClients: 5,  cost: 25000,  label: 'Small Desk (5 clients)' },
      { level: 2, maxClients: 10, cost: 75000,  label: 'Sales Team (10 clients)' },
      { level: 3, maxClients: 20, cost: 200000, label: 'Account Managers (20 clients)' },
      { level: 4, maxClients: 50, cost: 500000, label: 'Enterprise Sales (50 clients)' },
    ],
  },
  deliveryFleet: {
    name: 'Delivery Fleet',
    desc: 'Faster delivery, lower per-tire shipping cost',
    icon: '🚛',
    levels: [
      { level: 1, feeReduction: 0,    speed: 1, cost: 0,      label: 'Standard Shipping' },
      { level: 2, feeReduction: 1.5,  speed: 2, cost: 50000,  label: 'Dedicated Van (-$1.50/tire)' },
      { level: 3, feeReduction: 3,    speed: 3, cost: 150000, label: 'Box Truck Fleet (-$3/tire)' },
      { level: 4, feeReduction: 4.5,  speed: 4, cost: 400000, label: 'Semi Fleet (-$4.50/tire)' },
    ],
  },
  salesTools: {
    name: 'Sales Tools',
    desc: 'Better tools to attract and retain clients',
    icon: '📊',
    levels: [
      { level: 1, clientRetention: 0,    clientAttraction: 0,    cost: 0,      label: 'Phone & Email' },
      { level: 2, clientRetention: 0.10, clientAttraction: 0.05, cost: 30000,  label: 'CRM System (+10% retention)' },
      { level: 3, clientRetention: 0.20, clientAttraction: 0.10, cost: 100000, label: 'B2B Portal (+20% retention)' },
      { level: 4, clientRetention: 0.30, clientAttraction: 0.20, cost: 300000, label: 'Full Platform (+30% retention)' },
    ],
  },
  bulkStorage: {
    name: 'Bulk Storage',
    desc: 'Dedicated wholesale warehouse space',
    icon: '📦',
    levels: [
      { level: 1, bonusCap: 0,    cost: 0,      label: 'Shared Space' },
      { level: 2, bonusCap: 500,  cost: 40000,  label: 'Dedicated Bay (+500)' },
      { level: 3, bonusCap: 1500, cost: 120000, label: 'Wholesale Wing (+1500)' },
      { level: 4, bonusCap: 5000, cost: 350000, label: 'Bulk Warehouse (+5000)' },
    ],
  },
};
