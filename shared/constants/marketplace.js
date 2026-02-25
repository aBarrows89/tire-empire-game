export const MARKETPLACE = {
  amazon: { name: "Amazon", fee: .15, monthlyFee: 39.99, setupCost: 2000, trafficMult: 1.0, desc: "15% referral fee \u00B7 massive traffic \u00B7 brutal competition" },
  ebay: { name: "eBay", fee: .13, monthlyFee: 0, setupCost: 1000, trafficMult: .6, desc: "13% final value fee \u00B7 auction + buy-now \u00B7 good for clearance" },
};

export const MARKETPLACE_UNLOCK = 5000;
export const MARKETPLACE_MIN_REP = 20;
export const MARKETPLACE_WEEKLY_DEMAND = 300;

// Player-to-player marketplace fee tiers
export const P2P_FEES = {
  basic: {
    sellerFee: 0.08,
    buyerFee: 0.05,
    maxListings: 10,
    listingDuration: [7, 14],
  },
  ecommerce: {
    sellerFee: 0.04,
    buyerFee: 0.025,
    maxListings: 50,
    listingDuration: [7, 14, 21, 30],
  },
};

// Marketplace specialist staff role (basic tier access)
export const MARKETPLACE_SPECIALIST = {
  title: 'Marketplace Specialist',
  salary: 3500,
  minRep: 5,
  minLocations: 1,
  description: 'Enables listing tires on the player marketplace',
};
