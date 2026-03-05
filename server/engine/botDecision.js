// ═══════════════════════════════════════════════════════════════
// BOT DECISION ENGINE — per-tick decision-making with personality,
// intensity scaling, human-like mistakes, chat, stock exchange
// ═══════════════════════════════════════════════════════════════

import { uid } from '../../shared/helpers/random.js';
import { CITIES } from '../../shared/constants/cities.js';
import { TIRES } from '../../shared/constants/tires.js';
import { shopCost } from '../../shared/constants/shop.js';
import {
  PERSONALITIES, QUIRKS, INTENSITY_LEVELS, SCHEDULES,
  CHAT_TEMPLATES, REPLY_TEMPLATES, PERSONALITY_VOICE,
  FIRST_NAMES, LAST_NAMES, COMPANY_PATTERNS,
} from '../../shared/constants/bots.js';

const R = (lo, hi) => lo + Math.random() * (hi - lo);
const Ri = (lo, hi) => Math.floor(R(lo, hi));
const pick = (arr) => arr[Ri(0, arr.length)];

// ── ACTIVITY SCHEDULE CHECK ──

/**
 * Determine if this bot should act this tick.
 * Returns true if it's time to act.
 */
function shouldAct(bot) {
  const cfg = bot._botConfig;
  if (!cfg) return false;

  const sched = SCHEDULES[cfg.schedule] || SCHEDULES.regular;

  if (cfg.ticksUntilAction > 0) {
    cfg.ticksUntilAction--;
    return false;
  }

  // Set next action delay
  cfg.ticksUntilAction = Ri(sched.minSkip, sched.maxSkip + 1);
  cfg.lastActionTick = Date.now();
  return true;
}

/**
 * Execute queued admin directives (one per tick).
 * Called at top of runBotTick before personality-driven decisions.
 */
function executeBotDirectives(g) {
  const cfg = g._botConfig;
  if (!cfg?.overrides?.directives?.length) return;

  const directive = cfg.overrides.directives.shift();
  if (!directive) return;

  // Log directive execution
  if (!cfg.recentActions) cfg.recentActions = [];
  cfg.recentActions.push({ type: directive.type, day: g.day, ts: Date.now() });
  if (cfg.recentActions.length > 20) cfg.recentActions = cfg.recentActions.slice(-20);

  const p = directive.params || {};

  switch (directive.type) {
    case 'dump_inventory': {
      const discount = (p.discountPct || 50) / 100;
      for (const [k, v] of Object.entries(g.prices || {})) {
        g.prices[k] = Math.floor(v * (1 - discount));
      }
      break;
    }
    case 'sell_shop': {
      if (g.locations?.length > 1) {
        g.locations.pop();
        g.cash += 50000;
      }
      break;
    }
    case 'go_bankrupt': {
      g.cash = -100000;
      g.reputation = Math.max(0, (g.reputation || 0) - 30);
      break;
    }
    case 'buy_spree': {
      const budget = p.budget || 50000;
      const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
      let spent = 0;
      while (spent < budget && g.cash > 5000) {
        const k = tireKeys[Math.floor(Math.random() * tireKeys.length)];
        const cost = (TIRES[k]?.bMax || 80) * 10;
        if (g.cash < cost) break;
        g.cash -= cost;
        spent += cost;
        if (!g.warehouseInventory) g.warehouseInventory = {};
        g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + 10;
      }
      break;
    }
    case 'crash_stock': {
      if (g.stockExchange?.portfolio) {
        for (const [ticker, pos] of Object.entries(g.stockExchange.portfolio)) {
          if (pos.qty > 0) {
            // Queue a sell order at low price
            g.stockExchange.openOrders = g.stockExchange.openOrders || [];
            g.stockExchange.openOrders.push({
              id: uid(), type: 'sell', ticker, qty: pos.qty,
              price: Math.floor((pos.avgCost || 100) * 0.5),
              placedDay: g.day,
            });
          }
        }
      }
      break;
    }
    case 'ipo': {
      if (g.stockExchange && !g.stockExchange.isPublic) {
        g.stockExchange.isPublic = true;
        g.stockExchange.ipoDay = g.day;
        g.stockExchange.ticker = (g.companyName || 'BOT').slice(0, 4).toUpperCase();
      }
      break;
    }
    case 'hoard_tc': {
      // Spend cash on TC (simulated)
      const tcBuy = Math.min(5, Math.floor(g.cash / 50000));
      if (tcBuy > 0) {
        g.tireCoins = (g.tireCoins || 0) + tcBuy;
        g.cash -= tcBuy * 50000;
      }
      break;
    }
    case 'chat': {
      // Queue a chat message (handled by chat system)
      if (p.message) {
        _pendingBotChats.push({
          id: uid(),
          playerId: g.id,
          playerName: g.companyName || g.name || 'Bot',
          channel: 'global',
          text: p.message,
          timestamp: Date.now(),
        });
      }
      break;
    }
    case 'set_cash': {
      if (p.amount != null) g.cash = p.amount;
      break;
    }
    case 'set_rep': {
      if (p.amount != null) g.reputation = Math.max(0, Math.min(100, p.amount));
      break;
    }
    case 'add_shop': {
      const cities = Object.values(CITIES).flat ? CITIES : [];
      if (Array.isArray(CITIES) && CITIES.length > 0) {
        const city = CITIES[Math.floor(Math.random() * CITIES.length)];
        g.locations = g.locations || [];
        g.locations.push({
          id: uid(), cityId: city.id, locStorage: 0, inventory: {},
          name: city.name || 'Shop', marketing: null,
        });
        g.cash -= shopCost(city);
      }
      break;
    }
    case 'close_all_shops': {
      const refund = (g.locations || []).length * 25000;
      g.locations = [];
      g.cash += refund;
      break;
    }
    default:
      break;
  }
}

/**
 * Run all bot decisions for one tick.
 * Called from tickLoop.js for each bot player.
 * Returns the modified game state.
 */
