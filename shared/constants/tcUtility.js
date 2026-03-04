// ── TireCoin Utility System (Section 14f) ──
// TC purchases unlock meaningful business advantages without being pay-to-win.
// Every TC purchase has a cash-equivalent path — TC lets you skip the grind, not the game.

/** Shop/warehouse purchases with TC (or hybrid TC + cash) */
export const TC_SHOP_PURCHASE = {
  enabled: true,
  conversionRate: 200,        // 1 TC = $200 of property value
  premiumMultiplier: 1.3,     // 30% premium over cash equivalent
  applicableTo: ['shop', 'warehouse', 'distributionCenter'],
  allowHybridPayment: true,
  hybridMinTcPct: 0.25,       // Must use at least 25% TC if choosing hybrid
};

/** Rush timers — speed up anything with a wait */
export const TC_RUSH = {
  importDelivery: { cost: 5, description: 'Rush Import Delivery' },
  factoryBatch: { costPerDay: 3, maxSkip: 0.5, description: 'Expedite Production' },
  contractDelivery: { costPerDay: 2, description: 'Rush Contract Fulfillment' },
  shopConstruction: { cost: 15, description: 'Fast-Track Grand Opening' },
  retreading: { cost: 3, description: 'Rush Retread' },
  rdProject: { costPerDay: 8, maxSkip: 0.3, description: 'Accelerate R&D' },
};

/** Exclusive supplier deals — Vinnie's connections */
export const TC_SUPPLIER_ACCESS = {
  premiumSupplierUnlock: {
    cost: 50, repDiscount: 5, maxUses: 3,
    description: "Vinnie pulls some strings to get you in early",
  },
  exclusiveLots: {
    enabled: true,
    lotFrequency: 14,
    discountRange: [0.25, 0.40],
    maxQuantity: [50, 200],
    tcCostRange: [10, 40],
    vinnieIntro: "I know a guy who's got a truck full of %tireType% that fell off the books. %qty% tires, %discount%% below market. Interested? It'll cost you %tc% TireCoins — cash won't cut it for this one.",
  },
  priorityRestocking: {
    cost: 8,
    description: 'Priority restock during supply crunches',
  },
};

/** Competitive intelligence unlocks */
export const TC_INTEL = {
  cityDemandHeatmap: { cost: 25, duration: 30, description: 'See real-time demand levels for all tire types across all cities' },
  competitorPricing: { cost: 15, duration: 14, description: 'See exact pricing of AI shops and player shops in your cities' },
  supplierForecast: {
    cost: 20, duration: 30, accuracy: 0.75,
    description: 'See predicted supplier price trends for next 30 days',
    vinnieIntro: "I've got a buddy at the port who sees the container manifests. Here's where prices are headed...",
  },
  playerScout: { cost: 10, duration: 7, description: 'View detailed stats on a specific competitor' },
  stockInsider: { cost: 15, description: "Vinnie gives you a stock tip (75% accurate)" },
};

/** Loan & financial perks */
export const TC_FINANCIAL = {
  loanRateReduction: {
    cost: 30, rateReduction: 0.01, maxReductions: 2,
    description: "Vinnie knows the bank manager — negotiate a better rate",
  },
  loanEarlyPayoff: {
    costPerPct: 5, maxPayoff: 0.5,
    description: 'Use TC to pay down loan principal',
  },
  creditLine: {
    cost: 40, cashAmount: 50000, interestRate: 0.08, repaymentDays: 60, maxActive: 1,
    description: 'Emergency credit line — fast cash when you need it',
    vinnieIntro: "Look, I can get you $50K by tomorrow. 8% interest, 60 days to pay it back. No questions asked.",
  },
  insuranceUpgrade: {
    cost: 20, duration: 90, coverageBoost: 0.25,
    description: 'Enhanced insurance coverage — better payouts on damage/theft events',
  },
};

/** Staff & operations boosts */
export const TC_OPERATIONS = {
  eliteHire: {
    cost: 20, maxPerLocation: 1, productivityMultiplier: 1.5,
    roles: ['techs', 'sales', 'managers'],
    description: 'Hire a "star" employee with 1.5x productivity',
    vinnieIntro: "I know this guy — best tire tech in the state. He's expensive but he's worth double. Want me to call him?",
  },
  trainingProgram: {
    cost: 15, duration: 30, boost: 0.10, permanent: true, maxPerLocation: 1,
    description: 'Staff training program — permanent 10% productivity boost per location',
  },
  autoManager: {
    cost: 35, duration: 30,
    description: 'AI manager auto-optimizes pricing and restocking for one location',
    vinnieIntro: "I set up a system that watches your numbers and adjusts on the fly. Think of it as cruise control for your shop.",
  },
};

/** Reputation & marketing accelerators (NOT direct rep purchase) */
export const TC_REPUTATION = {
  grandOpening: {
    cost: 25, repBoost: 2.0, duration: 14, maxUses: 1,
    description: 'Grand opening event — doubles rep gain for 2 weeks',
    vinnieIntro: "Let's make some noise. Balloons, free tire checks, the works. People will remember this.",
  },
  sponsorshipDeal: {
    cost: 40, repBoostFlat: 0.5, duration: 30, cooldown: 90,
    description: 'Sponsor a local event — steady reputation gain',
  },
  brandRefresh: {
    cost: 50, loyaltyIncrease: 5, permanent: true, maxUses: 3,
    description: 'Company rebrand — boost customer loyalty across all shops',
  },
};

/** Recurring TC subscription sinks */
export const TC_SUBSCRIPTIONS = {
  premiumAnalytics: {
    costPerMonth: 5,
    description: 'Advanced analytics dashboard — revenue forecasting, competitor tracking, trend analysis',
    features: ['revenueForecast', 'competitorTracker', 'demandTrends', 'profitOptimizer'],
  },
  vinnieHotline: {
    costPerMonth: 3,
    description: 'Vinnie checks in more often with better intel',
  },
  prioritySupport: {
    costPerMonth: 8,
    description: 'Priority supplier queue + reduced shipping times',
  },
};
