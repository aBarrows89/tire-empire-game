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
