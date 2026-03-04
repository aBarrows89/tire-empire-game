import { uid } from '../../shared/helpers/random.js';
import { CITIES } from '../../shared/constants/cities.js';
import { TIRES } from '../../shared/constants/tires.js';
import { shopCost } from '../../shared/constants/shop.js';

const R = (lo, hi) => lo + Math.random() * (hi - lo);
const Ri = (lo, hi) => Math.floor(R(lo, hi));

const COMPANY_NAMES = [
  'Apex Tire Co', 'Rolling Thunder Tires', 'GripMaster Auto', 'TreadLine USA',
  'Summit Rubber Works', 'Iron Wheel Tire', 'CrossTown Tires', 'RoadKing Supply',
  'Eagle Tire & Auto', 'Liberty Tire Group', 'Patriot Rubber Co', 'Maverick Tires',
  'BlueRidge Tire Co', 'Sunrise Auto Supply', 'Coastal Tire Works', 'Prairie Tire Co',
  'Redline Tire Group', 'Peak Performance Tire', 'Harbor Tire Co', 'Canyon Tire Works',
  'Lone Star Tires', 'Timber Tire Supply', 'Granite State Tire', 'Silver Creek Auto',
];

const PLAYER_NAMES = [
  'Jake Mitchell', 'Sarah Chen', 'Marcus Williams', 'Elena Rodriguez',
  'Tommy DeLuca', 'Priya Patel', 'Chris O\'Brien', 'Aisha Johnson',
  'Ryan Kowalski', 'Megan Torres', 'Devon Hart', 'Jasmine Lee',
  'Nick Volkov', 'Brianna Foster', 'Carlos Reyes', 'Hannah Kim',
  'Darnell Jackson', 'Olivia Grant', 'Raj Mehta', 'Tiffany Nguyen',
  'Brandon Schultz', 'Keisha Wright', 'Luke Andersson', 'Maya Gupta',
];

/**
 * Create a set of AI players at various game stages.
 * Returns array of { id, game_state } objects ready to be stored.
 */
export function createAIPlayers(globalDay, count = 12) {
  const players = [];
  const usedNames = new Set();
  const usedCompanies = new Set();

  for (let i = 0; i < count; i++) {
    let name, company;
    do { name = PLAYER_NAMES[Ri(0, PLAYER_NAMES.length)]; } while (usedNames.has(name));
    do { company = COMPANY_NAMES[Ri(0, COMPANY_NAMES.length)]; } while (usedCompanies.has(company));
    usedNames.add(name);
    usedCompanies.add(company);

    // Distribute AI players across game stages
    const stage = i / count; // 0 = early, 1 = late
    const playerDay = Math.max(1, Math.floor(globalDay * R(0.3, 1.0)));

    const p = createAIPlayer(name, company, stage, playerDay, globalDay);
    players.push(p);
  }

  return players;
}