export function runBotTick(g, shared, allPlayers) {
  if (!g._botConfig) return g;

  const cfg = g._botConfig;

  // Skip if individually paused by admin
  // Note: simDay already ran before this function, so day is already incremented
  // and the real economic simulation (sales, revenue, expenses) already happened
  if (cfg.paused) {
    return g;
  }

  const intensity = cfg.intensity || 5;
  const level = INTENSITY_LEVELS[intensity] || INTENSITY_LEVELS[5];
  const personality = cfg.personality || 'conservative';
  const pWeights = PERSONALITIES[personality]?.weights || PERSONALITIES.conservative.weights;
  const t = intensity / 11;

  // ═══ PRIORITY 0: ADMIN DIRECTIVES ═══
  executeBotDirectives(g);

  // Check activity schedule
  if (!shouldAct(g)) {
    // simDay already handled the economic simulation for this tick
    // Bot just isn't making active decisions (buying, expanding, etc.)
    return g;
  }

  // simDay already ran — day incremented, revenue earned, expenses paid
  // Now run bot DECISIONS on top of the simulated state

  // ═══ PRIORITY 1: SURVIVAL CHECKS ═══
  runSurvival(g, cfg, t);

  // ═══ PRIORITY 2: PERSONALITY-DRIVEN ACTIONS ═══
  runPersonalityActions(g, cfg, pWeights, personality, t, intensity, level, shared);

  // ═══ PRIORITY 3: INTENSITY-SCALED OPTIMIZATION ═══
  runOptimizations(g, cfg, pWeights, t, intensity, level, shared);

  // ═══ PRIORITY 4: HUMAN NOISE (MISTAKES) ═══
  if (Math.random() < level.mistakeRate) {
    runMistake(g, cfg, intensity);
  }

  // ═══ STOCK EXCHANGE ACTIVITY ═══
  runStockExchange(g, cfg, pWeights, t, intensity, allPlayers, shared);

  // ═══ P2P CONTRACT DECISIONS ═══
  botContractDecision(g, shared, allPlayers);

  // ═══ CHAT MESSAGES ═══
  runChat(g, cfg, pWeights, shared);

  // Whale schedule: extra actions
  const sched = SCHEDULES[cfg.schedule];
  if (sched?.multiAction) {
    runPersonalityActions(g, cfg, pWeights, personality, t, intensity, level, shared);
    runOptimizations(g, cfg, pWeights, t, intensity, level, shared);
  }

  // History tracking
  g.history = g.history || [];
  if (g.day % 7 === 0) {
    g.history.push({ day: g.day, rev: g.dayRev, cash: g.cash, rep: g.reputation });
    if (g.history.length > 52) g.history.shift();
  }

  return g;
}

// ═══════════════════════════════════════
// SURVIVAL
// ═══════════════════════════════════════

function runSurvival(g, cfg, t) {
  // Withdraw from bank if cash is critically low
  if (g.cash < 2000 && g.bankBalance > 5000) {
    const withdraw = Math.min(g.bankBalance, Math.floor(R(10000, 50000)));
    g.bankBalance -= withdraw;
    g.cash += withdraw;
  }

  // If near bankruptcy with shops, panic mode
  if (g.cash < 500 && (g.locations || []).length > 0) {
    // Try to close weakest shop
    if (g.locations.length > 1) {
      const weakest = g.locations.reduce((min, loc) =>
        (loc.dailyStats?.rev || 0) < (min.dailyStats?.rev || 0) ? loc : min
      );
      g.locations = g.locations.filter(l => l.id !== weakest.id);
      g.cash += Math.floor(shopCost(CITIES.find(c => c.id === weakest.cityId) || {}) * 0.3); // Fire sale
    }
  }
}

// ═══════════════════════════════════════
// PERSONALITY-DRIVEN ACTIONS
// ═══════════════════════════════════════

