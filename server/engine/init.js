import { uid } from '../../shared/helpers/random.js';
import { TIRES } from '../../shared/constants/tires.js';

/**
 * Create a fresh player game state.
 * Matches the init() function from tire-empire-v6.jsx exactly.
 */
export function init(playerName = "Player") {
  const inventory = {};
  const prices = {};
  const marketPrices = {};
  for (const k of Object.keys(TIRES)) {
    inventory[k] = 0;
    prices[k] = TIRES[k].def;
    // Market average = midpoint of lo-hi range with some noise
    marketPrices[k] = TIRES[k].def;
  }

  return {
    id: uid(),
    name: playerName,
    week: 1,
    cash: 400,
    reputation: 0,
    totalRev: 0,
    totalProfit: 0,
    totalSold: 0,
    weekRev: 0,
    weekProfit: 0,
    weekSold: 0,
    inventory,
    prices,
    marketPrices,
    storage: [{ type: "van", id: uid() }],
    locations: [],
    staff: { techs: 0, sales: 0, managers: 0, drivers: 0 },
    whStaff: {},
    corpStaff: {},
    loans: [],
    bankBalance: 0,
    bankRate: 0.042,       // annual rate, fluctuates each tick
    bankInterestEarned: 0, // interest earned this week
    bankTotalInterest: 0,  // lifetime interest earned
    unlockedSources: ["scrapYard", "garageCleanout"],
    unlockedSuppliers: [],
    unlockedMfgs: [],
    hasWholesale: false,
    wsClients: [],
    monthlyPurchaseVol: 0,
    hasEcom: false,
    ecomStaff: {},
    ecomUpgrades: [],
    ecomTotalSpent: 0,
    ecomWeeklyOrders: 0,
    ecomWeeklyRev: 0,
    marketplaceChannels: [],
    hasDist: false,
    distClients: [],
    tpoContracts: [],
    returnDeals: [],
    govContracts: [],
    fleetOffers: [],
    installers: [],
    isInstaller: false,
    liquidationListings: [],
    log: [],
    achievements: [],
    tireCoins: 0,
    tutorialStep: 0,
    tutorialDone: false,
    companyName: '',
    aiShops: [],
    _events: [],
  };
}
