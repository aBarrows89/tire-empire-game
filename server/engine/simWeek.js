import { R, Rf, C } from '../../shared/helpers/format.js';
import { getSeason, getSI } from '../../shared/helpers/season.js';
import { getCap, getInv } from '../../shared/helpers/inventory.js';
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

/**
 * Simulate one game week. Pure function — no side effects.
 *
 * @param {object} g - Current player game state
 * @param {object} shared - Shared economy state (aiShops, liquidation, etc.)
 * @returns {object} New player game state
 *
 * TODO: Port remaining subsystems from full tire-empire-v6.jsx source.
 * The structure below covers all major revenue/cost streams.
 * Once the full ~700-line simWeek is available, replace section by section.
 */
export function simWeek(g, shared = {}) {
  let s = { ...g, week: g.week + 1, weekRev: 0, weekProfit: 0, weekSold: 0, log: [], _events: [] };

  const season = getSeason(s.week);
  const si = getSI(s.week);
  const sDem = SD[season] || 1;

  // ── RANDOM EVENTS ──
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
    if (Math.random() < (ev.ch || 0)) {
      if (ev.s !== undefined && ev.s !== si && ev.s !== 0) continue;
      if (ev.gate && GATE_CHECK[ev.gate] && !GATE_CHECK[ev.gate]()) continue;
      s = EVENT_HANDLERS[i](s);
      s._events.push(ev.t);
      s.log.push(ev.t);
    }
  }

  // ── RETAIL SALES ──
  if (s.locations.length > 0) {
    const staffCap = (s.staff.techs * 8 + s.staff.sales * 5) * (1 + s.staff.managers * .15);
    const demandMult = sDem * (1 + s.reputation * .01) * (s._tB || 1);
    const whPenalty = 1 - getWhShortage(s) * .08;

    for (const loc of s.locations) {
      const city = (shared.cities || []).find(c => c.id === loc.cityId) || { dem: 50, cost: 1, win: 0 };
      let locDemand = Math.floor(city.dem * .15 * demandMult * whPenalty);

      for (const [k, t] of Object.entries(TIRES)) {
        if (s.inventory[k] <= 0) continue;
        const price = s.prices[k] || t.def;
        const isSeasonal = t.seas && season === "Winter";
        const winterMult = isSeasonal ? (city.win || 1) : 1;
        const agMult = t.ag ? (city.agPct || 0) : 1;

        let qty = Math.min(
          s.inventory[k],
          Math.floor(locDemand * (.08 + Math.random() * .04) * winterMult * agMult)
        );
        qty = Math.min(qty, Math.ceil(staffCap));
        if (qty <= 0) continue;

        const rev = qty * price;
        const cost = qty * (t.bMin + t.bMax) / 2;
        s.inventory[k] -= qty;
        s.cash += rev;
        s.weekRev += rev;
        s.weekProfit += rev - cost;
        s.weekSold += qty;
        locDemand -= qty;
      }
    }
  }

  // ── SHOP SERVICES (flat repairs, balances, installs, nitrogen) ──
  s.weekServiceRev = 0;
  s.weekServiceJobs = 0;
  if (s.locations.length > 0 && s.staff.techs > 0) {
    // Leftover tech capacity after tire sales (each tech has 8 units/week)
    const totalTechCap = s.staff.techs * 8 * (1 + s.staff.managers * .15);
    const usedByTires = s.weekSold; // each tire sold uses ~1 unit
    const spareCap = Math.max(0, totalTechCap - usedByTires);

    // Walk-in service demand scales with locations, reputation, and season
    const svcDemandBase = s.locations.length * (4 + s.reputation * .2) * sDem;
    const svcPrices = s.servicePrices || { flatRepair: 25, balance: 20, install: 35, nitrogen: 10 };

    let capLeft = spareCap;
    for (const [svcKey, svc] of Object.entries(SERVICES)) {
      if (capLeft <= 0) break;
      // Each service type gets a share of demand
      const demand = Math.floor(svcDemandBase * (.15 + Math.random() * .1));
      const maxByTime = Math.floor(capLeft / svc.time);
      const jobs = Math.min(demand, maxByTime);
      if (jobs <= 0) continue;

      const price = svcPrices[svcKey] || svc.price;
      const rev = jobs * price;
      s.cash += rev;
      s.weekRev += rev;
      s.weekProfit += rev; // services are pure labor profit
      s.weekServiceRev += rev;
      s.weekServiceJobs += jobs;
      s.reputation = C(s.reputation + jobs * svc.repBoost, 0, 100);
      capLeft -= jobs * svc.time;
    }
    s.totalServiceRev = (s.totalServiceRev || 0) + s.weekServiceRev;
  }

  // ── VAN SALES (bootstrap, no shop) ──
  if (s.locations.length === 0 && getInv(s) > 0) {
    const vanDemand = Math.floor((3 + s.reputation * .3) * sDem * (s._tB || 1));
    let sold = 0;
    for (const [k, t] of Object.entries(TIRES)) {
      if (!t.used || s.inventory[k] <= 0) continue;
      const qty = Math.min(s.inventory[k], R(0, Math.min(vanDemand - sold, 4)));
      if (qty <= 0) continue;
      const price = s.prices[k] || t.def;
      s.inventory[k] -= qty;
      s.cash += qty * price;
      s.weekRev += qty * price;
      s.weekProfit += qty * (price - (t.bMin + t.bMax) / 2);
      s.weekSold += qty;
      sold += qty;
    }
  }

  // ── WHOLESALE REVENUE ──
  if (s.hasWholesale && s.wsClients.length > 0) {
    for (const client of s.wsClients) {
      const qty = R(client.minOrder || 5, client.maxOrder || 20);
      const tire = client.preferredTire || "allSeason";
      const t = TIRES[tire];
      if (!t || s.inventory[tire] < qty) continue;

      const margin = getWsMargin(s, client);
      const price = Math.round(t.def * (1 - margin));
      const rev = qty * price;
      const deliveryCost = qty * Rf(WS_DELIVERY_COST.min, WS_DELIVERY_COST.max);

      s.inventory[tire] -= qty;
      s.cash += rev - deliveryCost;
      s.weekRev += rev;
      s.weekProfit += rev - deliveryCost;
      s.weekSold += qty;
    }
  }

  // ── E-COMMERCE REVENUE ──
  if (s.hasEcom) {
    const tier = getEcomTier(s.ecomTotalSpent || 0);
    let conv = ECOM_BASE_CONVERSION;
    let trafficMult = 1;

    // Staff boosts
    for (const [role, info] of Object.entries(ECOM_STAFF)) {
      if (s.ecomStaff[role]) {
        if (info.convBoost) conv += info.convBoost;
        if (info.trafficBoost) trafficMult += info.trafficBoost;
      }
    }

    // Upgrade boosts
    for (const upId of (s.ecomUpgrades || [])) {
      const up = ECOM_UPGRADES[upId];
      if (up?.convBoost) conv += up.convBoost;
      if (up?.trafficBoost) trafficMult += up.trafficBoost;
    }

    const traffic = Math.floor(ECOM_NATIONAL_MARKET * tier.marketShare * trafficMult * sDem);
    const orders = Math.floor(traffic * conv);
    let ecomRev = 0, ecomSold = 0;

    for (let i = 0; i < orders; i++) {
      const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used && s.inventory[k] > 0);
      if (tireKeys.length === 0) break;
      const k = tireKeys[R(0, tireKeys.length - 1)];
      const t = TIRES[k];
      const price = s.prices[k] || t.def;
      const ship = Rf(ECOM_SHIP_COST_RANGE[0], ECOM_SHIP_COST_RANGE[1]);
      const fee = price * ECOM_PAYMENT_FEE;

      s.inventory[k]--;
      const net = price - ship - fee;
      s.cash += net;
      ecomRev += price;
      ecomSold++;
    }

    s.ecomWeeklyOrders = orders;
    s.ecomWeeklyRev = ecomRev;
    s.weekRev += ecomRev;
    s.weekSold += ecomSold;

    // E-com returns
    const returnRate = Math.max(.02, ECOM_BASE_RETURN_RATE -
      ((s.ecomUpgrades || []).includes("fitmentDb") ? ECOM_UPGRADES.fitmentDb.returnReduce * ECOM_BASE_RETURN_RATE : 0));
    const returns = Math.floor(ecomSold * returnRate);
    if (returns > 0) {
      s.cash -= returns * 25; // avg return shipping cost
      s.log.push(`📦 ${returns} e-com return${returns > 1 ? "s" : ""} processed`);
    }
  }

  // ── MARKETPLACE REVENUE (Amazon/eBay) ──
  for (const ch of (s.marketplaceChannels || [])) {
    const mp = MARKETPLACE[ch.channel];
    if (!mp) continue;
    const demand = Math.floor(MARKETPLACE_WEEKLY_DEMAND * mp.trafficMult * sDem);
    const qty = Math.min(demand, R(2, 8));
    const tireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used && s.inventory[k] > 0);
    if (tireKeys.length === 0) break;

    for (let i = 0; i < qty; i++) {
      if (tireKeys.length === 0) break;
      const k = tireKeys[R(0, tireKeys.length - 1)];
      if (s.inventory[k] <= 0) continue;
      const price = s.prices[k] || TIRES[k].def;
      const fee = price * mp.fee;
      s.inventory[k]--;
      s.cash += price - fee;
      s.weekRev += price;
      s.weekSold++;
    }
    s.cash -= mp.monthlyFee / 4; // weekly portion of monthly fee
  }

  // ── 3PO FULFILLMENT REVENUE ──
  for (const contract of (s.tpoContracts || [])) {
    const brand = TPO_BRANDS.find(b => b.id === contract.brandId);
    if (!brand) continue;
    const shipVol = R(brand.weeklyShipVol[0], brand.weeklyShipVol[1]);
    const storedTires = R(brand.tiresStored[0], brand.tiresStored[1]);
    const outboundRev = shipVol * brand.outboundFee;
    const storageRev = storedTires * brand.storageFeePerTire;
    s.cash += outboundRev + storageRev;
    s.weekRev += outboundRev + storageRev;
  }

  // ── GOV CONTRACT DELIVERIES ──
  for (const gc of (s.govContracts || [])) {
    if (gc.weeksLeft <= 0) continue;
    const t = TIRES[gc.tire];
    if (!t) continue;
    const target = gc.weeklyTarget;
    const canDeliver = Math.min(target, s.inventory[gc.tire] || 0);
    if (canDeliver > 0) {
      s.inventory[gc.tire] -= canDeliver;
      const rev = canDeliver * gc.pricePerTire;
      s.cash += rev;
      s.weekRev += rev;
      s.weekSold += canDeliver;
      gc.delivered += canDeliver;
    }
    gc.weeksLeft--;
  }
  // Remove expired contracts
  s.govContracts = (s.govContracts || []).filter(gc => gc.weeksLeft > 0);

  // ── INSTALLER NETWORK REVENUE ──
  if (s.installers && s.installers.length > 0) {
    const installRev = s.installers.length * INSTALLER_NET.feePerInstall * R(2, 8);
    s.cash += installRev;
    s.weekRev += installRev;
  }

  // ── COSTS ──
  // Staff payroll
  const payroll = Object.entries(s.staff).reduce((a, [k, v]) => a + (PAY[k] || 0) * v, 0) / 4; // weekly
  s.cash -= payroll;

  // Warehouse staff payroll
  s.cash -= getWhPayroll(s) / 4;

  // Corp staff payroll
  const corpPayroll = Object.entries(s.corpStaff || {}).reduce(
    (a, [k, v]) => a + (CORP_PAY[k] || 0) * v, 0
  ) / 4;
  s.cash -= corpPayroll;

  // E-com staff payroll
  const ecomPayroll = Object.entries(s.ecomStaff || {}).reduce(
    (a, [role, hired]) => a + (hired ? (ECOM_STAFF[role]?.salary || 0) : 0), 0
  ) / 4;
  s.cash -= ecomPayroll;

  // E-com upgrade monthly costs
  const ecomUpgradeCost = (s.ecomUpgrades || []).reduce(
    (a, upId) => a + (ECOM_UPGRADES[upId]?.monthly || 0), 0
  ) / 4;
  s.cash -= ecomUpgradeCost;

  // E-com hosting
  if (s.hasEcom) {
    s.cash -= (ECOM_HOSTING_BASE + (s.ecomWeeklyOrders || 0) * ECOM_HOSTING_SCALE / 200) / 4;
  }

  // Storage rent
  const storageRent = s.storage.reduce((a, st) => a + (STORAGE[st.type]?.mo || 0), 0) / 4;
  s.cash -= storageRent;

  // Shop rent (variable by city cost)
  const totalShopRent = s.locations.reduce((a, loc) => {
    const city = CITIES.find(c => c.id === loc.cityId);
    return a + shopRent(city);
  }, 0);
  s.cash -= totalShopRent;

  // Distribution monthly
  if (s.hasDist) s.cash -= DIST_MONTHLY / 4;

  // Installer listing fees
  if (s.installers && s.installers.length > 0) {
    s.cash -= s.installers.length * INSTALLER_NET.monthlyListingFee / 4;
  }

  // Loan payments
  for (const loan of (s.loans || [])) {
    if (loan.remaining <= 0) continue;
    const payment = loan.weeklyPayment || (loan.amt * (1 + loan.r)) / (loan.t * 4);
    const actual = Math.min(payment, loan.remaining);
    s.cash -= actual;
    loan.remaining -= actual;
  }
  s.loans = (s.loans || []).filter(l => l.remaining > 0);

  // ── BANK DEPOSITS (interest + rate fluctuation) ──
  if (s.bankBalance > 0) {
    const weeklyRate = (s.bankRate || 0.042) / 52;
    const interest = Math.round(s.bankBalance * weeklyRate * 100) / 100;
    s.bankBalance += interest;
    s.bankInterestEarned = interest;
    s.bankTotalInterest = (s.bankTotalInterest || 0) + interest;
    s.cash += 0; // interest stays in savings, not auto-deposited to cash
    if (interest >= 1) {
      s.log.push(`\u{1F3E6} Bank paid $${Math.floor(interest)} interest`);
    }
  } else {
    s.bankInterestEarned = 0;
  }
  // Fluctuate the savings rate — base ~4.2% annual, shifted by season + noise
  // Higher rates in fall/winter (tighter money), lower in spring/summer
  const rateSeasonMult = { Spring: 0.92, Summer: 0.88, Fall: 1.08, Winter: 1.12 }[season] || 1;
  const rateNoise = 1 + (Math.random() - 0.5) * 0.10; // +/- 5%
  s.bankRate = Math.round(0.042 * rateSeasonMult * rateNoise * 10000) / 10000;
  // Clamp between 1.5% and 6.5%
  s.bankRate = Math.max(0.015, Math.min(0.065, s.bankRate));

  // ── REPUTATION ──
  if (s.weekSold > 0) {
    const repGain = Math.min(.5, s.weekSold * .01 + s.locations.length * .02);
    s.reputation = C(s.reputation + repGain, 0, 100);
  }

  // ── TOTALS ──
  s.totalRev += s.weekRev;
  s.totalProfit += s.weekProfit;
  s.totalSold += s.weekSold;

  // ── MARKET PRICE FLUCTUATION ──
  // Blends: base price + seasonal shift + live player avg + live AI avg + noise
  const mktPrices = { ...(s.marketPrices || {}) };
  const playerAvg = shared.playerPriceAvg || {};
  const aiAvg = shared.aiPriceAvg || {};

  for (const [k, t] of Object.entries(TIRES)) {
    // Season multiplier
    let seasonMult = sDem;
    if (t.seas && season === "Winter") seasonMult *= 1.15;
    if (t.ag) seasonMult *= (season === "Spring" || season === "Fall") ? 1.1 : 0.95;

    // Base component: default price * season
    const seasonalBase = t.def * seasonMult;

    // Live player price component (if available)
    const livePlayer = playerAvg[k] || t.def;

    // AI price component (if available)
    const liveAI = aiAvg[k] || t.def;

    // Weighted blend: 35% seasonal base, 30% player avg, 25% AI avg, 10% noise
    const blended = seasonalBase * 0.35 + livePlayer * 0.30 + liveAI * 0.25 + t.def * 0.10;

    // Add random noise: +/- 5%
    const noise = 1 + (Math.random() - 0.5) * 0.10;
    const newPrice = Math.round(blended * noise);

    // Clamp to valid range
    mktPrices[k] = Math.max(t.lo, Math.min(t.hi, newPrice));
  }
  s.marketPrices = mktPrices;

  // ── TIRE COINS ──
  s.tireCoins = (s.tireCoins || 0) + 5; // weekSurvived reward

  // Clean up temp event flags
  delete s._tB;
  delete s._wB;
  delete s._uB;
  delete s._cM;
  delete s._vR;
  delete s._fO;

  return s;
}