function runPersonalityActions(g, cfg, pw, personality, t, intensity, level, shared) {
  const quirks = new Set(cfg.quirks || []);

  // ── PURCHASING ──
  if (Math.random() < 0.2 * pw.buyFrequency + t * 0.15) {
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);

    // Bargain hunter: only buy when supplier prices are low
    if (pw.bargainOnly && shared?.supplierPricing) {
      const avgMult = Object.values(shared.supplierPricing).reduce((s, v) => s + (v || 1), 0) / Math.max(1, Object.keys(shared.supplierPricing).length);
      if (avgMult > 0.95) return; // Prices not low enough
    }

    for (const loc of (g.locations || [])) {
      if (!loc.inventory) loc.inventory = {};
      const locTotal = Object.values(loc.inventory).reduce((a, b) => a + b, 0);
      const locCap = 50 + (loc.locStorage || 0);
      const targetFill = locCap * pw.inventoryTarget * 0.5;

      if (locTotal < targetFill) {
        const toAdd = Ri(5, Math.min(25 + Math.floor(t * 15), locCap - locTotal));
        const costPer = 50 + Math.floor(t * 30);
        const totalCost = toAdd * costPer;

        if (g.cash > totalCost * 1.5) {
          g.cash -= totalCost;
          for (let j = 0; j < toAdd; j++) {
            let k;
            // Quirk: used tire preference
            if (quirks.has('used_only') && Math.random() < 0.7) {
              const usedKeys = Object.keys(TIRES).filter(key => TIRES[key].used);
              k = pick(usedKeys);
            } else {
              k = pick(tireKeys);
            }
            loc.inventory[k] = (loc.inventory[k] || 0) + 1;
          }
        }
      }
    }

    // Hoarder: also fill warehouse
    if (personality === 'hoarder' && Math.random() < 0.3 && g.cash > 20000) {
      if (!g.warehouseInventory) g.warehouseInventory = {};
      const whTotal = Object.values(g.warehouseInventory).reduce((a, b) => a + b, 0);
      if (whTotal < (50 + intensity * 30) * pw.inventoryTarget) {
        const toAdd = Ri(15, 40);
        const cost = toAdd * 55;
        if (g.cash > cost) {
          g.cash -= cost;
          for (let j = 0; j < toAdd; j++) {
            const k = pick(tireKeys);
            g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + 1;
          }
        }
      }
    }

    // Quirk: impulse buyer — random bulk purchase
    if (quirks.has('impulse_buyer') && Math.random() < 0.05 && g.cash > 50000) {
      const k = pick(tireKeys);
      const qty = Ri(50, 150);
      const cost = qty * (TIRES[k]?.bMax || 80);
      if (g.cash > cost) {
        g.cash -= cost;
        if (!g.warehouseInventory) g.warehouseInventory = {};
        g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + qty;
      }
    }
  }

  // ── PRICING ──
  const repriceChance = quirks.has('daily_reprice') ? 0.8 : (0.05 + level.pricingSkill * 0.15);
  if (Math.random() < repriceChance) {
    for (const [k, tire] of Object.entries(TIRES)) {
      if (!g.prices[k]) continue;
      const priceMod = pw.priceAboveMarket || 0;

      // Quirk: overprices premium tires
      let quirkMod = 0;
      if (quirks.has('overprices_premium') && (tire.premium || k === 'luxuryTouring' || k === 'premiumAllWeather')) {
        quirkMod = 0.15;
      }

      let target;
      if (level.pricingSkill >= 0.7) {
        // Demand-aware pricing with seasonal adjustments
        const seasonMod = (tire.seas && shared?.season === 'winter') ? 0.15 : 0;
        target = tire.def * (1 + priceMod + quirkMod + seasonMod + R(-0.03, 0.03));
      } else if (level.pricingSkill <= 0.3) {
        // Random pricing
        target = tire.def * R(0.80, 1.20);
      } else {
        target = tire.def * (1 + priceMod + quirkMod + R(-0.08, 0.08));
      }

      // Smooth adjustment (don't reprice perfectly)
      g.prices[k] = Math.round(g.prices[k] * 0.8 + target * 0.2);
      g.prices[k] = Math.max(tire.lo, Math.min(tire.hi, g.prices[k]));
    }
  }

  // ── EXPANSION ──
  const expandChance = level.expansionRate * pw.expansionDrive;
  if (Math.random() < expandChance && (g.locations || []).length < level.shopMax) {
    const cashThreshold = pw.expansionDrive > 1.5 ? 80000 : pw.expansionDrive < 0.5 ? 400000 : 200000;

    // Quirk: reckless expansion overrides threshold
    const threshold = quirks.has('reckless_expansion') ? cashThreshold * 0.3 : cashThreshold;

    if (g.cash > threshold) {
      let city;
      if (pw.regionalFocus) {
        const sameState = CITIES.filter(c =>
          c.state === cfg.homeState &&
          !(g.locations || []).some(l => l.cityId === c.id)
        );
        city = sameState.length > 0 ? pick(sameState) : CITIES[Ri(0, CITIES.length)];
      } else {
        city = CITIES[Ri(0, CITIES.length)];
      }

      const cost = shopCost(city);
      if (g.cash > cost * 1.3) {
        g.cash -= cost;
        g.locations = g.locations || [];
        g.locations.push({
          id: uid(), cityId: city.id, locStorage: 0, inventory: {},
          loyalty: 0, openedDay: g.day,
          dailyStats: { rev: 0, sold: 0, profit: 0 },
          staff: { techs: 1, sales: 1, managers: 0 },
        });
      }
    }
  }

  // ── HIRING ──
  if (Math.random() < 0.05 + t * 0.08) {
    for (const loc of (g.locations || [])) {
      if (!loc.staff) loc.staff = { techs: 1, sales: 1, managers: 0 };
      const maxTechs = intensity <= 3 ? 2 : intensity <= 6 ? 3 : 5;
      const maxSales = intensity <= 3 ? 1 : intensity <= 6 ? 2 : 4;

      // Quirk: over-hire techs
      const techMax = quirks.has('tech_heavy') ? maxTechs + 2 : maxTechs;

      if (loc.staff.techs < techMax && g.cash > 10000) {
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

  // ── LOANS ──
  if (!quirks.has('no_loans') && pw.loanWillingness > 0.3) {
    if (intensity >= 4 && Math.random() < 0.01 * pw.loanWillingness && g.cash < 100000 && (g.loans || []).length < 2) {
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
  }

  // ── BANKING ──
  // Quirk: heavy saver
  const saveThreshold = quirks.has('cash_stuffer') ? 10000 : 50000;
  const savePct = quirks.has('cash_stuffer') ? R(0.5, 0.8) : R(0.1, 0.3);
  if (Math.random() < 0.1 && g.cash > saveThreshold) {
    const deposit = Math.floor(g.cash * savePct);
    g.cash -= deposit;
    g.bankBalance += deposit;
  }
}

// ═══════════════════════════════════════
// INTENSITY-SCALED OPTIMIZATIONS
// ═══════════════════════════════════════

function runOptimizations(g, cfg, pw, t, intensity, level, shared) {
  // ── Wholesale unlock ──
  if (!g.hasWholesale && g.reputation >= 20 && intensity >= 4 && Math.random() < 0.05) {
    g.hasWholesale = true;
    g.wsClients = g.wsClients || [];
  }

  // ── Wholesale revenue ──
  if (g.hasWholesale && Math.random() < 0.1 + t * 0.15) {
    const wsRev = Math.floor(R(500, 3000) * t);
    g.cash += wsRev;
    g.totalWholesaleRevenue = (g.totalWholesaleRevenue || 0) + wsRev;
    g.monthlyPurchaseVol = (g.monthlyPurchaseVol || 0) + Math.floor(wsRev / 80);
    g.dayRev += wsRev;
    g.totalRev += wsRev;
    if (g.wsClients.length < intensity * 2 && Math.random() < 0.1) {
      g.wsClients.push({
        id: uid(),
        name: `${pick(LAST_NAMES)} Tire Shop`,
        joinedDay: g.day, totalPurchased: 0,
      });
    }
  }

  // ── E-commerce ──
  const ecomFocused = pw.ecomPriority;
  if (!g.hasEcom && intensity >= (ecomFocused ? 4 : 6) && g.reputation >= (ecomFocused ? 20 : 30) && g.cash > 50000 && Math.random() < 0.03) {
    g.hasEcom = true;
  }
  if (g.hasEcom && Math.random() < 0.15 + t * 0.1) {
    const mult = ecomFocused ? 1.5 : 1.0;
    const ecomRev = Math.floor(R(200, 1500) * t * mult);
    const ecomOrders = Ri(1, 5 + Math.floor(t * 5));
    g.ecomDailyOrders = ecomOrders;
    g.ecomDailyRev = ecomRev;
    g.cash += ecomRev;
    g.dayRev += ecomRev;
    g.totalRev += ecomRev;
  }

  // ── Distribution ──
  if (!g.hasDist && intensity >= 8 && g.reputation >= 50 && (g.locations || []).length >= 5 && g.hasWholesale && g.cash > 600000 && Math.random() < 0.02) {
    g.hasDist = true;
    g.cash -= 500000;
    g.distClients = g.distClients || [];
    g.distCenters = g.distCenters || [];
  }

  // ── Insurance ──
  const quirks = new Set(cfg.quirks || []);
  if (!quirks.has('insurance_skipper') && !g.insurance && intensity >= 5 && g.cash > 30000 && Math.random() < 0.02) {
    g.insurance = intensity >= 8 ? 'premium' : 'business';
  }

  // ── Storage upgrades ──
  if (Math.random() < 0.03 * t && g.cash > 50000) {
    const whTotal = Object.values(g.warehouseInventory || {}).reduce((a, b) => a + b, 0);
    const storageTypes = g.storage || [];
    const currentMax = storageTypes.reduce((a, s) => a + (s.type === 'warehouse' ? 500 : s.type === 'garage' ? 200 : 50), 0);
    if (whTotal > currentMax * 0.7 && storageTypes.length < 3 + intensity) {
      const nextType = currentMax < 200 ? 'garage' : 'warehouse';
      const cost = nextType === 'warehouse' ? 30000 : 8000;
      if (g.cash > cost * 2) {
        g.cash -= cost;
        g.storage.push({ type: nextType, id: uid() });
        g.hasWarehouse = true;
      }
    }
  }

  // ── Location storage upgrades ──
  if (Math.random() < 0.02 * t) {
    for (const loc of (g.locations || [])) {
      if ((loc.locStorage || 0) < 150 && g.cash > 20000) {
        loc.locStorage = (loc.locStorage || 0) + 50;
        g.cash -= 5000;
      }
    }
  }

  // ── Marketing ──
  if (Math.random() < 0.02 * t && intensity >= 4) {
    const heavy = quirks.has('marketing_obsessed');
    for (const loc of (g.locations || [])) {
      if (!loc.marketing && g.cash > (heavy ? 5000 : 15000)) {
        loc.marketing = intensity >= 7 ? 'targeted' : 'local';
      }
    }
  }

  // ── Factory path (factory dreamer prioritizes this) ──
  if (pw.factoryPriority && !g.hasFactory && g.reputation >= 70 && g.cash > 3500000 && Math.random() < 0.03) {
    g.hasFactory = true;
    g.cash -= 3500000;
    g.factory = {
      level: 1, brandName: g.companyName + ' Tires',
      productionQueue: [], dailyCapacity: 50,
      qualityRating: 0.82, brandReputation: 10,
      rawMaterials: { rubber: 1.0, steel: 1.0, chemicals: 1.0 },
      currentLine: null, switchCooldown: 0, isDistributor: false,
      discountTiers: [{ min: 0, disc: 0, label: 'Standard' }],
      wholesalePrices: { allSeason: 85, performance: 120, winter: 110 },
      mapPrices: {}, minOrders: {}, rdProjects: [],
      unlockedSpecials: [], certifications: [],
      totalWholesaleRev: 0, totalWholesaleOrders: 0,
      customerList: [], orderHistory: [],
      vinnieInventory: {}, vinnieTotalLoss: 0, hasCFO: false,
    };
  }

  // ── IPO ──
  if (g.stockExchange?.hasBrokerage && !g.stockExchange.isPublic && intensity >= 7 && g.day > 100 && g.reputation >= 40 && g.cash > 200000 && Math.random() < 0.01) {
    g.stockExchange.isPublic = true;
    g.stockExchange.ipoDay = g.day;
    const words = (g.companyName || 'BOT').split(/\s+/);
    g.stockExchange.ticker = words.map(w => w[0]).join('').toUpperCase().slice(0, 4);
    g.stockExchange.founderSharesLocked = g.day + 30;
  }
}

// ═══════════════════════════════════════
// HUMAN-LIKE MISTAKES
// ═══════════════════════════════════════

function runMistake(g, cfg, intensity) {
  cfg.mistakeCounter = (cfg.mistakeCounter || 0) + 1;
  const roll = Math.random();

  if (roll < 0.2 && g.cash > 30000) {
    // Overbuy inventory before demand is there
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
    const k = pick(tireKeys);
    const qty = Ri(30, 80);
    const cost = qty * (TIRES[k]?.bMax || 80);
    if (g.cash > cost) {
      g.cash -= cost;
      if (!g.warehouseInventory) g.warehouseInventory = {};
      g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + qty;
    }
  } else if (roll < 0.35 && g.loans?.length > 0) {
    // Miss a loan payment (just skip it this tick — creates slight debt drift)
    // Already handled by not paying — just don't process loan this tick
  } else if (roll < 0.5 && g.locations?.length > 0) {
    // Misprice a tire type for a few ticks
    const k = pick(Object.keys(TIRES));
    const tire = TIRES[k];
    if (g.prices[k]) {
      const badPrice = Math.random() < 0.5
        ? Math.round(tire.def * R(1.25, 1.50))   // Way too high
        : Math.round(tire.def * R(0.50, 0.70));   // Way too low
      g.prices[k] = Math.max(tire.lo, Math.min(tire.hi, badPrice));
    }
  } else if (roll < 0.65 && g.bankBalance > 20000) {
    // Withdraw too much from bank on a whim
    const excess = Math.floor(g.bankBalance * R(0.3, 0.6));
    g.bankBalance -= excess;
    g.cash += excess;
  } else if (roll < 0.80) {
    // Hire when they shouldn't (overstaffing)
    const loc = g.locations?.[0];
    if (loc && g.cash > 5000) {
      if (!loc.staff) loc.staff = { techs: 1, sales: 1, managers: 0 };
      loc.staff.techs++;
      g.cash -= 3000;
    }
  }
  // else: no mistake this tick (sometimes the "mistake" is doing nothing)
}

// ═══════════════════════════════════════
// STOCK EXCHANGE
// ═══════════════════════════════════════

function runStockExchange(g, cfg, pw, t, intensity, allPlayers, shared) {
  if (!g.stockExchange?.hasBrokerage || intensity < 5) return;

  const tradeChance = 0.05 * pw.stockTradeFreq;
  if (Math.random() > tradeChance) return;

  // Set trade intent for the exchange tick to process
  if (!g._aiTradeIntent) g._aiTradeIntent = {};

  // React to market conditions (crash/rally detection)
  const exchange = shared?.exchange;
  const crashActive = exchange?.sentiment?.crashActive;
  const sentimentValue = exchange?.sentiment?.value || 50;
  const isRally = sentimentValue > 70;
  const isBearish = sentimentValue < 30;

  let buyBias = 0.6; // Default: 60% chance to buy
  if (crashActive || isBearish) {
    // Panic sell on crashes — shift bias toward selling
    buyBias = pw.stockTradeFreq >= 3 ? 0.35 : 0.20; // Speculators buy the dip more
    const quirks = new Set(cfg.quirks || []);
    if (quirks.has('stock_diamond_hands')) buyBias = 0.5; // Hold steady
  } else if (isRally) {
    // FOMO buy on rallies — shift bias toward buying
    buyBias = pw.stockTradeFreq >= 3 ? 0.85 : 0.75;
  }

  if (Math.random() < buyBias) {
    // Buy stocks
    g._aiTradeIntent.action = 'buy';
    g._aiTradeIntent.budget = Math.floor(g.cash * R(0.02, 0.08));

    // Speculator: bigger budget
    if (pw.stockTradeFreq >= 3) {
      g._aiTradeIntent.budget = Math.floor(g.cash * R(0.05, 0.15));
    }

    // FOMO buying on rallies: increase budget
    if (isRally) {
      g._aiTradeIntent.budget = Math.floor(g._aiTradeIntent.budget * R(1.2, 1.8));
    }
  } else {
    // Sell stocks
    g._aiTradeIntent.action = 'sell';
    const quirks = new Set(cfg.quirks || []);
    // Quirk: diamond hands — never sell
    if (quirks.has('stock_diamond_hands')) {
      g._aiTradeIntent.action = 'hold';
      return;
    }
    g._aiTradeIntent.sellPct = R(0.1, 0.3);

    // Panic selling on crashes: sell more aggressively
    if (crashActive) {
      g._aiTradeIntent.sellPct = R(0.3, 0.7);
    }
  }

  // Limit orders (intensity 7+)
  if (intensity >= 7 && Math.random() < 0.3) {
    g._aiTradeIntent.orderType = 'limit';
    g._aiTradeIntent.limitOffset = R(-0.05, 0.05); // ±5% of current price
  }
}

// ═══════════════════════════════════════
// CHAT MESSAGES
// ═══════════════════════════════════════

// Pending chat messages to be posted after bot ticks
const _pendingBotChats = [];
let _botChatBudget = 0;  // Messages remaining for this tick cycle

export function resetBotChatBudget() {
  _botChatBudget = Ri(5, 12); // 5-12 messages per day across all bots
}

export function getPendingBotChats() {
  const msgs = [..._pendingBotChats];
  _pendingBotChats.length = 0;
  return msgs;
}

function runChat(g, cfg, pw, shared) {
  if (_botChatBudget <= 0) return;
  if (cfg.chatCooldown > 0) {
    cfg.chatCooldown--;
    return;
  }

  // Higher base chance — bots should chat regularly to feel alive
  const chatChance = 0.05 * (pw.chatFrequency || 1);
  if (Math.random() > chatChance) return;

  // Decide: reply to someone or post original message?
  const recentMessages = shared.recentChatMessages || [];
  let msg = null;
  let replyTo = null;

  // 40% chance to reply if there are recent messages from other players
  const otherMessages = recentMessages.filter(m => m.playerId !== g.id);
  if (otherMessages.length > 0 && Math.random() < 0.4) {
    const result = generateReply(g, cfg, otherMessages, shared);
    if (result) {
      msg = result.text;
      replyTo = result.replyTo;
    }
  }

  // Otherwise generate an original message
  if (!msg) {
    msg = generateChatMessage(g, cfg, shared);
  }

  if (!msg) return;

  const chatMsg = {
    id: uid(),
    playerId: g.id,
    playerName: g.companyName || g.name || 'Unknown',
    channel: 'global',
    text: msg,
    timestamp: Date.now(),
  };

  // Add reply metadata if replying to someone
  if (replyTo) {
    chatMsg.replyTo = {
      id: replyTo.id,
      playerName: replyTo.playerName,
      text: (replyTo.text || '').slice(0, 80),
    };
  }

  _pendingBotChats.push(chatMsg);
  _botChatBudget--;

  // Set cooldown (social butterflies chat again sooner)
  cfg.chatCooldown = pw.chatFrequency >= 3 ? Ri(1, 4) : Ri(3, 12);
}

function generateReply(g, cfg, recentMessages, shared) {
  // Pick a message to reply to (prefer more recent, prefer real players)
  const weighted = recentMessages.map((m, i) => ({
    msg: m,
    weight: (recentMessages.length - i) * (m.isBot ? 0.3 : 1.0), // Prefer real players, prefer recent
  }));
  const totalWeight = weighted.reduce((a, w) => a + w.weight, 0);
  let roll = Math.random() * totalWeight;
  let target = weighted[0].msg;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) { target = w.msg; break; }
  }

  const text = (target.text || '').toLowerCase();
  const personality = cfg.personality || 'conservative';
  const intensity = cfg.intensity || 5;

  // Classify the message and pick a reply category
  let category = null;

  // Is it a question?
  if (text.includes('?') || text.startsWith('how') || text.startsWith('what') || text.startsWith('when') || text.startsWith('anyone')) {
    category = 'question_response';
  }
  // Is it bragging / milestone?
  else if (text.includes('just hit') || text.includes('finally') || text.includes('best month') || text.includes('top 3') || text.includes('going public') || text.includes('revenue')) {
    category = Math.random() < 0.6 ? 'congratulate' : 'competitive';
  }
  // Is it a complaint?
  else if (text.includes('killing') || text.includes('tanked') || text.includes('struggling') || text.includes('can\'t') || text.includes('insane') || text.includes('robbery')) {
    category = Math.random() < 0.7 ? 'agree' : 'helpful';
  }
  // Generic — just agree or add to the conversation
  else {
    category = pick(['agree', 'helpful', 'disagree']);
  }

  // Personality adjustments
  if (personality === 'social_butterfly') {
    // Social butterflies are more likely to congratulate and agree
    if (category === 'disagree') category = 'agree';
    if (category === 'competitive') category = 'congratulate';
  } else if (personality === 'empire_builder' || personality === 'speculator') {
    // Competitive types are more likely to talk trash
    if (category === 'congratulate' && Math.random() < 0.4) category = 'competitive';
  } else if (personality === 'conservative') {
    // Conservatives give helpful advice
    if (category === 'competitive') category = 'helpful';
  }

  const templates = REPLY_TEMPLATES[category];
  if (!templates || templates.length === 0) return null;

  let template = pick(templates);

  // Fill variables
  const city = g.locations?.[0] ? CITIES.find(c => c.id === g.locations[0].cityId)?.name || 'my city' : 'the market';
  template = template
    .replace(/{city}/g, city)
    .replace(/{company}/g, g.companyName || 'My company')
    .replace(/{shopCount}/g, String((g.locations || []).length));

  // Sometimes @mention the person they're replying to
  if (Math.random() < 0.3) {
    template = `@${target.playerName} ${template}`;
  }

  // Apply personality voice
  template = applyPersonalityVoice(template, personality);

  return { text: template, replyTo: target };
}

function generateChatMessage(g, cfg, shared) {
  // Pick category based on context
  const categories = [];

  // Milestone messages if near a milestone
  if (g.reputation >= 24 && g.reputation < 26) categories.push('milestone');
  if (g.totalRev >= 90000 && g.totalRev < 110000) categories.push('milestone');
  if ((g.locations || []).length > 0 && g.day < 60) categories.push('milestone');
  if (g.hasFactory && g.day % 30 < 2) categories.push('milestone');
  if (g.hasWholesale && g.day % 20 < 2) categories.push('milestone');

  // Complaints when things are tough
  if (g.dayRev < g.prevDayRev * 0.6) categories.push('complaint');
  if (g.cash < 5000) categories.push('complaint');
  if (g.dayProfit < 0) categories.push('complaint');

  // Reactions to global events
  if ((shared?.globalEvents || []).length > 0) categories.push('reaction');

  // Bragging when doing well
  if (g.dayRev > 5000) categories.push('bragging');
  if ((g.locations || []).length >= 3) categories.push('bragging');
  if (g.reputation > 50) categories.push('bragging');

  // Trash talk from competitive personalities
  const personality = cfg.personality || 'conservative';
  if (['empire_builder', 'flipper', 'speculator'].includes(personality)) {
    categories.push('trash_talk');
  }

  // Casual messages — always a possibility
  categories.push('casual');
  categories.push('casual');

  // Default: questions
  categories.push('question');
  categories.push('question');

  const category = pick(categories);
  const templates = CHAT_TEMPLATES[category] || CHAT_TEMPLATES.question;
  let template = pick(templates);

  // Fill in template variables
  const city = g.locations?.[0] ? CITIES.find(c => c.id === g.locations[0].cityId)?.name || 'my city' : 'the market';
  const shopOrdinal = ['1st', '2nd', '3rd', '4th', '5th'][(g.locations || []).length - 1] || `${(g.locations || []).length}th`;
  const nextUnlock = g.reputation < 25 ? 'Wholesale' : g.reputation < 30 ? 'E-commerce' : g.reputation < 75 ? 'Factory' : 'Legend status';
  const ticker = g.stockExchange?.ticker || (g.companyName || 'CO').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 4);

  template = template
    .replace(/{city}/g, city)
    .replace(/{rep}/g, String(Math.floor(g.reputation)))
    .replace(/{revenue}/g, formatCash(g.totalRev))
    .replace(/{company}/g, g.companyName || 'My company')
    .replace(/{shopOrdinal}/g, shopOrdinal)
    .replace(/{nextUnlock}/g, nextUnlock)
    .replace(/{ticker}/g, ticker)
    .replace(/{weeklyRev}/g, formatCash(g.dayRev * 7))
    .replace(/{monthlyRev}/g, formatCash(g.dayRev * 30))
    .replace(/{shopCount}/g, String((g.locations || []).length))
    .replace(/{loyalty}/g, String(Math.floor(g.locations?.[0]?.loyalty || 0)))
    .replace(/{wsRev}/g, formatCash(Math.floor(R(500, 3000) * (cfg.intensity || 5) / 10)))
    .replace(/{rent}/g, formatCash(7000))
    .replace(/{tcValue}/g, formatCash(shared?.tcValue || 10000))
    .replace(/{day}/g, String(g.day || 0));

  // Apply personality voice
  template = applyPersonalityVoice(template, personality);

  return template;
}

