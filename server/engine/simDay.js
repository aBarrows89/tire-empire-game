import { R, Rf, C } from '../../shared/helpers/format.js';
import { getSeason, getSI } from '../../shared/helpers/season.js';
import { getCap, getInv, getLocInv, getLocCap, rebuildGlobalInv } from '../../shared/helpers/inventory.js';
import { getWealth } from '../../shared/helpers/wealth.js';
import { getVolTier, getWsVolBonus, getWsMargin, getWsAvailSpace } from '../../shared/helpers/wholesale.js';
import { getEcomTier } from '../../shared/helpers/ecommerce.js';
import { getWhPayroll, getWhShortage } from '../../shared/helpers/warehouse.js';
import { SD } from '../../shared/constants/seasons.js';
import { TIRES } from '../../shared/constants/tires.js';
import { STORAGE } from '../../shared/constants/storage.js';
import { PAY } from '../../shared/constants/staff.js';
import { SHOP_MO, shopRent } from '../../shared/constants/shop.js';
import { CITIES } from '../../shared/constants/cities.js';
import { CORP_PAY } from '../../shared/constants/corporate.js';
import { EVENTS } from '../../shared/constants/events.js';
import { SERVICES } from '../../shared/constants/services.js';
import {
  ECOM_BASE_CONVERSION, ECOM_BASE_RETURN_RATE, ECOM_PAYMENT_FEE,
  ECOM_SHIP_COST_RANGE, ECOM_NATIONAL_MARKET, ECOM_HOSTING_BASE,
  ECOM_HOSTING_SCALE, ECOM_STAFF, ECOM_UPGRADES,
} from '../../shared/constants/ecommerce.js';
import { MARKETPLACE, MARKETPLACE_WEEKLY_DEMAND } from '../../shared/constants/marketplace.js';
import { TPO_BRANDS } from '../../shared/constants/tpoBrands.js';
import { WS_DELIVERY_COST, WS_STORAGE_COST } from '../../shared/constants/wholesale.js';
import { DIST_MONTHLY } from '../../shared/constants/distribution.js';
import { INSTALLER_NET } from '../../shared/constants/installerNet.js';
import { EVENT_HANDLERS } from './events.js';
import { LOYALTY } from '../../shared/constants/loyalty.js';
import { MARKETING } from '../../shared/constants/marketing.js';
import { INSURANCE, EVENT_INSURANCE_MAP } from '../../shared/constants/insurance.js';
import { RETREADING } from '../../shared/constants/retreading.js';
import { SUPPLIER_REL_TIERS, getSupplierRelTier } from '../../shared/constants/supplierRelations.js';
import { ACHIEVEMENTS } from '../../shared/constants/achievements.js';
import { FACTORY } from '../../shared/constants/factory.js';
import { MANUFACTURERS } from '../../shared/constants/manufacturers.js';
import { getHolidayMult } from '../../shared/constants/holidays.js';
import { getTireSeasonMult } from '../../shared/constants/tireSeasonal.js';
import { FLEA_MARKETS, FLEA_DAILY_OPERATING, FLEA_PRICE_MULT } from '../../shared/constants/fleaMarkets.js';
import { CAR_MEETS, CAR_MEET_SUMMER_START, CAR_MEET_SUMMER_END, CAR_MEET_PREMIUM_TIRES } from '../../shared/constants/carMeets.js';
import { getCalendar } from '../../shared/helpers/calendar.js';
import { getShopValuation, SHOP_BID, AI_BUYER_NAMES } from '../../shared/constants/shopSale.js';
import { uid } from '../../shared/helpers/random.js';

/**
 * Simulate one game DAY. Pure function — no side effects.
 * Converted from weekly simulation. All economic values scaled to daily.
 *
 * @param {object} g - Current player game state
 * @param {object} shared - Shared economy state (aiShops, liquidation, etc.)
 * @returns {object} New player game state
 */

/**
 * Pull qty of a tire from warehouse first, then largest location.
 */
function pullFromStock(s, tire, qty) {
  let pulled = 0;
  const wh = s.warehouseInventory || {};
  if (wh[tire] > 0) {
    const take = Math.min(wh[tire], qty);
    wh[tire] -= take;
    pulled += take;
  }
  if (pulled < qty) {
    const sorted = [...s.locations].sort((a, b) => (b.inventory?.[tire] || 0) - (a.inventory?.[tire] || 0));
    for (const loc of sorted) {
      if (pulled >= qty) break;
      if (!loc.inventory || !loc.inventory[tire]) continue;
      const take = Math.min(loc.inventory[tire], qty - pulled);
      loc.inventory[tire] -= take;
      pulled += take;
    }
  }
  return pulled;
}

