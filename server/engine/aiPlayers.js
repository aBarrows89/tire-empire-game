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
      factory: null,
      fleaMarketStands: [],
      fleaMarketTotalSold: 0,
      carMeetAttendance: [],
      carMeetTotalSold: 0,
      carMeetsAttended: 0,
      vanTotalSold: 0,
      vanOnlyDays: 0,
      autoSuppliers: [],
      shopListings: [],
      shopBids: [],
      shopRevenueShares: [],
      shopInstallments: [],
      _events: [],
    },
  };
}

/**
 * Lightweight daily tick for AI players.
 * Grows their stats without running the full simDay.
 */
export function simAIPlayerDay(g) {
  g.day++;

  // Daily revenue — fluctuates around their level
  const baseRev = (g.locations || []).reduce((a, loc) => {
    const locRev = (loc.dailyStats?.rev || 0) * R(0.7, 1.3);
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

  // Slow reputation growth
  if (Math.random() < 0.15 && g.reputation < 95) {
    g.reputation = Math.min(100, g.reputation + R(0.05, 0.2));
  }

  // Loyalty growth at locations
  for (const loc of (g.locations || [])) {
    if (loc.loyalty < 95 && Math.random() < 0.2) {
      loc.loyalty = Math.min(100, loc.loyalty + R(0.1, 0.5));
    }
  }

  // ── INVENTORY REPLENISHMENT ──
  // AI players restock their locations periodically
  if (Math.random() < 0.3) {
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
    for (const loc of (g.locations || [])) {
      if (!loc.inventory) loc.inventory = {};
      const locTotal = Object.values(loc.inventory).reduce((a, b) => a + b, 0);
      const locCap = 50 + (loc.locStorage || 0);
      if (locTotal < locCap * 0.5) {
        // Restock with random tires
        const toAdd = Ri(5, Math.min(20, locCap - locTotal));
        for (let j = 0; j < toAdd; j++) {
          const k = tireKeys[Ri(0, tireKeys.length)];
          loc.inventory[k] = (loc.inventory[k] || 0) + 1;
        }
      }
    }
  }

  // ── PRICE ADJUSTMENTS ──
  // AI players occasionally adjust prices toward market competitive range
  if (Math.random() < 0.1) {
    for (const [k, t] of Object.entries(TIRES)) {
      if (!g.prices[k]) continue;
      // Drift toward default ±15%
      const target = t.def * R(0.85, 1.15);
      g.prices[k] = Math.round(g.prices[k] * 0.9 + target * 0.1);
      g.prices[k] = Math.max(t.lo, Math.min(t.hi, g.prices[k]));
    }
  }

  // ── WAREHOUSE INVENTORY ──
  // AI players restock their warehouse
  if (Math.random() < 0.2 && g.cash > 10000) {
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
    if (!g.warehouseInventory) g.warehouseInventory = {};
    const whTotal = Object.values(g.warehouseInventory).reduce((a, b) => a + b, 0);
    if (whTotal < 100) {
      const toAdd = Ri(10, 30);
      const cost = toAdd * 50; // ~$50/tire avg
      if (g.cash > cost) {
        g.cash -= cost;
        for (let j = 0; j < toAdd; j++) {
          const k = tireKeys[Ri(0, tireKeys.length)];
          g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + 1;
        }
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

  // Occasionally open new shop (every ~60 days, if they can afford it)
  if (Math.random() < 0.015 && g.cash > 200000 && (g.locations || []).length < 8) {
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

  // Occasionally hire staff for understaffed locations
  if (Math.random() < 0.05) {
    for (const loc of (g.locations || [])) {
      if (!loc.staff) loc.staff = { techs: 1, sales: 1, managers: 0 };
      if (loc.staff.techs < 3 && g.cash > 10000) {
        loc.staff.techs++;
        g.cash -= 3000;
      }
      if (loc.staff.sales < 2 && g.cash > 8000) {
        loc.staff.sales++;
        g.cash -= 2500;
      }
    }
  }

  // Occasionally deposit to bank
  if (Math.random() < 0.1 && g.cash > 50000) {
    const deposit = Math.floor(g.cash * R(0.1, 0.3));
    g.cash -= deposit;
    g.bankBalance += deposit;
  }

  // Round reputation
  g.reputation = Math.round(g.reputation * 100) / 100;

  return g;
}