function createAIPlayer(name, company, stage, playerDay, globalDay) {
  const id = `ai-${uid()}`;

  // Scale stats by stage (0=newbie, 1=veteran)
  const cash = Math.floor(R(500, 5000) + stage * R(50000, 500000));
  const reputation = Math.min(100, Math.floor(stage * R(40, 95)));
  const bankBalance = stage > 0.5 ? Math.floor(R(10000, 200000) * stage) : 0;

  // Locations — later stage players have more shops
  const numLocations = stage < 0.2 ? 0 : stage < 0.5 ? Ri(1, 2) : stage < 0.8 ? Ri(1, 4) : Ri(2, 6);
  const locations = [];
  const usedCities = new Set();

  for (let i = 0; i < numLocations; i++) {
    let city;
    let attempts = 0;
    do {
      city = CITIES[Ri(0, CITIES.length)];
      attempts++;
    } while (usedCities.has(city.id) && attempts < 20);
    if (usedCities.has(city.id)) continue;
    usedCities.add(city.id);

    const loyalty = Math.min(100, Math.floor(R(5, 40) + stage * R(20, 60)));
    const dailyRev = Math.floor(R(200, 800) + stage * R(500, 3000));

    // Build some inventory
    const inv = {};
    const tireKeys = Object.keys(TIRES);
    const numTypes = Ri(2, Math.min(tireKeys.length, 6));
    for (let j = 0; j < numTypes; j++) {
      const k = tireKeys[Ri(0, tireKeys.length)];
      inv[k] = Ri(3, 30 + Math.floor(stage * 40));
    }

    locations.push({
      id: uid(),
      cityId: city.id,
      locStorage: Ri(0, 3) * 50,
      inventory: inv,
      loyalty,
      openedDay: Math.max(1, playerDay - Ri(30, 300)),
      dailyStats: { rev: dailyRev, sold: Math.floor(dailyRev / 80), profit: Math.floor(dailyRev * 0.35) },
      staff: {
        techs: Ri(1, 3 + Math.floor(stage * 3)),
        sales: Ri(1, 2 + Math.floor(stage * 2)),
        managers: stage > 0.5 ? Ri(0, 2) : 0,
      },
    });
  }

  // Storage
  const storage = [{ type: 'van', id: uid() }];
  if (stage > 0.3) storage.push({ type: stage > 0.7 ? 'warehouse' : 'garage', id: uid() });

  // Warehouse inventory
  const warehouseInventory = {};
  if (storage.length > 1) {
    const tireKeys = Object.keys(TIRES);
    const numTypes = Ri(2, 5);
    for (let j = 0; j < numTypes; j++) {
      const k = tireKeys[Ri(0, tireKeys.length)];
      warehouseInventory[k] = Ri(5, 50 + Math.floor(stage * 100));
    }
  }

  // Prices — slight variation from defaults
  const prices = {};
  for (const [k, t] of Object.entries(TIRES)) {
    prices[k] = Math.round(t.def * R(0.85, 1.15));
  }

  // Revenue history
  const totalRev = Math.floor(R(5000, 50000) + stage * R(100000, 2000000));
  const totalProfit = Math.floor(totalRev * R(0.2, 0.4));
  const totalSold = Math.floor(totalRev / R(60, 120));
  const dayRev = Math.floor(R(100, 500) + stage * R(500, 5000));
  const dayProfit = Math.floor(dayRev * R(0.2, 0.4));

  // Loans
  const loans = [];
  if (stage > 0.3 && Math.random() < 0.4) {
    loans.push({
      id: uid(), name: stage > 0.6 ? 'SBA' : 'Small Biz',
      amt: stage > 0.6 ? 75000 : 25000,
      r: stage > 0.6 ? 0.07 : 0.095,
      remaining: Math.floor(R(5000, stage > 0.6 ? 60000 : 20000)),
      weeklyPayment: stage > 0.6 ? 835 : 570,
    });
  }

  return {
    id,
    game_state: {
      id,
      name,
      companyName: company,
      isAI: true,
      day: playerDay,
      startDay: Math.max(1, globalDay - playerDay),
      cash,
      reputation,
      totalRev,
      totalProfit,
      totalSold,
      dayRev,
      dayProfit,
      daySold: Math.floor(dayRev / R(60, 120)),
      inventory: {},
      prices,
      marketPrices: { ...prices },
      storage,
      locations,
      staff: { techs: 0, sales: 0, managers: 0, drivers: 0, pricingAnalyst: 0 },
      autoPrice: {},
      autoSource: null,
      servicePrices: { flatRepair: 25, balance: 20, install: 35, nitrogen: 10 },
      dayServiceRev: 0,
      dayServiceJobs: 0,
      totalServiceRev: Math.floor(totalRev * 0.1),
      whStaff: {},
      corpStaff: {},
      loans,
      warehouseInventory,
      hasWarehouse: storage.length > 1,
      disposalFee: 3,
      bankBalance,
      bankRate: 0.042,
      bankInterestEarned: 0,
      bankTotalInterest: 0,
      unlockedSources: ['scrapYard', 'garageCleanout', 'fleaMarket'],
      unlockedSuppliers: stage > 0.3 ? ['budget_wholesale'] : [],
      unlockedMfgs: [],
      hasWholesale: stage > 0.4,
      wsClients: [],
      monthlyPurchaseVol: 0,
      hasEcom: stage > 0.6,
      ecomStaff: {},
      ecomUpgrades: [],
      ecomTotalSpent: 0,
      ecomDailyOrders: 0,
      ecomDailyRev: 0,
      marketplaceSpecialist: stage > 0.3,
      marketplaceChannels: [],
      hasDist: stage > 0.7,
      distClients: [],
      distCenters: [],
      tpoContracts: [],
      returnDeals: [],
      govContracts: [],
      fleetOffers: [],
      installers: [],
      isInstaller: false,
      liquidationListings: [],
      log: [],
      achievements: {},
      tireCoins: Math.floor(stage * R(10, 100)),
      tutorialStep: 0,
      tutorialDone: true,
      vinnieSeen: [],
      companyName: company,
      aiShops: [],
      history: [],
      prevDayRev: Math.floor(dayRev * R(0.8, 1.1)),
      prevDayProfit: Math.floor(dayProfit * R(0.8, 1.1)),
      prevDaySold: 0,
      prevCash: cash,
      prevRep: reputation,
      insurance: null,
      retreadQueue: [],
      supplierRelationships: {},
      pendingLot: null,
      marketShare: {},
      pendingImports: [],
      weeklySnapshot: null,
      hasFranchise: false,
      franchiseTemplates: [],
      hasFactory: stage > 0.85,
      factory: stage > 0.85 ? {
        level: stage > 0.95 ? 2 : 1,
        brandName: company + ' Tires',
        productionQueue: [],
        dailyCapacity: stage > 0.95 ? 150 : 50,
        qualityRating: 0.80 + stage * 0.1,
        brandReputation: Math.floor(stage * 40),
        rawMaterials: { rubber: 1.0, steel: 1.0, chemicals: 1.0 },
        currentLine: null,
        switchCooldown: 0,
        isDistributor: stage > 0.90,
        discountTiers: [
          { min: 0, disc: 0, label: 'Standard' },
          { min: 50, disc: 0.03, label: 'Bronze' },
          { min: 200, disc: 0.06, label: 'Silver' },
        ],
        wholesalePrices: { allSeason: 85, performance: 120, winter: 110 },
        mapPrices: {},
        minOrders: {},
        rdProjects: [],
        unlockedSpecials: [],
        certifications: [],
        totalWholesaleRev: 0,
        totalWholesaleOrders: 0,
        customerList: [],
        orderHistory: [],
        vinnieInventory: {},
        vinnieTotalLoss: 0,
        hasCFO: false,
      } : null,
      fleaMarketStands: [],
      fleaMarketTotalSold: 0,
      carMeetAttendance: [],
      carMeetTotalSold: 0,
      carMeetsAttended: 0,
      vanTotalSold: 0,
      vanOnlyDays: 0,
      autoSuppliers: [],
      blockedPlayers: [],
      isBanned: false,
      stockExchange: stage > 0.3 ? {
        hasBrokerage: true, brokerageOpenedDay: 1, portfolio: {}, openOrders: [], tradeHistory: [],
        marginEnabled: false, marginDebt: 0, marginCallDay: null, darkPoolAccess: false,
        advancedCharting: false, shortSellingEnabled: false, ipoPriority: false,
        realTimeAlerts: false, priceAlerts: [], dividendIncome: 0, capitalGains: 0,
        taxesPaid: 0, brokerageFeePaid: 0, wealthTaxPaid: 0,
        isPublic: false, ipoDay: null, ticker: null, dividendPayoutRatio: 0.25,
        founderSharesLocked: 0, shortPositions: {},
      } : null,
      shopListings: [],
      shopBids: [],
      shopRevenueShares: [],
      shopInstallments: [],
      _events: [],
    },
  };
}

