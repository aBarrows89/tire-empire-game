// ═══════════════════════════════════════════════════════════════
// BOT PLAYER CREATION — identity generation, personality system
// ═══════════════════════════════════════════════════════════════

import { uid } from '../../shared/helpers/random.js';
import { CITIES } from '../../shared/constants/cities.js';
import { TIRES } from '../../shared/constants/tires.js';
import { shopCost } from '../../shared/constants/shop.js';
import {
  FIRST_NAMES, LAST_NAMES, ADJECTIVES, SUFFIXES, COMPANY_PATTERNS,
  PERSONALITIES, PERSONALITY_KEYS, QUIRKS, INTENSITY_LEVELS, SCHEDULES,
} from '../../shared/constants/bots.js';

const R = (lo, hi) => lo + Math.random() * (hi - lo);
const Ri = (lo, hi) => Math.floor(R(lo, hi));
const pick = (arr) => arr[Ri(0, arr.length)];

// ── Weighted city selection (higher pop = more likely) ──
const cityWeights = CITIES.map(c => ({ city: c, weight: Math.sqrt(c.pop || 1) }));
const totalWeight = cityWeights.reduce((s, cw) => s + cw.weight, 0);

function pickWeightedCity(exclude = new Set()) {
  let remaining = 100; // safety
  while (remaining-- > 0) {
    let r = Math.random() * totalWeight;
    for (const cw of cityWeights) {
      r -= cw.weight;
      if (r <= 0) {
        if (!exclude.has(cw.city.id)) return cw.city;
        break;
      }
    }
  }
  // Fallback: random city
  return CITIES[Ri(0, CITIES.length)];
}

// ── Name generation ──
const usedCompanyNames = new Set();

function generateCompanyName(homeCity) {
  let name = null;
  let attempts = 0;
  while (!name || usedCompanyNames.has(name)) {
    if (attempts++ > 50) {
      // Fallback: add a number suffix
      name = `${pick(ADJECTIVES)} Tire ${pick(SUFFIXES)} #${Ri(100, 999)}`;
      break;
    }
    const pattern = pick(COMPANY_PATTERNS);
    const firstName1 = pick(FIRST_NAMES);
    let firstName2 = pick(FIRST_NAMES);
    while (firstName2 === firstName1) firstName2 = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);

    name = pattern
      .replace('{city}', homeCity?.name || pick(CITIES).name)
      .replace('{lastName}', lastName)
      .replace('{adj}', pick(ADJECTIVES))
      .replace('{suffix}', pick(SUFFIXES))
      .replace('{firstName}', firstName1)
      .replace('{firstName2}', firstName2);
  }
  usedCompanyNames.add(name);
  return name;
}

function generatePlayerName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

// ── Assign personality ──
function assignPersonality() {
  return pick(PERSONALITY_KEYS);
}

// ── Assign 1-2 quirks ──
function assignQuirks(personality) {
  const count = Math.random() < 0.4 ? 2 : 1;
  const available = [...QUIRKS];
  const selected = [];

  // Filter out conflicting quirks based on personality
  const filtered = available.filter(q => {
    if (personality === 'conservative' && q.id === 'reckless_expansion') return false;
    if (personality === 'empire_builder' && q.id === 'no_loans') return false;
    if (personality === 'hoarder' && q.id === 'panic_seller') return false;
    return true;
  });

  for (let i = 0; i < count && filtered.length > 0; i++) {
    const idx = Ri(0, filtered.length);
    selected.push(filtered[idx]);
    filtered.splice(idx, 1);
  }
  return selected.map(q => q.id);
}

// ── Determine activity schedule with randomness ──
function assignSchedule(intensity) {
  const level = INTENSITY_LEVELS[intensity] || INTENSITY_LEVELS[5];
  const base = level.schedule;

  // Apply randomness: 20% chance to deviate one level
  if (Math.random() < 0.2) {
    const options = ['casual', 'regular', 'hardcore', 'whale'];
    const idx = options.indexOf(base);
    const shift = Math.random() < 0.5 ? -1 : 1;
    const newIdx = Math.max(0, Math.min(options.length - 1, idx + shift));
    return options[newIdx];
  }
  return base;
}

/**
 * Create a new bot player with full personality system.
 * Returns { id, game_state } ready to be stored.
 */