function applyPersonalityVoice(text, personality) {
  const voice = PERSONALITY_VOICE[personality];
  if (!voice) return text;

  // Sometimes add a personality-specific prefix
  if (voice.prefix && Math.random() < 0.2) {
    const prefix = pick(voice.prefix);
    if (prefix) text = prefix + text.charAt(0).toLowerCase() + text.slice(1);
  }

  // Sometimes add a personality-specific suffix
  if (voice.suffix && Math.random() < 0.15) {
    const suffix = pick(voice.suffix);
    if (suffix) text = text + suffix;
  }

  // Apply word transforms
  if (voice.transforms) {
    for (const [from, to] of Object.entries(voice.transforms)) {
      if (text.toLowerCase().includes(from) && Math.random() < 0.5) {
        text = text.replace(new RegExp(from, 'i'), to);
      }
    }
  }

  return text;
}

function formatCash(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.floor(n / 1000)}K`;
  return String(Math.floor(n));
}

// ═══════════════════════════════════════
// PASSIVE UPKEEP (runs every tick even when bot doesn't "act")
// ═══════════════════════════════════════

function runPassiveUpkeep(g, t) {
  const intensity = g._botConfig?.intensity || 5;
  const revMult = intensity <= 3 ? R(0.6, 0.8) : intensity <= 6 ? R(0.9, 1.1) : R(1.2, 1.5);

  // Daily revenue from locations
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

  // Service revenue
  if ((g.locations || []).length > 0) {
    const serviceRev = Math.floor(R(50, 200) * t * g.locations.length);
    g.dayServiceRev = serviceRev;
    g.dayServiceJobs = Math.floor(serviceRev / 25);
    g.totalServiceRev = (g.totalServiceRev || 0) + serviceRev;
    g.cash += serviceRev;
    g.dayRev += serviceRev;
    g.totalRev += serviceRev;
  }

  // Reputation growth
  const repChance = intensity <= 3 ? 0.05 : intensity <= 6 ? 0.15 : 0.30;
  const repGrowth = intensity <= 3 ? R(0.02, 0.1) : intensity <= 6 ? R(0.05, 0.2) : R(0.1, 0.4);
  if (Math.random() < repChance && g.reputation < 95) {
    g.reputation = Math.min(100, g.reputation + repGrowth);
  }

  // Loyalty growth
  for (const loc of (g.locations || [])) {
    if (loc.loyalty < 95 && Math.random() < 0.1 + t * 0.2) {
      loc.loyalty = Math.min(100, loc.loyalty + R(0.1, 0.3 + t * 0.3));
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

  // Expenses
  const locCount = (g.locations || []).length;
  const dailyRent = locCount * 4500 / 30;
  const dailyStaffCost = (g.locations || []).reduce((a, loc) => {
    const s = loc.staff || {};
    return a + ((s.techs || 0) * 3000 + (s.sales || 0) * 2500 + (s.managers || 0) * 5000) / 30;
  }, 0);
  const dailyInsurance = g.insurance === 'premium' ? 200 : g.insurance === 'business' ? 100 : 0;
  g.cash -= (dailyRent + dailyStaffCost + dailyInsurance);

  // Van/flea sales for casual bots
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

  // Weekly snapshot
  if (g.day % 7 === 0) {
    g.weeklySnapshot = { totalRev: g.totalRev, totalProfit: g.totalProfit, cash: g.cash, reputation: g.reputation };
  }

  // Round reputation
  g.reputation = Math.round(g.reputation * 100) / 100;
  if (g.cash < 0) g.cash = 0;
}

// ═══════════════════════════════════════
// BOT CONTRACT AI — respond to / initiate P2P contracts
// ═══════════════════════════════════════

const CONTRACT_DM_TEMPLATES = {
  conservative: {
    open: "We'd like to discuss a supply arrangement for {tire}. We're looking for {qty} units.",
    counter: "We appreciate your proposal. Would you consider ${price}/unit instead?",
    accept: "Deal accepted. Looking forward to working together.",
    deny: "We'll have to pass on this one for now. Thank you for the offer.",
  },
  aggressive: {
    open: "Let's do business! Need {qty} {tire} ASAP. Best price wins.",
    counter: "Gotta do better than that. ${price} max, take it or leave it.",
    accept: "Done. Ship 'em out.",
    deny: "Not interested. Too expensive.",
  },
  balanced: {
    open: "Looking to source {qty} {tire}. Interested in a contract?",
    counter: "How about we meet in the middle at ${price}?",
    accept: "Contract confirmed. Good doing business.",
    deny: "Thanks but we'll pass this time.",
  },
  adventurous: {
    open: "Hey! Crazy idea - want to supply us {qty} {tire}? Could be huge!",
    counter: "What if we tried ${price}? I think we can make this work!",
    accept: "YES! Let's go! Contract signed!",
    deny: "Nah, doesn't feel right this time. Maybe next round!",
  },
  opportunist: {
    open: "I see you have capacity. {qty} {tire} - what's your best number?",
    counter: "Market rate says ${price}. Fair for both sides.",
    accept: "Agreed. Efficient terms for both parties.",
    deny: "Margins don't work. Will revisit if prices change.",
  },
};

/**
 * Bot contract decision-making. Called during bot tick.
 * Responds to pending proposals and occasionally initiates new ones.
 */
export function botContractDecision(g, shared, allPlayers) {
  if (!g._botConfig) return;
  const cfg = g._botConfig;
  const personality = cfg.personality || 'conservative';
  const intensity = cfg.intensity || 5;

  // ── Respond to pending contract proposals (with human-like delay) ──
  const pending = (g.p2pContracts || []).filter(c =>
    (c.status === 'proposed' || c.status === 'countered') &&
    c.proposedBy !== (c.buyerId === g.id ? 'buyer' : 'seller')
  );

  for (const contract of pending) {
    // Wait 1-3 days before responding
    const waitDays = 1 + Math.floor(Math.random() * 3);
    if (!contract._botSeenDay) {
      contract._botSeenDay = g.day;
      continue;
    }
    if (g.day - contract._botSeenDay < waitDays) continue;

    // Analyze the deal
    const terms = contract.terms;
    const productionCost = 50; // Rough estimate
    const margin = terms.pricePerUnit - productionCost;
    const marginPercent = margin / productionCost;

    // Decision based on personality
    let decision;
    if (personality === 'aggressive' && marginPercent > 0.1) {
      decision = 'accept';
    } else if (personality === 'conservative' && marginPercent > 0.3) {
      decision = 'accept';
    } else if (personality === 'opportunist' && marginPercent > 0.15) {
      decision = 'accept';
    } else if (personality === 'balanced' && marginPercent > 0.2) {
      decision = 'accept';
    } else if (personality === 'adventurous' && Math.random() < 0.5) {
      decision = 'accept';
    } else if (contract.counterCount < 3 && marginPercent > 0) {
      decision = 'counter';
    } else {
      decision = 'deny';
    }

    if (decision === 'accept') {
      contract.status = 'active';
      contract.activatedDay = g.day;
      // Set up factory allocations if seller
      if (contract.sellerId === g.id && g.factory) {
        if (!g.factory.contractAllocations) g.factory.contractAllocations = {};
        if (!g.factory.contractStaging) g.factory.contractStaging = {};
        const allocPercent = Math.min(15, 85 - (g.factory.totalAllocatedPercent || 0));
        if (allocPercent >= 5) {
          g.factory.contractAllocations[contract.id] = {
            contractId: contract.id, tireType: terms.tireType,
            percent: allocPercent, autoRun: true, remainingQty: terms.qty,
          };
          g.factory.contractStaging[contract.id] = 0;
          g.factory.totalAllocatedPercent = (g.factory.totalAllocatedPercent || 0) + allocPercent;
        }
      }
    } else if (decision === 'counter') {
      // Counter with slightly adjusted price
      const adjustment = personality === 'aggressive' ? 0.9 : personality === 'conservative' ? 1.1 : 1.0;
      contract.terms.pricePerUnit = Math.round(terms.pricePerUnit * adjustment);
      contract.status = 'countered';
      contract.proposedBy = contract.buyerId === g.id ? 'buyer' : 'seller';
      contract.counterCount++;
    } else {
      contract.status = 'denied';
    }
    delete contract._botSeenDay;
  }

  // ── Initiate proposals to real players (~2% chance per tick) ──
  if (g.hasFactory && g.factory && Math.random() < 0.02 * (intensity / 5)) {
    const capacity = g.factory.dailyCapacity || 80;
    const allocated = g.factory.totalAllocatedPercent || 0;
    const spareCapacity = capacity * (85 - allocated) / 100;

    if (spareCapacity > 10) {
      const realPlayers = allPlayers.filter(p => !p.game_state._botConfig && !p.game_state.isAI && p.id !== g.id);
      if (realPlayers.length > 0) {
        const target = realPlayers[Math.floor(Math.random() * realPlayers.length)];
        const producibleTires = Object.keys(TIRES).filter(k => !TIRES[k].used && k !== 'used_junk');
        const tire = producibleTires[Math.floor(Math.random() * producibleTires.length)];
        const qty = Math.floor(spareCapacity * 30 * 0.5); // Half of spare capacity for 30 days

        if (qty >= 200) {
          const newContract = {
            id: uid(),
            buyerId: target.id,
            buyerName: target.game_state.companyName || target.game_state.name || 'Unknown',
            sellerId: g.id,
            sellerName: g.companyName || g.name || 'Unknown',
            status: 'proposed',
            proposedBy: 'seller',
            terms: {
              tireType: tire, qty,
              pricePerUnit: Math.round((TIRES[tire]?.bMax || 80) * 0.85),
              paymentTerms: 'on_delivery', durationDays: 90,
              batchSize: Math.ceil(qty / 10),
              deliveryFee: 2, commission: 0.02,
            },
            counterCount: 0,
            createdDay: g.day,
            expiresDay: g.day + 7,
            deliveredQty: 0, stagedQty: 0, totalPaid: 0,
          };

          g.p2pContracts = g.p2pContracts || [];
          g.p2pContracts.push(newContract);

          // Also add to target's state (will be synced on next save)
          target.game_state.p2pContracts = target.game_state.p2pContracts || [];
          target.game_state.p2pContracts.push({ ...newContract });
        }
      }
    }
  }
}

// ═══════════════════════════════════════
// BOT PHASE-OUT
// ═══════════════════════════════════════

/**
 * Determine which bots should be phased out based on real player count.
 * Returns array of bot player IDs to remove.
 */
export function getBotPhaseOutTargets(botPlayers, realPlayerCount, config = {}) {
  const {
    botToRealRatio = 3,
    minBots = 2,
  } = config;

  const targetBotCount = Math.max(minBots, Math.floor(realPlayerCount * botToRealRatio));
  const excess = botPlayers.length - targetBotCount;

  if (excess <= 0) return [];

  // Remove weakest bots first (lowest wealth)
  const sorted = [...botPlayers].sort((a, b) => {
    const wa = (a.game_state?.cash || 0) + (a.game_state?.bankBalance || 0);
    const wb = (b.game_state?.cash || 0) + (b.game_state?.bankBalance || 0);
    return wa - wb;
  });

  // Remove max 1 per tick to make it gradual
  return sorted.slice(0, Math.min(1, excess)).map(p => p.id);
}