/** Check if a player is any kind of bot (legacy isAI or stealth _botConfig). */
export function isBotPlayer(state) {
  return !!(state.isAI || state._botConfig);
}

/**
 * Create a stealth AI player — indistinguishable from a real player.
 * No ai- prefix, no isAI flag. Uses _botConfig internally.
 */
export function createStealthPlayer(name, company, cityId, intensity, adminId) {
  const id = uid(); // Regular ID — no ai- prefix
  const i = Math.max(1, Math.min(10, intensity)); // clamp 1-10
  const t = i / 10; // normalized 0.1-1.0

  // Scale starting resources by intensity
  const cash = Math.floor(R(5000, 50000) + t * R(200000, 950000));
  const reputation = Math.min(100, Math.floor(t * R(40, 80)));
  const bankBalance = i > 3 ? Math.floor(R(10000, 100000) * t) : 0;

  // Locations — high intensity gets more shops
  const numLocations = i <= 3 ? Ri(0, 2) : i <= 6 ? Ri(1, 4) : Ri(3, 7);
  const locations = [];
  const usedCities = new Set();

  // First location uses the specified city
  if (numLocations > 0 && cityId) {
    const city = CITIES.find(c => c.id === cityId);
    if (city) {
      usedCities.add(city.id);
      const loyalty = Math.min(100, Math.floor(R(10, 30) + t * R(20, 50)));
      const dailyRev = Math.floor(R(300, 800) + t * R(500, 4000));
      const inv = {};
      const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
      for (let j = 0; j < Ri(3, 7); j++) {
        const k = tireKeys[Ri(0, tireKeys.length)];
        inv[k] = Ri(5, 20 + Math.floor(t * 40));
      }
      locations.push({
        id: uid(), cityId: city.id, locStorage: Ri(0, 3) * 50, inventory: inv,
        loyalty, openedDay: 1,
        dailyStats: { rev: dailyRev, sold: Math.floor(dailyRev / 80), profit: Math.floor(dailyRev * 0.35) },
        staff: { techs: Ri(1, 2 + Math.floor(t * 3)), sales: Ri(1, 1 + Math.floor(t * 2)), managers: i > 5 ? 1 : 0 },
      });
    }
  }

  // Additional random locations
  for (let idx = locations.length; idx < numLocations; idx++) {
    let city; let attempts = 0;
    do { city = CITIES[Ri(0, CITIES.length)]; attempts++; } while (usedCities.has(city.id) && attempts < 20);
    if (usedCities.has(city.id)) continue;
    usedCities.add(city.id);
    const loyalty = Math.min(100, Math.floor(R(5, 25) + t * R(15, 50)));
    const dailyRev = Math.floor(R(200, 600) + t * R(400, 3000));
    const inv = {};
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
    for (let j = 0; j < Ri(2, 5); j++) {
      const k = tireKeys[Ri(0, tireKeys.length)];
      inv[k] = Ri(3, 15 + Math.floor(t * 30));
    }
    locations.push({
      id: uid(), cityId: city.id, locStorage: Ri(0, 2) * 50, inventory: inv,
      loyalty, openedDay: 1,
      dailyStats: { rev: dailyRev, sold: Math.floor(dailyRev / 80), profit: Math.floor(dailyRev * 0.35) },
      staff: { techs: Ri(1, 2 + Math.floor(t * 2)), sales: Ri(1, 1 + Math.floor(t * 2)), managers: 0 },
    });
  }

  // Prices — intensity 7+ undercuts market, 1-3 prices above
  const prices = {};
  for (const [k, tire] of Object.entries(TIRES)) {
    if (i >= 7) {
      prices[k] = Math.round(tire.def * R(0.75, 0.90)); // undercut
    } else if (i <= 3) {
      prices[k] = Math.round(tire.def * R(1.05, 1.15)); // premium
    } else {
      prices[k] = Math.round(tire.def * R(0.90, 1.10)); // competitive
    }
  }

  // Revenue history scaled by intensity
  const totalRev = Math.floor(R(10000, 50000) + t * R(100000, 1500000));
  const totalProfit = Math.floor(totalRev * R(0.2, 0.4));
  const totalSold = Math.floor(totalRev / R(60, 120));
  const dayRev = Math.floor(R(100, 400) + t * R(500, 5000));
  const dayProfit = Math.floor(dayRev * R(0.25, 0.4));

  // Warehouse
  const warehouseInventory = {};
  if (i > 2) {
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
    for (let j = 0; j < Ri(3, 6); j++) {
      const k = tireKeys[Ri(0, tireKeys.length)];
      warehouseInventory[k] = Ri(5, 30 + Math.floor(t * 80));
    }
  }

  const storage = [{ type: 'van', id: uid() }];
  if (i > 2) storage.push({ type: i > 6 ? 'warehouse' : 'garage', id: uid() });

  return {
    id,
    game_state: {
      id, name, companyName: company,
      _botConfig: { intensity: i, createdBy: adminId || 'system', createdAt: Date.now() },
      day: Ri(30, 300),
      startDay: 1,
      cash, reputation,
      totalRev, totalProfit, totalSold,
      dayRev, dayProfit, daySold: Math.floor(dayRev / R(60, 120)),
      inventory: {}, prices,
      marketPrices: { ...prices },
      storage, locations,
      staff: { techs: 0, sales: 0, managers: 0, drivers: 0, pricingAnalyst: 0 },
      autoPrice: {}, autoSource: null,
      servicePrices: { flatRepair: 25, balance: 20, install: 35, nitrogen: 10 },
      dayServiceRev: 0, dayServiceJobs: 0,
      totalServiceRev: Math.floor(totalRev * 0.1),
      whStaff: {}, corpStaff: {},
      loans: [],
      warehouseInventory,
      hasWarehouse: storage.length > 1,
      disposalFee: 3,
      bankBalance, bankRate: 0.042,
      bankInterestEarned: 0, bankTotalInterest: 0,
      unlockedSources: ['scrapYard', 'garageCleanout', 'fleaMarket'],
      unlockedSuppliers: i > 3 ? ['budget_wholesale'] : [],
      unlockedMfgs: [],
      hasWholesale: i > 4, wsClients: [], monthlyPurchaseVol: 0,
      hasEcom: i > 6, ecomStaff: {}, ecomUpgrades: [], ecomTotalSpent: 0,
      ecomDailyOrders: 0, ecomDailyRev: 0,
      marketplaceSpecialist: i > 3, marketplaceChannels: [],
      hasDist: i > 8, distClients: [], distCenters: [],
      tpoContracts: [], returnDeals: [], govContracts: [],
      fleetOffers: [], installers: [], isInstaller: false,
      liquidationListings: [],
      log: [], achievements: {},
      tireCoins: Math.floor(t * R(5, 50)),
      tutorialStep: 0, tutorialDone: true,
      vinnieSeen: [], aiShops: [], history: [],
      prevDayRev: dayRev, prevDayProfit: dayProfit, prevDaySold: 0,
      prevCash: cash, prevRep: reputation,
      insurance: i > 5 ? 'business' : null,
      retreadQueue: [], supplierRelationships: {},
      pendingLot: null, marketShare: {}, pendingImports: [],
      weeklySnapshot: null, hasFranchise: false, franchiseTemplates: [],
      hasFactory: i >= 9,
      factory: i >= 9 ? {
        level: i === 10 ? 2 : 1,
        brandName: company + ' Tires',
        productionQueue: [], dailyCapacity: i === 10 ? 150 : 50,
        qualityRating: 0.80 + t * 0.1, brandReputation: Math.floor(t * 40),
        rawMaterials: { rubber: 1.0, steel: 1.0, chemicals: 1.0 },
        currentLine: null, switchCooldown: 0,
        isDistributor: i === 10,
        discountTiers: [
          { min: 0, disc: 0, label: 'Standard' },
          { min: 50, disc: 0.03, label: 'Bronze' },
          { min: 200, disc: 0.06, label: 'Silver' },
        ],
        wholesalePrices: { allSeason: 85, performance: 120, winter: 110 },
        mapPrices: {}, minOrders: {}, rdProjects: [],
        unlockedSpecials: [], certifications: [],
        totalWholesaleRev: 0, totalWholesaleOrders: 0,
        customerList: [], orderHistory: [],
        vinnieInventory: {}, vinnieTotalLoss: 0, hasCFO: false,
      } : null,
      fleaMarketStands: [], fleaMarketTotalSold: 0,
      carMeetAttendance: [], carMeetTotalSold: 0, carMeetsAttended: 0,
      vanTotalSold: 0, vanOnlyDays: 0,
      autoSuppliers: [], blockedPlayers: [], isBanned: false,
      stockExchange: i > 4 ? {
        hasBrokerage: true, brokerageOpenedDay: 1, portfolio: {}, openOrders: [], tradeHistory: [],
        marginEnabled: false, marginDebt: 0, marginCallDay: null, darkPoolAccess: false,
        advancedCharting: false, shortSellingEnabled: false, ipoPriority: false,
        realTimeAlerts: false, priceAlerts: [], dividendIncome: 0, capitalGains: 0,
        taxesPaid: 0, brokerageFeePaid: 0, wealthTaxPaid: 0,
        isPublic: false, ipoDay: null, ticker: null, dividendPayoutRatio: 0.25,
        founderSharesLocked: 0, shortPositions: {},
      } : null,
      shopListings: [], shopBids: [], shopRevenueShares: [],
      shopInstallments: [], _events: [],
    },
  };
}