export function simDay(g, shared = {}) {
  let s = { ...g, day: g.day + 1, dayRev: 0, dayProfit: 0, daySold: 0, log: [], _events: [], dayRevByChannel: { shops: 0, flea: 0, carMeets: 0, ecom: 0, wholesale: 0, gov: 0, van: 0, services: 0 } };

  // Save previous day values for trend arrows
  s.prevDayRev = g.dayRev || 0;
  s.prevDayProfit = g.dayProfit || 0;
  s.prevDaySold = g.daySold || 0;
  s.prevCash = Math.floor(g.cash || 0);
  s.prevRep = g.reputation || 0;

  // Backward compat: migrate week-based state to day-based
  if (s.week && !s.startDay) {
    s.day = s.week; // treat old weeks as days
    delete s.week;
  }

  // Deep-clone mutable nested objects
  s.locations = s.locations.map(l => ({ ...l, inventory: { ...(l.inventory || {}) } }));
  s.warehouseInventory = { ...(s.warehouseInventory || {}) };

  // Migration: ensure per-location inventory is populated
  const globalInv = Object.values(s.inventory).reduce((a, b) => a + b, 0);
  const whInvTotal = Object.values(s.warehouseInventory).reduce((a, b) => a + b, 0);
  const anyLocHasInv = s.locations.some(l => Object.values(l.inventory).some(v => v > 0));
  if (globalInv > 0 && whInvTotal === 0 && !anyLocHasInv) {
    const target = s.locations.length > 0 && !s.hasWarehouse
      ? s.locations[0].inventory
      : s.warehouseInventory;
    for (const [k, v] of Object.entries(s.inventory)) {
      if (v > 0) target[k] = (target[k] || 0) + v;
    }
  }

  // ── IMPORT ARRIVALS ──
  if (s.pendingImports && s.pendingImports.length > 0) {
    const arriving = s.pendingImports.filter(imp => s.day >= imp.arrivalDay);
    s.pendingImports = s.pendingImports.filter(imp => s.day < imp.arrivalDay);
    for (const imp of arriving) {
      s.warehouseInventory[imp.tire] = (s.warehouseInventory[imp.tire] || 0) + imp.qty;
      s.log.push({ msg: `📦 Import arrived: ${imp.qty} ${TIRES[imp.tire]?.n || imp.tire}`, cat: 'source' });
    }
  }

  // ── TIRE RETREADING COMPLETIONS ──
  if (s.retreadQueue && s.retreadQueue.length > 0) {
    const completed = s.retreadQueue.filter(r => s.day >= r.completionDay);
    s.retreadQueue = s.retreadQueue.filter(r => s.day < r.completionDay);
    let successCount = 0, failCount = 0;
    for (const r of completed) {
      const rate = (RETREADING.successRate && RETREADING.successRate[r.tire]) || 0.75;
      if (Math.random() < rate) {
        s.warehouseInventory[RETREADING.outputGrade] = (s.warehouseInventory[RETREADING.outputGrade] || 0) + 1;
        successCount++;
      } else {
        failCount++;
      }
    }
    if (successCount > 0 || failCount > 0) {
      s.log.push({ msg: `♻️ Retreading: ${successCount} success, ${failCount} failed`, cat: 'source' });
    }
  }

  // ── FACTORY PRODUCTION ──
  if (s.hasFactory && s.factory) {
    s.factory = { ...s.factory, productionQueue: [...(s.factory.productionQueue || [])], staff: { ...(s.factory.staff || { lineWorkers: 0, inspectors: 0, engineers: 0, manager: 0 }) } };
    const fStaff = s.factory.staff;
    const managerBoost = 1 + (fStaff.manager || 0) * 0.20;

    // Production completions — apply defect rate
    const completed = s.factory.productionQueue.filter(q => s.day >= q.completionDay);
    s.factory.productionQueue = s.factory.productionQueue.filter(q => s.day < q.completionDay);
    let producedTotal = 0;
    for (const q of completed) {
      // Defect rate: base 15%, reduced by inspectors (2% each), min 1%
      const defectRate = Math.max(FACTORY.minDefectRate, FACTORY.baseDefectRate - (fStaff.inspectors || 0) * 0.02);
      const goodQty = Math.max(1, Math.floor(q.qty * (1 - defectRate)));
      s.warehouseInventory[q.tire] = (s.warehouseInventory[q.tire] || 0) + goodQty;
      producedTotal += goodQty;
      if (goodQty < q.qty) {
        s.log.push({ msg: `\u{1F3ED} Factory produced ${goodQty}/${q.qty} ${TIRES[q.tire]?.n || q.tire} (${q.qty - goodQty} defective)`, cat: 'sale' });
      } else {
        s.log.push({ msg: `\u{1F3ED} Factory produced ${goodQty} ${TIRES[q.tire]?.n || q.tire}`, cat: 'sale' });
      }
    }

    // R&D: passive quality improvement from engineers + production experience
    const qualityCap = (FACTORY.levels.find(l => l.level === s.factory.level) || FACTORY.levels[0]).qualityMax;
    const qualityGain = ((fStaff.engineers || 0) * 0.0002 + producedTotal * 0.00001) * managerBoost;
    s.factory.qualityRating = Math.min(qualityCap, (s.factory.qualityRating || 0.80) + qualityGain);

    // Brand reputation grows with sales volume and quality
    s.factory.brandReputation = Math.min(100, (s.factory.brandReputation || 0) + producedTotal * 0.01 * (s.factory.qualityRating || 0.80));

    // Effective daily capacity = level base + line workers
    s.factory.dailyCapacity = (FACTORY.levels.find(l => l.level === s.factory.level) || FACTORY.levels[0]).dailyCapacity + (fStaff.lineWorkers || 0) * 10;

    // Factory overhead
    s.cash -= (FACTORY.monthlyOverhead || 50000) / 30;

    // Factory staff payroll
    const factoryPayroll = Object.entries(fStaff).reduce((a, [role, count]) => {
      const staffDef = FACTORY.staff[role];
      return a + (staffDef ? staffDef.salary * count : 0);
    }, 0) / 30;
    s.cash -= factoryPayroll;
  }

  const season = getSeason(s.day);
  const si = getSI(s.day);
  const sDem = SD[season] || 1;

  // Holiday demand modifier
  const holiday = getHolidayMult(s.day);
  const holidayMult = holiday.mult;
  if (holiday.name) {
    s.log.push({ msg: `\u{1F389} ${holiday.name}! Demand ${holidayMult > 1 ? `${holidayMult}x boost` : `${holidayMult}x (reduced)`}`, cat: 'event' });
  }

  // ── RANDOM EVENTS (scaled: 1/7 chance since daily instead of weekly) ──
  const totalStaff = Object.values(s.staff).reduce((a, v) => a + v, 0);
  const usedInv = Object.entries(s.inventory)
    .filter(([k]) => k.startsWith('used_'))
    .reduce((a, [, v]) => a + v, 0);

  const GATE_CHECK = {
    hasSupplierOrLoc: () => (s.unlockedSuppliers || []).length > 0 || s.locations.length > 0,
    hasRep:           () => s.reputation > 0,
    hasTechs:         () => s.staff.techs > 0,
    hasLocations:     () => s.locations.length > 0,
    hasUsedInv:       () => usedInv > 0,
    hasSupplier:      () => (s.unlockedSuppliers || []).length > 0,
    hasSold:          () => (s.totalSold || 0) > 0,
    hasLocOrRep:      () => s.locations.length > 0 || s.reputation > 3,
    hasStaff:         () => totalStaff > 0,
    hasJunk:          () => (s.inventory.used_junk || 0) > 10,
  };

  for (let i = 0; i < EVENTS.length; i++) {
    const ev = EVENTS[i];
    if (Math.random() < (ev.ch || 0) / 7) { // ÷7 for daily frequency
      if (ev.s !== undefined && ev.s !== si && ev.s !== 0) continue;
      if (ev.gate && GATE_CHECK[ev.gate] && !GATE_CHECK[ev.gate]()) continue;
      // Insurance check
      const coverKey = EVENT_INSURANCE_MAP[i];
      const ins = s.insurance && INSURANCE[s.insurance];
      if (coverKey && ins && ins.covers.includes(coverKey)) {
        s._events.push(ev.t);
        s.log.push({ msg: `${ev.t} — COVERED by insurance!`, cat: 'event' });
        continue;
      }
      s = EVENT_HANDLERS[i](s);
      s._events.push(ev.t);
      s.log.push({ msg: ev.t, cat: 'event' });
    }
  }

  // ── AUTO-FILL STORES FROM WAREHOUSE (requires drivers) ──
  const driverCount = s.staff.drivers || 0;
  if (driverCount > 0 && s.locations.length > 0) {
    const driverCap = driverCount * 40; // 40 tires per driver per day
    let moved = 0;
    for (const loc of s.locations) {
      if (moved >= driverCap) break;
      if (!loc.inventory) loc.inventory = {};
      const locFree = getLocCap(loc) - getLocInv(loc);
      if (locFree <= 0) continue;
      const toMove = Math.min(locFree, driverCap - moved);
      // Move tires from warehouse to this location
      for (const [k, whQty] of Object.entries(s.warehouseInventory)) {
        if (moved >= driverCap || toMove <= 0) break;
        if (whQty <= 0) continue;
        const take = Math.min(whQty, toMove - (getLocCap(loc) - getLocInv(loc) < 0 ? 0 : getLocCap(loc) - getLocInv(loc)), driverCap - moved);
        if (take <= 0) continue;
        s.warehouseInventory[k] -= take;
        loc.inventory[k] = (loc.inventory[k] || 0) + take;
        moved += take;
      }
    }
    if (moved > 0) {
      s.log.push({ msg: `\u{1F69A} Drivers moved ${moved} tires from warehouse to stores`, cat: 'source' });
    }
  }

  // ── RETAIL SALES (per-location inventory) — daily ──
  let newTiresSold = 0;
  const locTakeOffSources = {};
  if (s.locations.length > 0) {
    // Staff capacity: techs = output (installs), sales = demand (customers)
    // Cap is min of both — need techs to install AND sales to bring customers
    const techCap = s.staff.techs * 8;
    const salesCap = s.staff.sales * 5;
    const staffCap = Math.min(techCap, salesCap) * (1 + s.staff.managers * .15);
    const demandMult = sDem * (1 + s.reputation * .01) * (s._tB || 1);
    const whPenalty = 1 - getWhShortage(s) * .08;

    // Early game boost: 2x demand at day 1, tapering to 1x at day 180
    const earlyBoostShop = s.day <= 180 ? 1 + (180 - s.day) / 180 : 1;

    for (const loc of s.locations) {
      if (!loc.inventory) loc.inventory = {};
      loc.dailyStats = { rev: 0, sold: 0, profit: 0 };
      const city = (shared.cities || []).find(c => c.id === loc.cityId) || { dem: 50, cost: 1, win: 0 };
      // ── LOYALTY UPDATE ──
      const locLoyalty = loc.loyalty || 0;
      let priceRatio = 0, priceCount = 0;
      for (const [k2, t2] of Object.entries(TIRES)) {
        if ((loc.inventory[k2] || 0) <= 0) continue;
        const pp = s.prices[k2] || t2.def;
        const mp = (s.marketPrices && s.marketPrices[k2]) || t2.def;
        if (mp > 0) { priceRatio += pp / mp; priceCount++; }
      }
      const avgRatio = priceCount > 0 ? priceRatio / priceCount : 1.0;
      if (avgRatio <= LOYALTY.overpriceThreshold) {
        loc.loyalty = C(locLoyalty + LOYALTY.fairPriceGain, 0, LOYALTY.maxLoyalty);
      } else if (avgRatio >= LOYALTY.gougeThreshold) {
        loc.loyalty = C(locLoyalty - LOYALTY.gougeLoss, 0, LOYALTY.maxLoyalty);
      } else {
        loc.loyalty = C(locLoyalty - LOYALTY.overpriceLoss, 0, LOYALTY.maxLoyalty);
      }
      const locInvTotal = Object.values(loc.inventory).reduce((a, b) => a + b, 0);
      if (locInvTotal === 0) loc.loyalty = C((loc.loyalty || 0) - LOYALTY.emptyShopDecay, 0, LOYALTY.maxLoyalty);
      const loyaltyMult = 1 + (loc.loyalty || 0) * LOYALTY.demandMultPerPoint;

      // ── MARKETING ──
      let marketingMult = 1;
      if (loc.marketing && MARKETING[loc.marketing]) {
        const mktg = MARKETING[loc.marketing];
        marketingMult = mktg.demandMult;
        s.cash -= mktg.costPerDay || mktg.dailyCost || 0;
        s.reputation = C(s.reputation + (mktg.repGain || mktg.repBoost || 0), 0, 100);
      }

      // ── MARKET SHARE ──
      const sharePct = (s.marketShare && s.marketShare[loc.cityId]?.share) || 0;
      const marketShareMult = 1 + sharePct * 0.3;

      // Daily demand per location — scales with city size, rep, season
      // Monopoly bonus: fewer AI shops = more demand
      const aiShopsInCity = (shared.aiShops || []).filter(a => a.cityId === loc.cityId).length;
      const monopolyMult = aiShopsInCity === 0 ? 1.5 : aiShopsInCity <= 2 ? 1.2 : 1.0;
      let locDemand = Math.max(1, Math.floor(city.dem * .08 * demandMult * whPenalty * earlyBoostShop * loyaltyMult * marketingMult * marketShareMult * monopolyMult * holidayMult));
      let locNewSold = 0;

      for (const [k, t] of Object.entries(TIRES)) {
        const locStock = loc.inventory[k] || 0;
        if (locStock <= 0) continue;
        const price = s.prices[k] || t.def;
        const mktPrice = (s.marketPrices && s.marketPrices[k]) || t.def;
        // Price competitiveness: below market = up to 2x, above = down to 0.3x
        const priceMult = mktPrice > 0 ? C(mktPrice / price, 0.3, 2.5) : 1;
        const isSeasonal = t.seas && season === "Winter";
        const winterMult = isSeasonal ? (city.win || 1) : 1;
        const agMult = t.ag ? (city.agPct || 0) : 1;
        const tireSeasonMult = getTireSeasonMult(k, season);

        const evAdoptionMult = t.ev ? (1 + Math.min(2.0, s.day / 365 * 0.5)) : 1;
        const emergencyMult = t.emergency ? (1 + (Math.random() < 0.05 ? 3 : 0)) : 1;
        let qty = Math.min(
          locStock,
          Math.floor(locDemand * (.15 + Math.random() * .10) * winterMult * agMult * priceMult * evAdoptionMult * emergencyMult * tireSeasonMult)
        );
        qty = Math.min(qty, Math.ceil(staffCap));
        if (qty <= 0) continue;

        const rev = qty * price;
        const cost = qty * (t.bMin + t.bMax) / 2;
        loc.inventory[k] -= qty;
        s.cash += rev;
        s.dayRev += rev;
        s.dayProfit += rev - cost;
        s.daySold += qty;
        loc.dailyStats.rev += rev;
        loc.dailyStats.sold += qty;
        loc.dailyStats.profit += rev - cost;
        s.dayRevByChannel.shops += rev;
        if (!t.used) {
          newTiresSold += qty;
          locNewSold += qty;
        }
        locDemand -= qty;
      }
      locTakeOffSources[loc.id] = locNewSold;
    }
  }

  // ── SHOP SERVICES — daily ──
  s.dayServiceRev = 0;
  s.dayServiceJobs = 0;
  if (s.locations.length > 0 && s.staff.techs > 0) {
    // Daily tech capacity (8 per tech)
    const totalTechCap = s.staff.techs * 8 * (1 + s.staff.managers * .15);
    const usedByTires = s.daySold;
    const spareCap = Math.max(0, totalTechCap - usedByTires);

    // Daily service demand (was loc*(4+rep*0.2) weekly)
    const svcDemandBase = s.locations.length * (0.6 + s.reputation * .03) * sDem;
    const svcPrices = s.servicePrices || { flatRepair: 25, balance: 20, install: 35, nitrogen: 10 };

    let capLeft = spareCap;
    for (const [svcKey, svc] of Object.entries(SERVICES)) {
      if (capLeft <= 0) break;
      const demand = Math.floor(svcDemandBase * (.15 + Math.random() * .1));
      const maxByTime = Math.floor(capLeft / svc.time);
      const jobs = Math.min(demand, maxByTime);
      if (jobs <= 0) continue;

      const price = svcPrices[svcKey] || svc.price;
      const rev = jobs * price;
      s.cash += rev;
      s.dayRev += rev;
      s.dayProfit += rev;
      s.dayServiceRev += rev;
      s.dayServiceJobs += jobs;
      s.dayRevByChannel.services += rev;
      if (svcKey === 'install') s._installJobs = (s._installJobs || 0) + jobs;
      s.reputation = C(s.reputation + jobs * svc.repBoost, 0, 100);
      capLeft -= jobs * svc.time;
    }
    s.totalServiceRev = (s.totalServiceRev || 0) + s.dayServiceRev;
  }

  // ── CUSTOMER TAKE-OFFS ──
  const installJobs = s._installJobs || 0;
  const disposalFee = s.disposalFee ?? 3;
  const takeOffRate = Math.max(0.1, Math.min(0.95, 0.9 - disposalFee * 0.06));
  let totalTakeOffs = 0;
  let totalDisposalRev = 0;

  if (s.locations.length > 0) {
    for (const loc of s.locations) {
      if (!loc.inventory) loc.inventory = {};
      const locSources = (locTakeOffSources[loc.id] || 0);
      const locInstalls = s.locations.length > 0 ? Math.floor(installJobs / s.locations.length) : 0;
      const sources = locSources + locInstalls;
      if (sources <= 0) continue;

      const takeOffs = Math.floor(sources * (takeOffRate - 0.1 + Math.random() * 0.2));
      const locFree = getLocCap(loc) - getLocInv(loc);
      const toAdd = Math.min(takeOffs, Math.max(0, locFree));
      if (toAdd > 0) {
        const grades = [
          ['used_junk', .30], ['used_poor', .35], ['used_good', .25], ['used_premium', .10],
        ];
        let remaining = toAdd;
        for (const [grade, pct] of grades) {
          const qty = grade === 'used_premium' ? remaining : Math.min(remaining, Math.round(toAdd * pct));
          loc.inventory[grade] = (loc.inventory[grade] || 0) + qty;
          remaining -= qty;
        }
        totalTakeOffs += toAdd;
      }
      if (takeOffs > 0 && disposalFee > 0) {
        const dRev = takeOffs * disposalFee;
        s.cash += dRev;
        s.dayRev += dRev;
        s.dayProfit += dRev;
        totalDisposalRev += dRev;
      }
    }
  }
  if (totalTakeOffs > 0) {
    s.log.push({ msg: `\u267B\uFE0F ${totalTakeOffs} take-off${totalTakeOffs !== 1 ? 's' : ''} added${totalDisposalRev > 0 ? ` (+$${totalDisposalRev} disposal fees)` : ''}`, cat: 'sale' });
  }
  if (totalTakeOffs > 0) {
    if (disposalFee > 3) {
      const repPen = (disposalFee - 3) * 0.01 * totalTakeOffs;
      s.reputation = C(s.reputation - repPen, 0, 100);
    } else if (disposalFee < 2) {
      const repBoost = (2 - disposalFee) * 0.005 * totalTakeOffs;
      s.reputation = C(s.reputation + repBoost, 0, 100);
    }
  }
  delete s._installJobs;

  // ── REGIONAL MARKET SHARE ──
  if (!s.marketShare) s.marketShare = {};
  for (const loc of s.locations) {
    const cityId = loc.cityId;
    const city = (shared.cities || []).find(c => c.id === cityId) || { dem: 50 };
    const aiCount = (shared.aiShops || []).filter(a => a.cityId === cityId).length;
    const totalMarketDaily = city.dem * 0.03 * sDem;
    const playerCitySales = s.daySold / Math.max(1, s.locations.length);
    if (!s.marketShare[cityId]) s.marketShare[cityId] = { playerSales: 0, totalMarket: 0, share: 0 };
    s.marketShare[cityId].playerSales = s.marketShare[cityId].playerSales * 0.95 + playerCitySales;
    s.marketShare[cityId].totalMarket = s.marketShare[cityId].totalMarket * 0.95 + totalMarketDaily;
    const total = s.marketShare[cityId].totalMarket;
    s.marketShare[cityId].share = total > 0 ? Math.min(1, s.marketShare[cityId].playerSales / total) : 0;
  }

  // ── VAN SALES (bootstrap, no shop) — daily ──
  if (s.locations.length === 0) {
    const wh = s.warehouseInventory || {};
    const whTotal = Object.values(wh).reduce((a, b) => a + b, 0);
    if (whTotal > 0) {
      // Early boost: 2x at day 1, tapering to 1x at day 180
      const earlyBoost = s.day <= 180 ? 1 + (180 - s.day) / 180 : 1;
      // Base demand scales with rep (8 base → grows)
      const baseDemand = 8 + s.reputation * 0.4;
      const vanDemand = Math.max(2, Math.floor(baseDemand * sDem * (s._tB || 1) * earlyBoost * holidayMult));
      let sold = 0;
      for (const [k, t] of Object.entries(TIRES)) {
        if ((wh[k] || 0) <= 0) continue;
        if (sold >= vanDemand) break;
        const price = s.prices[k] || t.def;
        const mktPrice = (s.marketPrices && s.marketPrices[k]) || t.def;
        // Price competitiveness: cheaper than market = up to 2x demand
        const priceMult = mktPrice > 0 ? C(mktPrice / price, 0.3, 2.5) : 1;
        const maxForType = Math.ceil((vanDemand - sold) * priceMult * 1.0);
        const qty = Math.min(wh[k], R(1, Math.max(1, maxForType)));
        if (qty <= 0) continue;
        wh[k] -= qty;
        s.cash += qty * price;
        s.dayRev += qty * price;
        s.dayProfit += qty * (price - (t.bMin + t.bMax) / 2);
        s.daySold += qty;
        s.vanTotalSold = (s.vanTotalSold || 0) + qty;
        s.dayRevByChannel.van += qty * price;
        sold += qty;
      }
      // Track van-only profitable days
      if (s.dayProfit > 0) {
        s.vanOnlyDays = (s.vanOnlyDays || 0) + 1;
      }
    }
  }

  // ── FLEA MARKET SALES (Fri/Sat/Sun only) ──
  const cal = getCalendar(s.day);
  const isWeekend = cal.dayOfWeek === 0 || cal.dayOfWeek === 5 || cal.dayOfWeek === 6;

  if ((s.fleaMarketStands || []).length > 0 && isWeekend) {
    const numStands = s.fleaMarketStands.length;
    // Operating cost per stand per day
    s.cash -= numStands * FLEA_DAILY_OPERATING;

    // Van capacity divided among stands
    const vanCap = 30; // base flea van capacity
    const capsPerStand = Math.floor(vanCap / numStands);

    for (const stand of s.fleaMarketStands) {
      const market = FLEA_MARKETS.find(m => m.id === stand.marketId);
      if (!market) continue;
      const city = (shared.cities || []).find(c => c.id === stand.cityId) || { dem: 50 };

      let standSold = 0;
      const standDemand = Math.max(1, Math.floor(city.dem * 0.05 * sDem * market.demandMult * holidayMult));

      for (const [k, t] of Object.entries(TIRES)) {
        if (standSold >= capsPerStand) break;
        const whStock = s.warehouseInventory[k] || 0;
        if (whStock <= 0) continue;

        const usedBonus = t.used ? market.usedBonus : 1.0;
        const tireSeasonM = getTireSeasonMult(k, season);
        const sellQty = Math.min(
          whStock,
          Math.max(1, Math.floor((standDemand - standSold) * 0.5 * usedBonus * tireSeasonM)),
          capsPerStand - standSold
        );
        if (sellQty <= 0) continue;

        const price = Math.round((s.prices[k] || t.def) * FLEA_PRICE_MULT);
        s.warehouseInventory[k] -= sellQty;
        s.cash += sellQty * price;
        s.dayRev += sellQty * price;
        s.dayProfit += sellQty * (price - (t.bMin + t.bMax) / 2);
        s.daySold += sellQty;
        s.fleaMarketTotalSold = (s.fleaMarketTotalSold || 0) + sellQty;
        s.dayRevByChannel.flea += sellQty * price;
        standSold += sellQty;
      }
      if (standSold > 0) {
        s.log.push({ msg: `\u{1F3EA} ${stand.name}: sold ${standSold} tires`, cat: 'sale' });
      }
    }
  }

  // ── CAR MEET SALES (summer weekends only) ──
  if ((s.carMeetAttendance || []).length > 0 && isWeekend) {
    const dayOfYear = cal.dayOfYear;
    if (dayOfYear >= CAR_MEET_SUMMER_START && dayOfYear <= CAR_MEET_SUMMER_END) {
      // Attendance covers the whole weekend (Fri/Sat/Sun) — check if any attendance within last 2 days
      const todayMeets = s.carMeetAttendance.filter(a => a.day >= s.day - 2 && a.day <= s.day);
      // Deduplicate by meetId (don't sell twice for same meet on same day)
      const seenMeets = new Set();
      const vanCapPerMeet = 25; // increased from 10

      for (const attendance of todayMeets) {
        if (seenMeets.has(attendance.meetId)) continue;
        seenMeets.add(attendance.meetId);
        const meet = CAR_MEETS.find(m => m.id === attendance.meetId);
        if (!meet) continue;

        let meetSold = 0;
        const meetDemand = Math.max(1, Math.floor(25 * meet.demandMult * holidayMult));

        for (const [k, t] of Object.entries(TIRES)) {
          if (meetSold >= vanCapPerMeet) break;
          const whStock = s.warehouseInventory[k] || 0;
          if (whStock <= 0) continue;

          const isPremium = CAR_MEET_PREMIUM_TIRES.includes(k);
          const premiumMult = isPremium ? meet.premiumPct : 1.0;
          const tireSeasonM = getTireSeasonMult(k, season);
          // All tires sell well at car meets; premium gets 1.5x bonus
          const sellQty = Math.min(
            whStock,
            Math.max(1, Math.floor((meetDemand - meetSold) * 0.25 * (isPremium ? 1.5 : 1.0) * tireSeasonM)),
            vanCapPerMeet - meetSold
          );
          if (sellQty <= 0) continue;

          const price = Math.round((s.prices[k] || t.def) * premiumMult);
          s.warehouseInventory[k] -= sellQty;
          s.cash += sellQty * price;
          s.dayRev += sellQty * price;
          s.dayProfit += sellQty * (price - (t.bMin + t.bMax) / 2);
          s.daySold += sellQty;
          s.carMeetTotalSold = (s.carMeetTotalSold || 0) + sellQty;
          s.dayRevByChannel.carMeets += sellQty * price;
          meetSold += sellQty;
        }
        if (meetSold > 0) {
          s.log.push({ msg: `\u{1F3CE}\uFE0F ${meet.name}: sold ${meetSold} tires`, cat: 'sale' });
        }
      }
    }
  }

  // ── WHOLESALE REVENUE — daily (÷7) ──
  if (s.hasWholesale && s.wsClients.length > 0) {
    for (const client of s.wsClients) {
      // Only fulfill wholesale orders ~once per week (1/7 chance per day)
      if (Math.random() > 1/7) continue;
      const qty = R(client.minOrder || 5, client.maxOrder || 20);
      const tire = client.preferredTire || "allSeason";
      const t = TIRES[tire];
      const totalStock = (s.warehouseInventory?.[tire] || 0) +
        s.locations.reduce((a, l) => a + (l.inventory?.[tire] || 0), 0);
      if (!t || totalStock < qty) continue;

      const pulled = pullFromStock(s, tire, qty);
      if (pulled <= 0) continue;

      const margin = getWsMargin(s, client);
      const price = Math.round(t.def * (1 - margin));
      const rev = pulled * price;
      const deliveryCost = pulled * Rf(WS_DELIVERY_COST.min, WS_DELIVERY_COST.max);

      s.cash += rev - deliveryCost;
      s.dayRev += rev;
      s.dayProfit += rev - deliveryCost;
      s.daySold += pulled;
      s.dayRevByChannel.wholesale += rev;
    }
  }

  // ── E-COMMERCE REVENUE — daily (÷7) ──
  if (s.hasEcom) {
    const tier = getEcomTier(s.ecomTotalSpent || 0);
    let conv = ECOM_BASE_CONVERSION;
    let trafficMult = 1;

    for (const [role, info] of Object.entries(ECOM_STAFF)) {
      if (s.ecomStaff[role]) {
        if (info.convBoost) conv += info.convBoost;
        if (info.trafficBoost) trafficMult += info.trafficBoost;
      }
    }
    for (const upId of (s.ecomUpgrades || [])) {
      const up = ECOM_UPGRADES[upId];
      if (up?.convBoost) conv += up.convBoost;
      if (up?.trafficBoost) trafficMult += up.trafficBoost;
    }

    const traffic = Math.floor(ECOM_NATIONAL_MARKET * tier.marketShare * trafficMult * sDem / 7);
    const orders = Math.floor(traffic * conv);
    let ecomRev = 0, ecomSold = 0;

    for (let i = 0; i < orders; i++) {
      const tireKeys = Object.keys(TIRES).filter(k => {
        if (TIRES[k].used) return false;
        const total = (s.warehouseInventory?.[k] || 0) +
          s.locations.reduce((a, l) => a + (l.inventory?.[k] || 0), 0);
        return total > 0;
      });
      if (tireKeys.length === 0) break;
      const k = tireKeys[R(0, tireKeys.length - 1)];
      const t = TIRES[k];
      const price = s.prices[k] || t.def;
      const ship = Rf(ECOM_SHIP_COST_RANGE[0], ECOM_SHIP_COST_RANGE[1]);
      const fee = price * ECOM_PAYMENT_FEE;

      pullFromStock(s, k, 1);
      const net = price - ship - fee;
      s.cash += net;
      ecomRev += price;
      ecomSold++;
    }

    s.ecomDailyOrders = orders;
    s.ecomDailyRev = ecomRev;
    s.dayRev += ecomRev;
    s.daySold += ecomSold;
    s.dayRevByChannel.ecom += ecomRev;

    const returnRate = Math.max(.02, ECOM_BASE_RETURN_RATE -
      ((s.ecomUpgrades || []).includes("fitmentDb") ? ECOM_UPGRADES.fitmentDb.returnReduce * ECOM_BASE_RETURN_RATE : 0));
    const returns = Math.floor(ecomSold * returnRate);
    if (returns > 0) {
      s.cash -= returns * 25;
      s.log.push({ msg: `\u{1F4E6} ${returns} e-com return${returns > 1 ? "s" : ""} processed`, cat: 'cost' });
    }
  }

  // ── MARKETPLACE REVENUE — daily (÷7) ──
  for (const ch of (s.marketplaceChannels || [])) {
    const mp = MARKETPLACE[ch.channel];
    if (!mp) continue;
    const demand = Math.floor(MARKETPLACE_WEEKLY_DEMAND * mp.trafficMult * sDem / 7);
    const qty = Math.min(demand, R(0, 2));

    for (let i = 0; i < qty; i++) {
      const tireKeys = Object.keys(TIRES).filter(k => {
        if (TIRES[k].used) return false;
        const total = (s.warehouseInventory?.[k] || 0) +
          s.locations.reduce((a, l) => a + (l.inventory?.[k] || 0), 0);
        return total > 0;
      });
      if (tireKeys.length === 0) break;
      const k = tireKeys[R(0, tireKeys.length - 1)];
      const price = s.prices[k] || TIRES[k].def;
      const fee = price * mp.fee;
      pullFromStock(s, k, 1);
      s.cash += price - fee;
      s.dayRev += price;
      s.daySold++;
    }
    s.cash -= mp.monthlyFee / 30; // daily portion of monthly fee
  }

  // ── 3PO FULFILLMENT REVENUE — daily (÷7) ──
  for (const contract of (s.tpoContracts || [])) {
    if (Math.random() > 1/7) continue; // ~once per week
    const brand = TPO_BRANDS.find(b => b.id === contract.brandId);
    if (!brand) continue;
    const shipVol = R(brand.weeklyShipVol[0], brand.weeklyShipVol[1]);
    const storedTires = R(brand.tiresStored[0], brand.tiresStored[1]);
    const outboundRev = shipVol * brand.outboundFee;
    const storageRev = storedTires * brand.storageFeePerTire;
    s.cash += outboundRev + storageRev;
    s.dayRev += outboundRev + storageRev;
  }

  // ── GOV CONTRACT DELIVERIES — daily ──
  for (const gc of (s.govContracts || [])) {
    if ((gc.daysLeft || gc.weeksLeft * 7 || 0) <= 0) continue;
    const t = TIRES[gc.tire];
    if (!t) continue;
    // Daily target (was weekly) — scales with drivers
    const baseDailyTarget = Math.max(1, Math.floor((gc.weeklyTarget || gc.dailyTarget || 1) / 7));
    const driverBoost = 1 + (s.staff.drivers || 0) * 0.5;
    const dailyTarget = Math.max(1, Math.floor(baseDailyTarget * driverBoost));
    const totalStock = (s.warehouseInventory?.[gc.tire] || 0) +
      s.locations.reduce((a, l) => a + (l.inventory?.[gc.tire] || 0), 0);
    const canDeliver = Math.min(dailyTarget, totalStock);
    if (canDeliver > 0) {
      pullFromStock(s, gc.tire, canDeliver);
      const rev = canDeliver * gc.pricePerTire;
      s.cash += rev;
      s.dayRev += rev;
      s.daySold += canDeliver;
      s.dayRevByChannel.gov += rev;
      gc.delivered += canDeliver;
    }
    gc.daysLeft = (gc.daysLeft || (gc.weeksLeft || 0) * 7) - 1;
  }
  s.govContracts = (s.govContracts || []).filter(gc => (gc.daysLeft || 0) > 0);

  // ── INSTALLER NETWORK REVENUE — daily (÷7) ──
  if (s.installers && s.installers.length > 0) {
    if (Math.random() < 1/7) { // ~once per week
      const installRev = s.installers.length * INSTALLER_NET.feePerInstall * R(2, 8);
      s.cash += installRev;
      s.dayRev += installRev;
    }
  }

  // ── COSTS — all converted from weekly (÷4 from monthly) to daily (÷30 from monthly) ──
  // Staff payroll
  const payroll = Object.entries(s.staff).reduce((a, [k, v]) => a + (PAY[k] || 0) * v, 0) / 30;
  s.cash -= payroll;

  // Warehouse staff payroll
  s.cash -= getWhPayroll(s) / 30;

  // Corp staff payroll
  const corpPayroll = Object.entries(s.corpStaff || {}).reduce(
    (a, [k, v]) => a + (CORP_PAY[k] || 0) * v, 0
  ) / 30;
  s.cash -= corpPayroll;

  // E-com staff payroll
  const ecomPayroll = Object.entries(s.ecomStaff || {}).reduce(
    (a, [role, hired]) => a + (hired ? (ECOM_STAFF[role]?.salary || 0) : 0), 0
  ) / 30;
  s.cash -= ecomPayroll;

  // E-com upgrade monthly costs
  const ecomUpgradeCost = (s.ecomUpgrades || []).reduce(
    (a, upId) => a + (ECOM_UPGRADES[upId]?.monthly || 0), 0
  ) / 30;
  s.cash -= ecomUpgradeCost;

  // E-com hosting
  if (s.hasEcom) {
    s.cash -= (ECOM_HOSTING_BASE + (s.ecomDailyOrders || 0) * ECOM_HOSTING_SCALE / 200) / 30;
  }

  // Storage rent
  const storageRent = s.storage.reduce((a, st) => a + (STORAGE[st.type]?.mo || 0), 0) / 30;
  s.cash -= storageRent;

  // Shop rent (variable by city cost)
  const totalShopRent = s.locations.reduce((a, loc) => {
    const city = CITIES.find(c => c.id === loc.cityId);
    return a + shopRent(city);
  }, 0) / 30;
  s.cash -= totalShopRent;

  // Distribution monthly
  if (s.hasDist) s.cash -= DIST_MONTHLY / 30;

  // Installer listing fees
  if (s.installers && s.installers.length > 0) {
    s.cash -= s.installers.length * INSTALLER_NET.monthlyListingFee / 30;
  }

  // Marketplace specialist salary
  if (s.marketplaceSpecialist) s.cash -= 3500 / 30;

  // Insurance premium
  if (s.insurance && INSURANCE[s.insurance]) {
    s.cash -= INSURANCE[s.insurance].monthlyCost / 30;
  }

  // Loan payments (daily = weekly / 7)
  for (const loan of (s.loans || [])) {
    if (loan.remaining <= 0) continue;
    const weeklyPmt = loan.weeklyPayment || (loan.amt * (1 + loan.r)) / ((loan.t || 12) * 4);
    const dailyPmt = weeklyPmt / 7;
    const actual = Math.min(dailyPmt, loan.remaining, Math.max(0, s.cash));
    s.cash -= actual;
    loan.remaining -= actual;
    // Weekly loan payment log
    if (s.day % 7 === 0) {
      s.log.push({ msg: `\u{1F3E6} Loan ${loan.name}: $${Math.round(weeklyPmt)}/wk, $${Math.round(loan.remaining)} remaining`, cat: 'cost' });
    }
    // Loan fully paid off — rep boost
    if (loan.remaining <= 0) {
      s.reputation = C(s.reputation + 0.5, 0, 100);
      s.log.push({ msg: `\u2705 Loan "${loan.name}" paid off! +0.5 reputation`, cat: 'event' });
    }
  }
  s.loans = (s.loans || []).filter(l => l.remaining > 0);

  // ── BANK DEPOSITS — daily interest ──
  if (s.bankBalance > 0) {
    const dailyRate = (s.bankRate || 0.042) / 360;
    const interest = Math.round(s.bankBalance * dailyRate * 100) / 100;
    s.bankBalance += interest;
    s.bankInterestEarned = interest;
    s.bankTotalInterest = (s.bankTotalInterest || 0) + interest;
    if (interest >= 1) {
      s.log.push({ msg: `\u{1F3E6} Bank paid $${Math.floor(interest)} interest`, cat: 'bank' });
    }
  } else {
    s.bankInterestEarned = 0;
  }
  // Fluctuate rate once per week (every 7 days)
  if (s.day % 7 === 0) {
    const rateSeasonMult = { Spring: 0.92, Summer: 0.88, Fall: 1.08, Winter: 1.12 }[season] || 1;
    const rateNoise = 1 + (Math.random() - 0.5) * 0.10;
    s.bankRate = Math.round(0.042 * rateSeasonMult * rateNoise * 10000) / 10000;
    s.bankRate = Math.max(0.015, Math.min(0.065, s.bankRate));
  }

  // ── SUPPLIER FREE SAMPLES ──
  for (const [supIdx, rel] of Object.entries(s.supplierRelationships || {})) {
    const tier = getSupplierRelTier(rel.totalPurchased || 0);
    if (tier.freeSampleChance > 0 && Math.random() < tier.freeSampleChance / 30) {
      const newTireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
      if (newTireKeys.length > 0) {
        const k = newTireKeys[R(0, newTireKeys.length - 1)];
        const qty = R(2, 5);
        s.warehouseInventory[k] = (s.warehouseInventory[k] || 0) + qty;
        s.log.push({ msg: `🎁 Free sample: ${qty} ${TIRES[k].n} from supplier!`, cat: 'source' });
      }
    }
  }

  // ── WEEKLY TOURNAMENT SNAPSHOT ──
  if (s.day % 7 === 1) {
    s.weeklySnapshot = { day: s.day, totalRev: s.totalRev, totalProfit: s.totalProfit, totalSold: s.totalSold };
  }

  // ── REPUTATION — boosted early game ──
  if (s.daySold > 0) {
    const earlyBonus = s.day <= 180
      ? Math.max(0, (25 - s.reputation) * 0.025)   // aggressive early: +0.625/day at rep 0
      : Math.max(0, (10 - s.reputation) * 0.005);  // normal: +0.05/day at rep 0
    const repGain = Math.min(0.5, s.daySold * 0.005 + s.locations.length * 0.005 + earlyBonus);
    s.reputation = C(s.reputation + repGain, 0, 100);
  }
  // Small passive daily rep for being in business
  if (s.day > 7) {
    s.reputation = C(s.reputation + 0.002, 0, 100);
  }

  // ── TOTALS ──
  s.totalRev += s.dayRev;
  s.totalProfit += s.dayProfit;
  s.totalSold += s.daySold;

  // ── MARKET PRICE FLUCTUATION — weekly recalc + daily micro-drift ──
  if (s.day % 7 === 0) {
    const mktPrices = { ...(s.marketPrices || {}) };
    const playerAvg = shared.playerPriceAvg || {};
    const aiAvg = shared.aiPriceAvg || {};

    for (const [k, t] of Object.entries(TIRES)) {
      let seasonMult = sDem;
      if (t.seas && season === "Winter") seasonMult *= 1.15;
      if (t.ag) seasonMult *= (season === "Spring" || season === "Fall") ? 1.1 : 0.95;

      const seasonalBase = t.def * seasonMult;
      const livePlayer = playerAvg[k] || t.def;
      const liveAI = aiAvg[k] || t.def;
      const blended = seasonalBase * 0.35 + livePlayer * 0.30 + liveAI * 0.25 + t.def * 0.10;
      const noise = 1 + (Math.random() - 0.5) * 0.20; // ±10%
      const newPrice = Math.round(blended * noise);
      mktPrices[k] = Math.max(t.lo, Math.min(t.hi, newPrice));
    }
    s.marketPrices = mktPrices;
  } else {
    // Daily micro-drift ±2% on all market prices
    const mktPrices = { ...(s.marketPrices || {}) };
    for (const [k, t] of Object.entries(TIRES)) {
      if (!mktPrices[k]) continue;
      const drift = 1 + (Math.random() - 0.5) * 0.04; // ±2%
      mktPrices[k] = Math.max(t.lo, Math.min(t.hi, Math.round(mktPrices[k] * drift)));
    }
    s.marketPrices = mktPrices;
  }

  // ── TIRE COINS — 1/day (was 5/week) ──
  s.tireCoins = (s.tireCoins || 0) + 1;

  // Clean up temp event flags
  delete s._tB;
  delete s._wB;
  delete s._uB;
  delete s._cM;
  delete s._vR;
  delete s._fO;

  // Rebuild aggregate inventory from all locations + warehouse
  rebuildGlobalInv(s);

  // ── ACHIEVEMENTS ──
  if (!s.achievements || Array.isArray(s.achievements)) s.achievements = {};
  s._newAchievements = [];
  for (const ach of ACHIEVEMENTS) {
    if (s.achievements[ach.id]) continue;
    try {
      if (ach.check(s)) {
        s.achievements[ach.id] = true;
        s.tireCoins = (s.tireCoins || 0) + ach.coins;
        s.log.push({ msg: `🏆 Achievement: ${ach.title} (+${ach.coins} TC)`, cat: 'event' });
        s._newAchievements.push({ id: ach.id, name: ach.title, reward: ach.coins });
      }
    } catch {}
  }

  // ── SHOP MARKETPLACE: AI BID GENERATION ──
  if ((s.shopListings || []).length > 0) {
    if (!s.shopBids) s.shopBids = [];
    let newBidCount = 0;
    for (const listing of s.shopListings) {
      const loc = s.locations.find(l => l.id === listing.locationId);
      if (!loc) continue;
      const city = (shared.cities || CITIES || []).find(c => c.id === loc.cityId);
      const val = getShopValuation(loc, city);
      const numBids = R(SHOP_BID.minBidsPerDay, SHOP_BID.maxBidsPerDay);
      for (let i = 0; i < numBids; i++) {
        const bidPct = Rf(SHOP_BID.bidMinPct, SHOP_BID.bidMaxPct);
        const bidPrice = Math.round(val.totalValue * bidPct);
        const buyerName = AI_BUYER_NAMES[R(0, AI_BUYER_NAMES.length - 1)];
        // Determine payment type
        const roll = Math.random();
        let paymentType, downPct = 0, months = 0, revSharePct = 0, revShareMonths = 0;
        if (roll < SHOP_BID.paymentWeights.cash) {
          paymentType = 'cash';
        } else if (roll < SHOP_BID.paymentWeights.cash + SHOP_BID.paymentWeights.installment) {
          paymentType = 'installment';
          downPct = Rf(SHOP_BID.installmentDownMin, SHOP_BID.installmentDownMax);
          downPct = Math.round(downPct * 100) / 100;
          months = R(SHOP_BID.installmentMonthsMin, SHOP_BID.installmentMonthsMax);
        } else {
          paymentType = 'revShare';
          revSharePct = Rf(SHOP_BID.revSharePctMin, SHOP_BID.revSharePctMax);
          revSharePct = Math.round(revSharePct * 100) / 100;
          revShareMonths = R(SHOP_BID.revShareMonthsMin, SHOP_BID.revShareMonthsMax);
        }
        s.shopBids.push({
          id: uid(),
          locationId: listing.locationId,
          bidPrice,
          bidderName: buyerName,
          paymentType,
          downPct,
          months,
          revSharePct,
          revShareMonths,
          day: s.day,
        });
        newBidCount++;
      }
    }
    // Expire bids older than 7 days
    s.shopBids = s.shopBids.filter(b => s.day - b.day < SHOP_BID.expiryDays);
    if (newBidCount > 0) {
      s.log.push({ msg: `${newBidCount} new bid${newBidCount > 1 ? 's' : ''} on your listed shop${s.shopListings.length > 1 ? 's' : ''}`, cat: 'event' });
    }
  }

  // ── SHOP MARKETPLACE: INSTALLMENT PAYMENTS ──
  if ((s.shopInstallments || []).length > 0) {
    s.shopInstallments = s.shopInstallments.filter(inst => {
      if (inst.remaining <= 0) return false;
      const daysSinceStart = s.day - inst.startDay;
      if (daysSinceStart > 0 && daysSinceStart % 30 === 0) {
        s.cash += inst.monthlyPayment;
        inst.remaining--;
        s.log.push({ msg: `Installment from ${inst.buyerName}: +$${inst.monthlyPayment.toLocaleString()} (${inst.remaining}mo left)`, cat: 'bank' });
      }
      return inst.remaining > 0;
    });
  }

  // ── SHOP MARKETPLACE: REVENUE SHARE PAYMENTS ──
  if ((s.shopRevenueShares || []).length > 0) {
    s.shopRevenueShares = s.shopRevenueShares.filter(rs => {
      if (rs.remaining <= 0) return false;
      const daysSinceStart = s.day - rs.startDay;
      if (daysSinceStart > 0 && daysSinceStart % 30 === 0) {
        // Estimate monthly revenue with +/-20% variance
        const variance = 0.8 + Math.random() * 0.4;
        const estimatedRev = (rs.monthlyEstimate || 5000) * variance;
        const payment = Math.round(estimatedRev * rs.revSharePct);
        s.cash += payment;
        rs.remaining--;
        s.log.push({ msg: `Rev share from ${rs.buyerName}: +$${payment.toLocaleString()} (${rs.remaining}mo left)`, cat: 'bank' });
      }
      return rs.remaining > 0;
    });
  }

  // ── TRADE REVENUE SHARES ──
  if ((s.tradeRevShares || []).length > 0) {
    s.tradeRevShares = s.tradeRevShares.filter(rs => {
      if ((rs.daysLeft || 0) <= 0) return false;
      const payment = Math.round(s.dayRev * (rs.revSharePct || 0));
      if (payment > 0) {
        s.cash -= payment;
        // Note: partner cash credited in their own tick via shared state
        // For simplicity, we just deduct from this player
      }
      rs.daysLeft--;
      return rs.daysLeft > 0;
    });
  }

  // ── HISTORY SNAPSHOT ──
  if (!s.history) s.history = [];
  s.history.push({
    day: s.day,
    rev: Math.round(s.dayRev),
    profit: Math.round(s.dayProfit),
    sold: s.daySold,
    cash: Math.floor(s.cash),
    rep: Math.round(s.reputation * 10) / 10,
  });
  if (s.history.length > 30) s.history = s.history.slice(-30);

  return s;
}