export function createBot(options = {}) {
  const {
    intensity = 5,
    personality: forcedPersonality = null,
    adminId = 'system',
    startDayOffset = null,  // null = random based on intensity
  } = options;

  const i = Math.max(1, Math.min(11, intensity));
  const t = i / 11; // normalized 0.09-1.0
  const level = INTENSITY_LEVELS[i] || INTENSITY_LEVELS[5];

  // Identity
  const homeCity = pickWeightedCity();
  const companyName = generateCompanyName(homeCity);
  const playerName = generatePlayerName();
  const personality = forcedPersonality || assignPersonality();
  const quirks = assignQuirks(personality);
  const schedule = assignSchedule(i);
  const pWeights = PERSONALITIES[personality]?.weights || PERSONALITIES.conservative.weights;

  // Start day offset — makes bots appear to have joined at different times
  const day = startDayOffset != null
    ? startDayOffset
    : i <= 3 ? Ri(1, 30) : i <= 6 ? Ri(20, 150) : Ri(50, 400);

  // Scale starting resources by intensity
  const cash = Math.floor(R(2000, 10000) + t * R(50000, 500000));
  const reputation = Math.min(100, Math.floor(t * R(30, 85)));
  const bankBalance = i > 3 ? Math.floor(R(5000, 50000) * t) : 0;

  // Locations — personality and intensity driven
  let maxLocs = level.shopMax;
  if (pWeights.expansionDrive > 1.5) maxLocs = Math.min(maxLocs + 2, 15);
  if (pWeights.expansionDrive < 0.5) maxLocs = Math.max(1, Math.floor(maxLocs * 0.5));

  const numLocations = i <= 1 ? 0 : i <= 3 ? Ri(0, Math.min(2, maxLocs + 1))
    : i <= 6 ? Ri(1, Math.min(4, maxLocs + 1))
    : Ri(2, Math.min(maxLocs + 1, 8));

  const locations = [];
  const usedCities = new Set();

  // Regional king: cluster shops in home city's state
  const isRegional = pWeights.regionalFocus;

  for (let idx = 0; idx < numLocations; idx++) {
    let city;
    if (idx === 0) {
      city = homeCity;
    } else if (isRegional) {
      // Try to pick a city in the same state
      const sameState = CITIES.filter(c => c.state === homeCity.state && !usedCities.has(c.id));
      city = sameState.length > 0 ? pick(sameState) : pickWeightedCity(usedCities);
    } else {
      city = pickWeightedCity(usedCities);
    }
    if (usedCities.has(city.id)) continue;
    usedCities.add(city.id);

    const loyalty = Math.min(100, Math.floor(R(5, 25) + t * R(20, 55)));
    const dailyRev = Math.floor(R(200, 600) + t * R(500, 4000));
    const inv = {};
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
    for (let j = 0; j < Ri(3, 7); j++) {
      const k = pick(tireKeys);
      inv[k] = Ri(3, 15 + Math.floor(t * 35));
    }

    locations.push({
      id: uid(), cityId: city.id,
      locStorage: Ri(0, 2 + Math.floor(t * 3)) * 50,
      inventory: inv, loyalty,
      openedDay: Math.max(1, day - Ri(10, 200)),
      dailyStats: { rev: dailyRev, sold: Math.floor(dailyRev / 80), profit: Math.floor(dailyRev * 0.35) },
      staff: {
        techs: Ri(1, 2 + Math.floor(t * 3)),
        sales: Ri(1, 1 + Math.floor(t * 2)),
        managers: i > 5 ? Ri(0, 2) : 0,
      },
    });
  }

  // Pricing — personality + intensity driven
  const prices = {};
  for (const [k, tire] of Object.entries(TIRES)) {
    const priceMod = pWeights.priceAboveMarket || 0;
    const skill = level.pricingSkill;

    if (skill >= 0.7) {
      // Skilled pricing: tighter range around optimal
      prices[k] = Math.round(tire.def * (1 + priceMod + R(-0.05, 0.05)));
    } else if (skill <= 0.3) {
      // Poor pricing: wide random range
      prices[k] = Math.round(tire.def * R(0.80, 1.20));
    } else {
      // Average pricing
      prices[k] = Math.round(tire.def * (1 + priceMod + R(-0.10, 0.10)));
    }
    prices[k] = Math.max(tire.lo, Math.min(tire.hi, prices[k]));
  }

  // Revenue history
  const totalRev = Math.floor(R(5000, 30000) + t * R(100000, 1500000));
  const totalProfit = Math.floor(totalRev * R(0.2, 0.4));
  const totalSold = Math.floor(totalRev / R(60, 120));
  const dayRev = Math.floor(R(100, 400) + t * R(500, 5000));
  const dayProfit = Math.floor(dayRev * R(0.25, 0.4));

  // Warehouse inventory
  const warehouseInventory = {};
  if (i > 2) {
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
    for (let j = 0; j < Ri(2, 6); j++) {
      const k = pick(tireKeys);
      warehouseInventory[k] = Ri(5, 25 + Math.floor(t * 80));
    }
  }

  const storage = [{ type: 'van', id: uid() }];
  if (i > 2) storage.push({ type: i > 6 ? 'warehouse' : 'garage', id: uid() });

  // Loans — personality driven
  const loans = [];
  const wantsLoan = pWeights.loanWillingness > 0.5 && Math.random() < pWeights.loanWillingness * 0.3;
  if (wantsLoan && i > 3) {
    const amt = i > 6 ? 75000 : 25000;
    loans.push({
      id: uid(), name: i > 6 ? 'SBA' : 'Small Biz',
      amt, r: i > 6 ? 0.07 : 0.095,
      remaining: Math.floor(R(amt * 0.2, amt * 0.8)),
      weeklyPayment: Math.round(amt * (1 + (i > 6 ? 0.07 : 0.095)) / 52),
    });
  }

  const id = uid(); // Regular ID — no ai- prefix

  return {
    id,
    game_state: {
      id, name: playerName, companyName,
      _botConfig: {
        intensity: i,
        personality,
        quirks,
        schedule,
        homeCityId: homeCity.id,
        homeState: homeCity.state,
        createdBy: adminId,
        createdAt: Date.now(),
        lastActionTick: 0,
        ticksUntilAction: 0,
        chatCooldown: Ri(5, 30),  // days until first chat
        mistakeCounter: 0,
      },
      day, startDay: 1,
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
      loans, warehouseInventory,
      hasWarehouse: storage.length > 1,
      disposalFee: 3,
      bankBalance, bankRate: 0.042,
      bankInterestEarned: 0, bankTotalInterest: 0,
      unlockedSources: ['scrapYard', 'garageCleanout', 'fleaMarket'],
      unlockedSuppliers: i > 3 ? ['budget_wholesale'] : [],
      unlockedMfgs: [],
      hasWholesale: i > 4, wsClients: [], monthlyPurchaseVol: 0,
      hasEcom: i > 6 || (pWeights.ecomPriority && i > 4),
      ecomStaff: {}, ecomUpgrades: [], ecomTotalSpent: 0,
      ecomDailyOrders: 0, ecomDailyRev: 0,
      marketplaceSpecialist: i > 3, marketplaceChannels: [],
      hasDist: i > 8, distClients: [], distCenters: [],
      tpoContracts: [], returnDeals: [], govContracts: [],
      fleetOffers: [], installers: [], isInstaller: false,
      liquidationListings: [],
      log: [], achievements: {},
      tireCoins: Math.floor(t * R(5, 80)),
      tutorialStep: 0, tutorialDone: true,
      vinnieSeen: [], aiShops: [], history: [],
      prevDayRev: dayRev, prevDayProfit: dayProfit, prevDaySold: 0,
      prevCash: cash, prevRep: reputation,
      insurance: i > 5 ? (i > 8 ? 'premium' : 'business') : null,
      retreadQueue: [], supplierRelationships: {},
      pendingLot: null, marketShare: {}, pendingImports: [],
      weeklySnapshot: null, hasFranchise: false, franchiseTemplates: [],
      hasFactory: i >= 9 || (pWeights.factoryPriority && i >= 7),
      factory: (i >= 9 || (pWeights.factoryPriority && i >= 7)) ? {
        level: i >= 10 ? 2 : 1,
        brandName: companyName + ' Tires',
        productionQueue: [], dailyCapacity: i >= 10 ? 150 : 50,
        qualityRating: 0.80 + t * 0.1, brandReputation: Math.floor(t * 40),
        rawMaterials: { rubber: 1.0, steel: 1.0, chemicals: 1.0 },
        currentLine: null, switchCooldown: 0,
        isDistributor: i >= 10,
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
 * Create multiple bots at once.
 */
export function createBots(count, options = {}) {
  const bots = [];
  for (let i = 0; i < count; i++) {
    // Vary intensity around the target if not fixed
    let intensity = options.intensity || 8;
    if (!options.fixedIntensity) {
      intensity = Math.max(4, Math.min(11, intensity + Ri(-2, 3)));
    }
    bots.push(createBot({ ...options, intensity }));
  }
  return bots;
}