/**
 * Lightweight daily tick for AI players (both legacy isAI and stealth _botConfig).
 * Intensity (from _botConfig) scales all behavior: 1=casual, 10=disruptor.
 */
export function simAIPlayerDay(g) {
  g.day++;

  // Get intensity: stealth bots use _botConfig.intensity, legacy defaults to 5
  const intensity = g._botConfig?.intensity || 5;
  const t = intensity / 10; // normalized 0.1-1.0

  // Revenue multiplier: casual=0.6-0.8x, normal=0.9-1.1x, disruptor=1.2-1.5x
  const revMult = intensity <= 3 ? R(0.6, 0.8) : intensity <= 6 ? R(0.9, 1.1) : R(1.2, 1.5);

  // Daily revenue — fluctuates around their level, scaled by intensity
  const baseRev = (g.locations || []).reduce((a, loc) => {
    const locRev = (loc.dailyStats?.rev || 0) * R(0.7, 1.3) * revMult;
    if (loc.dailyStats) loc.dailyStats.rev = Math.floor(locRev);
    return a + locRev;
  }, 0);

  const dayRev = Math.max(0, Math.floor(baseRev + R(-100, 300)));
  const dayProfit = Math.floor(dayRev * R(0.2, 0.4));
  const daySold = Math.floor(dayRev / R(60, 120));

  g.prevDayRev = g.dayRev;
  g.prevDayProfit = g.dayProfit;
  g.prevCash = g.cash;
  g.prevRep = g.reputation;

  g.dayRev = dayRev;
  g.dayProfit = dayProfit;
  g.daySold = daySold;
  g.totalRev += dayRev;
  g.totalProfit += dayProfit;
  g.totalSold += daySold;
  g.cash += dayProfit;

  // ── SERVICE REVENUE — bots do tire services too ──
  if ((g.locations || []).length > 0) {
    const serviceRev = Math.floor(R(50, 200) * t * (g.locations.length));
    g.dayServiceRev = serviceRev;
    g.dayServiceJobs = Math.floor(serviceRev / 25);
    g.totalServiceRev = (g.totalServiceRev || 0) + serviceRev;
    g.cash += serviceRev;
    g.dayRev += serviceRev;
    g.totalRev += serviceRev;
  }

  // Reputation growth — scales with intensity
  const repChance = intensity <= 3 ? 0.05 : intensity <= 6 ? 0.15 : 0.30;
  const repGrowth = intensity <= 3 ? R(0.02, 0.1) : intensity <= 6 ? R(0.05, 0.2) : R(0.1, 0.4);
  if (Math.random() < repChance && g.reputation < 95) {
    g.reputation = Math.min(100, g.reputation + repGrowth);
  }

  // Loyalty growth at locations
  for (const loc of (g.locations || [])) {
    if (loc.loyalty < 95 && Math.random() < 0.1 + t * 0.2) {
      loc.loyalty = Math.min(100, loc.loyalty + R(0.1, 0.3 + t * 0.3));
    }
  }

  // ── INVENTORY REPLENISHMENT — higher intensity restocks more ──
  if (Math.random() < 0.2 + t * 0.2) {
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
    for (const loc of (g.locations || [])) {
      if (!loc.inventory) loc.inventory = {};
      const locTotal = Object.values(loc.inventory).reduce((a, b) => a + b, 0);
      const locCap = 50 + (loc.locStorage || 0);
      if (locTotal < locCap * 0.5) {
        const toAdd = Ri(5, Math.min(20 + Math.floor(t * 15), locCap - locTotal));
        for (let j = 0; j < toAdd; j++) {
          const k = tireKeys[Ri(0, tireKeys.length)];
          loc.inventory[k] = (loc.inventory[k] || 0) + 1;
        }
      }
    }
  }

  // ── PRICE ADJUSTMENTS — intensity drives strategy ──
  const priceAdjustChance = intensity <= 3 ? 0.05 : intensity <= 6 ? 0.1 : 0.2;
  if (Math.random() < priceAdjustChance) {
    for (const [k, tire] of Object.entries(TIRES)) {
      if (!g.prices[k]) continue;
      let target;
      if (intensity >= 7) {
        target = tire.def * R(0.75, 0.90);
      } else if (intensity <= 3) {
        target = tire.def * R(1.05, 1.15);
      } else {
        target = tire.def * R(0.90, 1.10);
      }
      g.prices[k] = Math.round(g.prices[k] * 0.85 + target * 0.15);
      g.prices[k] = Math.max(tire.lo, Math.min(tire.hi, g.prices[k]));
    }
  }

  // ── WAREHOUSE INVENTORY ──
  if (Math.random() < 0.1 + t * 0.15 && g.cash > 10000) {
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
    if (!g.warehouseInventory) g.warehouseInventory = {};
    const whTotal = Object.values(g.warehouseInventory).reduce((a, b) => a + b, 0);
    if (whTotal < 50 + intensity * 20) {
      const toAdd = Ri(10, 20 + Math.floor(t * 20));
      const cost = toAdd * 50;
      if (g.cash > cost) {
        g.cash -= cost;
        for (let j = 0; j < toAdd; j++) {
          const k = tireKeys[Ri(0, tireKeys.length)];
          g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + 1;
        }
      }
    }
  }

  // ── STORAGE UPGRADES — bots buy more storage when full ──
  if (Math.random() < 0.03 * t && g.cash > 50000) {
    const whTotal = Object.values(g.warehouseInventory || {}).reduce((a, b) => a + b, 0);
    const storageTypes = g.storage || [];
    const currentMax = storageTypes.reduce((a, s) => a + (s.type === 'warehouse' ? 500 : s.type === 'garage' ? 200 : 50), 0);
    if (whTotal > currentMax * 0.8 && storageTypes.length < 3 + intensity) {
      const nextType = currentMax < 200 ? 'garage' : 'warehouse';
      const cost = nextType === 'warehouse' ? 30000 : 8000;
      if (g.cash > cost * 2) {
        g.cash -= cost;
        g.storage.push({ type: nextType, id: uid() });
        g.hasWarehouse = true;
      }
    }
  }

  // ── LOCATION STORAGE UPGRADES ──
  if (Math.random() < 0.02 * t) {
    for (const loc of (g.locations || [])) {
      if ((loc.locStorage || 0) < 150 && g.cash > 20000) {
        loc.locStorage = (loc.locStorage || 0) + 50;
        g.cash -= 5000;
      }
    }
  }

  // ── MARKETING — bots advertise their shops ──
  if (Math.random() < 0.02 * t && intensity >= 4) {
    for (const loc of (g.locations || [])) {
      if (!loc.marketing && g.cash > 15000) {
        loc.marketing = intensity >= 7 ? 'targeted' : 'local';
      }
    }
  }

  // Bank interest
  if (g.bankBalance > 0) {
    const interest = Math.round(g.bankBalance * (g.bankRate || 0.042) / 360);
    g.bankBalance += interest;
  }

  // Loan payments
  for (const loan of (g.loans || [])) {
    if (loan.remaining <= 0) continue;
    const dailyPmt = (loan.weeklyPayment || 0) / 7;
    const actual = Math.min(dailyPmt, loan.remaining, Math.max(0, g.cash));
    g.cash -= actual;
    loan.remaining -= actual;
  }
  g.loans = (g.loans || []).filter(l => l.remaining > 0);

  // ── TAKE OUT LOANS — aggressive bots borrow to expand ──
  if (intensity >= 6 && Math.random() < 0.01 * t && g.cash < 100000 && (g.loans || []).length < 2) {
    const loanAmt = intensity >= 8 ? 75000 : 25000;
    const rate = intensity >= 8 ? 0.07 : 0.095;
    g.loans = g.loans || [];
    g.loans.push({
      id: uid(), name: intensity >= 8 ? 'SBA' : 'Small Biz',
      amt: loanAmt, r: rate, remaining: loanAmt,
      weeklyPayment: Math.round(loanAmt * (1 + rate) / 52),
    });
    g.cash += loanAmt;
  }

  // ── SHOP EXPANSION — higher intensity expands faster ──
  const expandChance = intensity <= 3 ? 0.005 : intensity <= 6 ? 0.015 : 0.03 + t * 0.02;
  const expandCashThresh = intensity <= 3 ? 300000 : intensity <= 6 ? 200000 : 100000;
  const maxLocs = intensity <= 3 ? 3 : intensity <= 6 ? 6 : 10;
  if (Math.random() < expandChance && g.cash > expandCashThresh && (g.locations || []).length < maxLocs) {
    const city = CITIES[Ri(0, CITIES.length)];
    const cost = shopCost(city);
    if (g.cash > cost * 1.5) {
      g.cash -= cost;
      g.locations.push({
        id: uid(), cityId: city.id, locStorage: 0, inventory: {},
        loyalty: 0, openedDay: g.day,
        dailyStats: { rev: 0, sold: 0, profit: 0 },
        staff: { techs: 1, sales: 1, managers: 0 },
      });
    }
  }

  // ── STAFF HIRING — scales with intensity ──
  const hireChance = intensity <= 3 ? 0.02 : intensity <= 6 ? 0.05 : 0.10;
  if (Math.random() < hireChance) {
    for (const loc of (g.locations || [])) {
      if (!loc.staff) loc.staff = { techs: 1, sales: 1, managers: 0 };
      const maxTechs = intensity <= 3 ? 2 : intensity <= 6 ? 3 : 5;
      const maxSales = intensity <= 3 ? 1 : intensity <= 6 ? 2 : 4;
      if (loc.staff.techs < maxTechs && g.cash > 10000) {
        loc.staff.techs++;
        g.cash -= 3000;
      }
      if (loc.staff.sales < maxSales && g.cash > 8000) {
        loc.staff.sales++;
        g.cash -= 2500;
      }
      if (intensity >= 6 && !loc.staff.managers && g.cash > 15000) {
        loc.staff.managers = 1;
        g.cash -= 5000;
      }
    }
  }

  // ── WHOLESALE — bots unlock and use wholesale ──
  if (!g.hasWholesale && g.reputation >= 20 && intensity >= 4 && Math.random() < 0.05) {
    g.hasWholesale = true;
    g.wsClients = g.wsClients || [];
  }

  // Generate wholesale revenue for bots with wholesale
  if (g.hasWholesale && Math.random() < 0.1 + t * 0.15) {
    const wsRev = Math.floor(R(500, 3000) * t);
    g.cash += wsRev;
    g.totalWholesaleRevenue = (g.totalWholesaleRevenue || 0) + wsRev;
    g.monthlyPurchaseVol = (g.monthlyPurchaseVol || 0) + Math.floor(wsRev / 80);
    g.dayRev += wsRev;
    g.totalRev += wsRev;
    // Grow wholesale client list organically
    if (g.wsClients.length < intensity * 2 && Math.random() < 0.1) {
      g.wsClients.push({
        id: uid(),
        name: COMPANY_NAMES[Ri(0, COMPANY_NAMES.length)] || 'Local Shop',
        joinedDay: g.day,
        totalPurchased: 0,
      });
    }
  }

  // ── E-COMMERCE — high intensity bots unlock ecom ──
  if (!g.hasEcom && intensity >= 6 && g.reputation >= 30 && g.cash > 50000 && Math.random() < 0.03) {
    g.hasEcom = true;
    g.ecomStaff = g.ecomStaff || {};
    g.ecomUpgrades = g.ecomUpgrades || [];
  }

  // E-commerce revenue
  if (g.hasEcom && Math.random() < 0.15 + t * 0.1) {
    const ecomRev = Math.floor(R(200, 1500) * t);
    const ecomOrders = Ri(1, 5 + Math.floor(t * 5));
    g.ecomDailyOrders = ecomOrders;
    g.ecomDailyRev = ecomRev;
    g.cash += ecomRev;
    g.dayRev += ecomRev;
    g.totalRev += ecomRev;
  }

  // ── DISTRIBUTION — top bots unlock distribution ──
  if (!g.hasDist && intensity >= 8 && g.reputation >= 50 && (g.locations || []).length >= 5 && g.hasWholesale && g.cash > 600000 && Math.random() < 0.02) {
    g.hasDist = true;
    g.cash -= 500000;
    g.distClients = g.distClients || [];
    g.distCenters = g.distCenters || [];
  }

  // ── INSURANCE — moderate+ bots get insurance ──
  if (!g.insurance && intensity >= 5 && g.cash > 30000 && Math.random() < 0.02) {
    g.insurance = intensity >= 8 ? 'premium' : 'business';
  }

  // ── FLEA MARKET / VAN SALES — casual bots do these more ──
  if (intensity <= 5 && Math.random() < 0.08) {
    const fleaRev = Math.floor(R(100, 500));
    g.fleaMarketTotalSold = (g.fleaMarketTotalSold || 0) + Ri(2, 8);
    g.cash += fleaRev;
    g.dayRev += fleaRev;
    g.totalRev += fleaRev;
  }
  if (intensity <= 4 && Math.random() < 0.1) {
    const vanRev = Math.floor(R(50, 300));
    g.vanTotalSold = (g.vanTotalSold || 0) + Ri(1, 5);
    g.vanOnlyDays = (g.vanOnlyDays || 0) + 1;
    g.cash += vanRev;
  }

  // ── WEEKLY SNAPSHOT — for tournament tracking ──
  if (g.day % 7 === 0) {
    g.weeklySnapshot = {
      totalRev: g.totalRev,
      totalProfit: g.totalProfit,
      cash: g.cash,
      reputation: g.reputation,
    };
  }

  // ── EXPENSES — rent, staff payroll, insurance, marketing ──
  const locCount = (g.locations || []).length;
  const dailyRent = locCount * 4500 / 30;
  const dailyStaffCost = (g.locations || []).reduce((a, loc) => {
    const s = loc.staff || {};
    return a + ((s.techs || 0) * 3000 + (s.sales || 0) * 2500 + (s.managers || 0) * 5000) / 30;
  }, 0);
  const dailyInsurance = g.insurance === 'premium' ? 200 : g.insurance === 'business' ? 100 : 0;
  g.cash -= (dailyRent + dailyStaffCost + dailyInsurance);

  // Occasionally deposit to bank
  if (Math.random() < 0.1 && g.cash > 50000) {
    const deposit = Math.floor(g.cash * R(0.1, 0.3));
    g.cash -= deposit;
    g.bankBalance += deposit;
  }

  // Withdraw from bank if cash is low
  if (g.cash < 5000 && g.bankBalance > 10000) {
    const withdraw = Math.min(g.bankBalance, Math.floor(R(10000, 50000)));
    g.bankBalance -= withdraw;
    g.cash += withdraw;
  }

  // Round reputation
  g.reputation = Math.round(g.reputation * 100) / 100;

  // Keep cash non-negative
  if (g.cash < 0) g.cash = 0;

  // ── STOCK TRADING — bots participate in TESX ──
  if (g.stockExchange?.hasBrokerage && Math.random() < 0.15 && g.cash > 5000) {
    if (!g._aiTradeIntent) g._aiTradeIntent = {};
    g._aiTradeIntent.budget = Math.floor(g.cash * R(0.02, 0.08));
    g._aiTradeIntent.action = Math.random() < 0.6 ? 'buy' : 'sell';
  }

  // ── IPO — high intensity bots go public ──
  if (g.stockExchange?.hasBrokerage && !g.stockExchange.isPublic && intensity >= 7 && g.day > 100 && g.reputation >= 40 && g.cash > 200000 && Math.random() < 0.01) {
    g.stockExchange.isPublic = true;
    g.stockExchange.ipoDay = g.day;
    // Generate a ticker symbol from company name
    const words = (g.companyName || 'BOT').split(/\s+/);
    g.stockExchange.ticker = words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
    g.stockExchange.founderSharesLocked = g.day + 30;
  }

  // ── HISTORY TRACKING — for charts/sparklines ──
  g.history = g.history || [];
  if (g.day % 7 === 0) {
    g.history.push({ day: g.day, rev: g.dayRev, cash: g.cash, rep: g.reputation });
    if (g.history.length > 52) g.history.shift();
  }

  return g;
}
