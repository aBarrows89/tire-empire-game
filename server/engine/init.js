import { uid } from '../../shared/helpers/random.js';
import { TIRES } from '../../shared/constants/tires.js';

/**
 * Create a fresh player game state.
 * @param {string} playerName
 * @param {number} globalDay — current server day (for startDay tracking)
 */
export function init(playerName = "Player", globalDay = 1) {
  const inventory = {};
  const prices = {};
  const marketPrices = {};
  for (const k of Object.keys(TIRES)) {
    inventory[k] = 0;
    prices[k] = TIRES[k].def;
    marketPrices[k] = TIRES[k].def;
  }

  return {
    id: uid(),
    name: playerName,
    day: 1,             // player's own day counter (resets on character reset)
    startDay: globalDay, // global server day when this character was created/reset
    cash: 500,
    reputation: 0,
    totalRev: 0,
    totalProfit: 0,
    totalSold: 0,
    dayRev: 0,
    dayProfit: 0,
    daySold: 0,
    inventory,
    prices,
    marketPrices,
    storage: [{ type: "van", id: uid() }],
    locations: [],
    staff: { techs: 0, sales: 0, managers: 0, drivers: 0, pricingAnalyst: 0 },
    autoPrice: {},
    autoSource: null,
    servicePrices: { flatRepair: 25, balance: 20, install: 35, nitrogen: 10 },
    dayServiceRev: 0,
    dayServiceJobs: 0,
    totalServiceRev: 0,
    whStaff: {},
    corpStaff: {},
    loans: [],
    warehouseInventory: {},
    hasWarehouse: false,
    disposalFee: 3,
    bankBalance: 0,
    bankRate: 0.042,
    bankInterestEarned: 0,
    bankTotalInterest: 0,
    unlockedSources: ["scrapYard", "garageCleanout"],
    unlockedSuppliers: [],
    unlockedMfgs: [],
    hasWholesale: false,
    wsClients: [],
    wholesalePrices: {},
    wholesaleOrdersReceived: [],
    wholesaleOrdersPlaced: [],
    totalWholesaleRevenue: 0,
    monthlyPurchaseVol: 0,
    hasEcom: false,
    ecomStaff: {},
    ecomUpgrades: [],
    ecomTotalSpent: 0,
    ecomDailyOrders: 0,
    ecomDailyRev: 0,
    marketplaceSpecialist: false,
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
    achievements: {},
    tireCoins: 0,
    tcStorageLevel: 0,  // Upgrade level for TC storage cap
    tutorialStep: 0,
    tutorialDone: false,
    vinnieSeen: [],
    companyName: '',
    aiShops: [],
    // History & trends
    history: [],
    prevDayRev: 0,
    prevDayProfit: 0,
    prevDaySold: 0,
    prevCash: 500,
    prevRep: 0,
    // Insurance
    insurance: null,
    // Tire retreading
    retreadQueue: [],
    // Supplier relationships
    supplierRelationships: {},
    // Pending tire lot inspection
    pendingLot: null,
    // Regional market share
    marketShare: {},
    // Import orders in transit
    pendingImports: [],
    // Weekly tournament snapshot
    weeklySnapshot: null,
    // Franchise system
    hasFranchise: false,
    franchiseTemplates: [],
    // Tire manufacturing
    hasFactory: false,
    factory: null,
    // Flea market stands
    fleaMarketStands: [],
    fleaMarketTotalSold: 0,
    // Car meets
    carMeetAttendance: [],
    carMeetTotalSold: 0,
    carMeetsAttended: 0,
    // Van tracking
    vanTotalSold: 0,
    vanOnlyDays: 0,
    // Auto supplier orders
    autoSuppliers: [],
    // Shop marketplace
    shopListings: [],
    shopBids: [],
    shopRevenueShares: [],
    shopInstallments: [],
    // Bonus warehouse capacity purchased with TC
    bonusStorage: 0,
    // Market Intel (TC purchase — shows city demand heat map)
    marketIntel: null, // { purchasedDay, expiresDay }
    // Premium membership
    isPremium: false,
    premiumSince: null,
    // Auto-restock IAP (resets on game restart)
    hasAutoRestock: false,
    _events: [],
    // Notification preferences
    notifications: {
      globalEvents: true,
      cashReserve: true,
      cashReserveThreshold: 5000,
      tcStorage: true,
      inventory: true,
      loanPayments: false,
      factoryProduction: false,
    },
    // Moderation
    blockedPlayers: [],
    isBanned: false,
    // Stock Exchange
    stockExchange: {
      hasBrokerage: false,
      brokerageOpenedDay: null,
      portfolio: {},
      openOrders: [],
      tradeHistory: [],
      marginEnabled: false,
      marginDebt: 0,
      marginCallDay: null,
      darkPoolAccess: false,
      advancedCharting: false,
      shortSellingEnabled: false,
      ipoPriority: false,
      realTimeAlerts: false,
      priceAlerts: [],
      dividendIncome: 0,
      capitalGains: 0,
      taxesPaid: 0,
      brokerageFeePaid: 0,
      wealthTaxPaid: 0,
      isPublic: false,
      ipoDay: null,
      ticker: null,
      dividendPayoutRatio: 0.25,
      founderSharesLocked: 0,
      shortPositions: {},
    },
  };
}
