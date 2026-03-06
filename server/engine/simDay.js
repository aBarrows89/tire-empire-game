import { fmt, R, Rf, C } from '../../shared/helpers/format.js';
import { getSeason, getSI } from '../../shared/helpers/season.js';
import { getCap, getInv, getLocInv, getLocCap, getStorageCap, rebuildGlobalInv } from '../../shared/helpers/inventory.js';
import { getWealth } from '../../shared/helpers/wealth.js';
import { getVolTier, getWsVolBonus, getWsMargin, getWsAvailSpace } from '../../shared/helpers/wholesale.js';
import { getEcomTier } from '../../shared/helpers/ecommerce.js';
import { getWhPayroll, getWhShortage } from '../../shared/helpers/warehouse.js';
import { SD } from '../../shared/constants/seasons.js';
import { TIRES } from '../../shared/constants/tires.js';
import { STORAGE } from '../../shared/constants/storage.js';
import { PAY } from '../../shared/constants/staff.js';
import { SHOP_MO, shopRent } from '../../shared/constants/shop.js';
import { CITIES, CITY_DEMAND_PROFILES } from '../../shared/constants/cities.js';
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
import { DIST_MONTHLY, DC_MONTHLY } from '../../shared/constants/distribution.js';
import { INSTALLER_NET } from '../../shared/constants/installerNet.js';
import { EVENT_HANDLERS } from './events.js';
import { LOYALTY } from '../../shared/constants/loyalty.js';
import { MARKETING } from '../../shared/constants/marketing.js';
import { INSURANCE, EVENT_INSURANCE_MAP } from '../../shared/constants/insurance.js';
import { RETREADING } from '../../shared/constants/retreading.js';
import { SUPPLIER_REL_TIERS, getSupplierRelTier } from '../../shared/constants/supplierRelations.js';
import { ACHIEVEMENTS } from '../../shared/constants/achievements.js';
import { FACTORY } from '../../shared/constants/factory.js';
import { RAW_MATERIALS, VINNIE_SCHEMES, RD_PROJECTS, CERTIFICATIONS, SHIPPING_ZONES, CFO_ROLE, RUBBER_FARM, SYNTHETIC_LAB, MATERIAL_SUPPLIERS, RUBBER_STORAGE, RUBBER_PER_TIRE, RUBBER_QUALITY } from '../../shared/constants/factoryBrand.js';
import { getAllTires, getBrandTireKey, getEffectiveProductionCost, getCustomerTier, computeTireAttributes, getTireAttrMultiplier } from '../../shared/helpers/factoryBrand.js';
import { GLOBAL_EVENTS } from '../../shared/constants/globalEvents.js';
import { MANUFACTURERS } from '../../shared/constants/manufacturers.js';
import { getHolidayMult } from '../../shared/constants/holidays.js';
import { getTireSeasonMult } from '../../shared/constants/tireSeasonal.js';
import { FLEA_MARKETS, FLEA_DAILY_OPERATING, FLEA_PRICE_MULT } from '../../shared/constants/fleaMarkets.js';
import { CAR_MEETS, CAR_MEET_SUMMER_START, CAR_MEET_SUMMER_END, CAR_MEET_PREMIUM_TIRES } from '../../shared/constants/carMeets.js';
import { getCalendar } from '../../shared/helpers/calendar.js';
import { getShopValuation, SHOP_BID, AI_BUYER_NAMES } from '../../shared/constants/shopSale.js';
import { uid } from '../../shared/helpers/random.js';
import { MONET } from '../../shared/constants/monetization.js';
import { SUPPLIERS } from '../../shared/constants/suppliers.js';
import { CONTRACT_TYPES, OFFERS_PER_MONTH, CONTRACTABLE_TIRES, SEASONAL_TIRES } from '../../shared/constants/contracts.js';
import { VINNIE_TRIGGERS, PRIORITY_ORDER } from '../../shared/constants/vinnieTriggers.js';
import { getActiveGoal } from '../../shared/constants/vinnieGoals.js';
import { getVinnieStage } from '../../shared/constants/vinnieLifecycle.js';

/** Compute max TC a player can hold based on upgrades + premium status */
function getTcCap(s) {
  let cap = MONET.tcStorage.baseCap;
  if (s.isPremium) cap += MONET.tcStorage.premiumBonus;
  const lvl = s.tcStorageLevel || 0;
  for (let i = 0; i < lvl && i < MONET.tcStorage.upgrades.length; i++) {
    cap += MONET.tcStorage.upgrades[i].addCap;
  }
  return cap;
}

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
  let s = { ...g, day: g.day + 1, dayRev: 0, dayProfit: 0, daySold: 0, log: [], _events: [], dayRevByChannel: { shops: 0, flea: 0, carMeets: 0, ecom: 0, wholesale: 0, gov: 0, van: 0, services: 0, factoryWholesale: 0 }, daySoldByChannel: { shops: 0, flea: 0, carMeets: 0, ecom: 0, wholesale: 0, gov: 0, van: 0, factoryWholesale: 0 }, daySoldByType: {} };

  // Save previous day values for trend arrows
  s.prevDayRev = g.dayRev || 0;
  s.prevDayProfit = g.dayProfit || 0;
  s.prevDaySold = g.daySold || 0;
  s.prevCash = Math.floor(g.cash || 0);
  s.prevRep = g.reputation || 0;

  // ── REFERRAL BOOST EXPIRY ──
  if (s._activeBoosts) {
    if (s._activeBoosts.rep && s._activeBoosts.rep.expiresDay <= s.day) {
      delete s._activeBoosts.rep;
    }
    if (s._activeBoosts.revenue && s._activeBoosts.revenue.expiresDay <= s.day) {
      delete s._activeBoosts.revenue;
    }
    if (Object.keys(s._activeBoosts).length === 0) delete s._activeBoosts;
  }
  if (s.premiumExpiresDay && s.premiumExpiresDay > 0 && s.premiumExpiresDay <= s.day) {
    s.premium = false;
    s.premiumExpiresDay = 0;
  }

  // Backward compat: migrate week-based state to day-based
  if (s.week && !s.startDay) {
    s.day = s.week; // treat old weeks as days
    delete s.week;
  }

  // Migration: rubberSupply → naturalRubber/syntheticRubber split
  if (s.hasFactory && s.factory && s.factory.rubberSupply !== undefined && s.factory.naturalRubber === undefined) {
    const oldSupply = s.factory.rubberSupply || 0;
    if (s.factory.rubberFarm && s.factory.syntheticLab) {
      s.factory.naturalRubber = Math.floor(oldSupply * 0.5);
      s.factory.syntheticRubber = oldSupply - s.factory.naturalRubber;
    } else if (s.factory.syntheticLab) {
      s.factory.naturalRubber = 0;
      s.factory.syntheticRubber = oldSupply;
    } else {
      s.factory.naturalRubber = oldSupply;
      s.factory.syntheticRubber = 0;
    }
    delete s.factory.rubberSupply;
    delete s.factory._effectiveRubberIndex;
    s.factory.rubberPreference = 'auto';
    s.log = s.log || [];
    s.log.push({ msg: 'Rubber Storage required! Your farm/lab output is paused until you build storage.', cat: 'event' });
  }

  // Deep-clone mutable nested objects
  s.locations = s.locations.map(l => ({ ...l, inventory: { ...(l.inventory || {}) } }));
  s.warehouseInventory = { ...(s.warehouseInventory || {}) };
  s.loans = (s.loans || []).map(l => ({ ...l })); // deep-clone so mutations don't affect caller's reference

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
      const space = Math.max(0, getCap(s) - getInv(s));
      const qty = Math.min(imp.qty, space);
      if (qty > 0) s.warehouseInventory[imp.tire] = (s.warehouseInventory[imp.tire] || 0) + qty;
      s.log.push({ msg: `📦 Import arrived: ${qty} ${TIRES[imp.tire]?.n || imp.tire}${qty < imp.qty ? ` (${imp.qty - qty} didn't fit)` : ''}`, cat: 'source' });
    }
  }

  // ── CONTRACT FULFILLMENT (daily deliveries) ──
  if (s.contracts && s.contracts.length > 0) {
    for (const ct of s.contracts) {
      if (ct.status !== 'active') continue;
      // Check expiration
      if (s.day > ct.expirationDay) {
        ct.status = ct.deliveredQuantity >= ct.totalQuantity ? 'completed' : 'expired';
        if (ct.status === 'expired' && ct.deliveredQuantity < ct.totalQuantity) {
          s.log.push({ msg: `Contract expired: ${ct.tireName} from ${ct.supplierName} (${ct.deliveredQuantity}/${ct.totalQuantity} delivered)`, cat: 'supplier' });
        }
        continue;
      }
      // Daily delivery mode
      if (ct.deliveryMode === 'daily' && ct.deliveredQuantity < ct.totalQuantity) {
        const dailyQty = Math.min(ct.dailyAllotment || 50, ct.totalQuantity - ct.deliveredQuantity);
        const space = Math.max(0, getCap(s) - getInv(s));
        const delivered = Math.min(dailyQty, space);
        if (delivered > 0) {
          s.warehouseInventory[ct.tireType] = (s.warehouseInventory[ct.tireType] || 0) + delivered;
          ct.deliveredQuantity += delivered;
        }
        // Tires that don't fit are lost (spec requirement)
        if (delivered < dailyQty) {
          ct.deliveredQuantity += (dailyQty - delivered); // Count as delivered even if lost
        }
      }
      // Scheduled delivery (seasonal pre-buy)
      if (ct.deliveryMode === 'scheduled' && s.day >= ct.deliveryStartDay && !ct._scheduledDelivered) {
        const space = Math.max(0, getCap(s) - getInv(s));
        const delivered = Math.min(ct.totalQuantity, space);
        if (delivered > 0) {
          s.warehouseInventory[ct.tireType] = (s.warehouseInventory[ct.tireType] || 0) + delivered;
        }
        ct.deliveredQuantity = ct.totalQuantity;
        ct._scheduledDelivered = true;
        ct.status = 'completed';
        const lost = ct.totalQuantity - delivered;
        s.log.push({ msg: `📦 Seasonal delivery: ${delivered} ${ct.tireName}${lost > 0 ? ` (${lost} didn't fit — lost!)` : ''}`, cat: 'supplier' });
      }
      // Mark complete
      if (ct.deliveredQuantity >= ct.totalQuantity && ct.status === 'active') {
        ct.status = 'completed';
      }
    }
    // Clean up old completed/expired contracts (keep last 5)
    const done = s.contracts.filter(c => c.status !== 'active');
    if (done.length > 5) {
      const activeContracts = s.contracts.filter(c => c.status === 'active');
      s.contracts = [...activeContracts, ...done.slice(-5)];
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
        if (getInv(s) < getCap(s)) {
          s.warehouseInventory[RETREADING.outputGrade] = (s.warehouseInventory[RETREADING.outputGrade] || 0) + 1;
        }
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
    s.factory = {
      ...s.factory,
      lines: (s.factory.lines || []).map(l => ({ ...l, queue: [...(l.queue || [])] })),
      staff: { ...(s.factory.staff || { lineWorkers: 0, inspectors: 0, engineers: 0, manager: 0 }) },
      rawMaterials: { ...(s.factory.rawMaterials || { rubber: 1.0, steel: 1.0, chemicals: 1.0 }) },
      rdProjects: [...(s.factory.rdProjects || [])],
      certifications: [...(s.factory.certifications || [])],
      vinnieInventory: { ...(s.factory.vinnieInventory || {}) },
      customerList: [...(s.factory.customerList || [])],
      orderHistory: [...(s.factory.orderHistory || [])],
    };
    // Remove orphaned legacy field if still present
    delete s.factory.productionQueue;
    // Deep-clone contract allocations
    if (s.factory.contractAllocations) {
      s.factory.contractAllocations = { ...s.factory.contractAllocations };
      for (const k of Object.keys(s.factory.contractAllocations)) {
        s.factory.contractAllocations[k] = { ...s.factory.contractAllocations[k] };
      }
    }
    if (s.factory.contractStaging) s.factory.contractStaging = { ...s.factory.contractStaging };

    const fStaff = s.factory.staff;
    const managerBoost = 1 + (fStaff.manager || 0) * 0.20;

    // ── P2P CONTRACT PRODUCTION — runs before general queue ──
    if (s.factory.contractAllocations && Object.keys(s.factory.contractAllocations).length > 0) {
      const dailyCap = (FACTORY.levels.find(l => l.level === s.factory.level) || FACTORY.levels[0]).dailyCapacity + (fStaff.lineWorkers || 0) * 10;
      let contractProduced = 0;

      for (const [cid, alloc] of Object.entries(s.factory.contractAllocations)) {
        if (!alloc.autoRun) continue;
        if (alloc.remainingQty <= 0) continue;

        // Find the matching active contract
        const contract = (s.p2pContracts || []).find(c => c.id === cid && c.status === 'active');
        if (!contract) continue;

        const todayOutput = Math.floor(dailyCap * alloc.percent / 100);
        if (todayOutput <= 0) continue;

        // Check raw material cost
        const productionCost = (FACTORY.productionCost[alloc.tireType] || 50) * todayOutput;
        if (s.cash < productionCost && s.cash > -500000) {
          // Produce even at a loss if cash > -500k
        } else if (s.cash <= -500000) {
          continue; // Too deep in debt
        }

        let actualOutput = Math.min(todayOutput, alloc.remainingQty);

        // Rubber consumption for contract production
        const baseType = alloc.tireType.startsWith('brand_') ? alloc.tireType.replace('brand_', '') : alloc.tireType;
        const rubberPerUnit = RUBBER_PER_TIRE[baseType] || 1.0;
        const contractRubberNeeded = rubberPerUnit * actualOutput;
        const contractNat = s.factory.naturalRubber || 0;
        const contractSyn = s.factory.syntheticRubber || 0;
        const contractRubberAvail = contractNat + contractSyn;
        if (s.factory.rubberStorage && contractRubberAvail < contractRubberNeeded) {
          // Produce only what rubber allows
          actualOutput = Math.floor(contractRubberAvail / rubberPerUnit);
          if (actualOutput <= 0) continue;
        }
        if (s.factory.rubberStorage) {
          const rubberUsed = rubberPerUnit * actualOutput;
          // Deduct rubber — prefer natural for contracts, fall back to synthetic
          const natUse = Math.min(s.factory.naturalRubber || 0, rubberUsed);
          s.factory.naturalRubber = (s.factory.naturalRubber || 0) - natUse;
          s.factory.syntheticRubber = (s.factory.syntheticRubber || 0) - (rubberUsed - natUse);
        }

        s.cash -= (FACTORY.productionCost[alloc.tireType] || 50) * actualOutput;

        // Add to staging area
        if (!s.factory.contractStaging) s.factory.contractStaging = {};
        s.factory.contractStaging[cid] = (s.factory.contractStaging[cid] || 0) + actualOutput;
        alloc.remainingQty -= actualOutput;
        contractProduced += actualOutput;

        // Check if staged >= batchSize — mark for shipment
        const batchSize = contract.terms?.batchSize || 100;
        if (s.factory.contractStaging[cid] >= batchSize) {
          contract._pendingShipment = true;
          contract._shipmentQty = s.factory.contractStaging[cid];
        }
      }

      // Recalculate total allocated percent
      s.factory.totalAllocatedPercent = Object.values(s.factory.contractAllocations)
        .reduce((sum, a) => sum + (a.percent || 0), 0);
    }

    // ── RAW MATERIAL PRICE DRIFT (weekly) ──
    if (s.day % 7 === 0) {
      for (const [mat, cfg] of Object.entries(RAW_MATERIALS)) {
        const current = s.factory.rawMaterials[mat] ?? cfg.base;
        const drift = (Math.random() - 0.5) * 2 * cfg.volatility;
        s.factory.rawMaterials[mat] = Math.max(cfg.min, Math.min(cfg.max, current + drift));
      }
    }

    // ── MULTI-LINE PRODUCTION SYSTEM ──
    // Migrate legacy single queue to lines array
    if (!s.factory.lines) {
      s.factory.lines = [{
        id: 0,
        queue: s.factory.productionQueue || [],
        currentType: s.factory.currentLine || null,
        runStreak: 0,
        lastMaintDay: s.day,
        status: 'active',
      }];
      delete s.factory.productionQueue;
      delete s.factory.currentLine;
      delete s.factory.switchCooldown;
    }

    // Determine available lines based on factory level
    const maxLines = (FACTORY.productionLines?.byLevel?.[s.factory.level - 1]) || 1;

    // Get supplier modifiers
    const rubberSup = MATERIAL_SUPPLIERS?.rubber?.find(sup => sup.id === s.factory.suppliers?.rubber) || { qualityMod: 1, priceMod: 1, reliability: 0.95 };
    const steelSup = MATERIAL_SUPPLIERS?.steel?.find(sup => sup.id === s.factory.suppliers?.steel) || { qualityMod: 1, priceMod: 1, reliability: 0.95 };
    const chemSup = MATERIAL_SUPPLIERS?.chemicals?.find(sup => sup.id === s.factory.suppliers?.chemicals) || { qualityMod: 1, priceMod: 1, reliability: 0.95 };
    const supplierDefectMod = (rubberSup.qualityMod + steelSup.qualityMod + chemSup.qualityMod) / 3;

    // Supplier reliability check — delays today's completions by 1 day
    let supplyDelay = false;
    if (Math.random() > rubberSup.reliability || Math.random() > steelSup.reliability || Math.random() > chemSup.reliability) {
      supplyDelay = true;
      s.log.push({ msg: '\u{1F4E6} Supply delay — production pushed back 1 day', cat: 'factory' });
    }

    const defectMult = s.factory._vinnieQualityShortcut ? 2 : 1;
    delete s.factory._vinnieQualityShortcut;
    let producedTotal = 0;
    const allTiresMap = getAllTires(s);
    if (!s.factory.defectHistory) s.factory.defectHistory = [];

    // Green Tech waste reduction
    const hasGreenTech = (s.factory.completedRD || []).includes('greenTech');
    const wasteReduction = hasGreenTech ? 0.15 : 0;

    for (const line of s.factory.lines) {
      if (line.id >= maxLines) continue; // line not yet unlocked

      // Maintenance check
      if (line.status === 'maintenance') {
        if (s.day >= (line.maintCompleteDay || 0)) {
          line.status = 'active';
          line.lastMaintDay = s.day;
          s.log.push({ msg: `\u{1F527} Production line ${line.id + 1} maintenance complete`, cat: 'factory' });
        }
        continue; // skip production while in maintenance
      }

      // Maintenance neglect penalty
      const maintInterval = FACTORY.productionLines?.maintenance?.intervalDays || 30;
      const daysSinceMaint = s.day - (line.lastMaintDay || 0);
      const neglectPenalty = daysSinceMaint > maintInterval ? (FACTORY.productionLines?.maintenance?.neglectDefectPenalty || 0.03) : 0;

      // Line switching cooldown
      if ((line.switchCooldown || 0) > 0) {
        line.switchCooldown--;
      }

      // Run efficiency bonus
      const runEff = FACTORY.productionLines?.runEfficiency;
      let runDefectBonus = 0;
      let runCostBonus = 0;
      if (runEff && line.runStreak > 0) {
        for (let i = runEff.thresholds.length - 1; i >= 0; i--) {
          if (line.runStreak >= runEff.thresholds[i]) {
            runDefectBonus = runEff.defectReduction[i] || 0;
            runCostBonus = runEff.costReduction[i] || 0;
            break;
          }
        }
      }

      // Process completions for this line
      const completed = line.queue.filter(q => s.day >= q.completionDay && !supplyDelay);
      line.queue = line.queue.filter(q => s.day < q.completionDay || supplyDelay);

      // If supply delay, push today's completions back by 1 day
      if (supplyDelay) {
        for (const batch of line.queue) {
          if (batch.completionDay === s.day) batch.completionDay += 1;
        }
      }

      for (const q of completed) {
        // Calculate defect rate with all modifiers
        let defectRate = Math.max(FACTORY.minDefectRate,
          (FACTORY.baseDefectRate - (fStaff.inspectors || 0) * 0.02 - runDefectBonus + neglectPenalty) * defectMult * supplierDefectMod
        );
        // Apply rubber quality defect modifier (synthetic rubber = +2% defects)
        if (q.syntheticRatio != null && q.syntheticRatio > 0) {
          const rubberDefectMult = 1.0 + (RUBBER_QUALITY.synthetic.defectModifier - 1.0) * q.syntheticRatio;
          defectRate *= rubberDefectMult;
        }
        // Apply waste reduction from Green Tech
        if (wasteReduction > 0) defectRate = Math.max(FACTORY.minDefectRate, defectRate * (1 - wasteReduction));

        const goodQty = Math.max(1, Math.floor(q.qty * (1 - defectRate)));
        const totalDefects = q.qty - goodQty;

        // Track defect categories
        const cosmeticDefects = Math.floor(totalDefects * 0.50);
        const structuralDefects = Math.floor(totalDefects * 0.35);
        const criticalDefects = totalDefects - cosmeticDefects - structuralDefects;

        if (totalDefects > 0) {
          s.factory.defectHistory.push({
            day: s.day, tire: q.tire, qty: q.qty, good: goodQty, lineId: line.id,
            defects: { cosmetic: cosmeticDefects, structural: structuralDefects, critical: criticalDefects },
            defectRate: totalDefects / q.qty,
          });
        }

        // Update run streak
        if (line.currentType === q.tire) {
          line.runStreak = (line.runStreak || 0) + 1;
        } else {
          line.runStreak = 1;
          line.currentType = q.tire;
        }

        // Store with brand_ prefix
        const storeKey = q.tire.startsWith('brand_') ? q.tire : getBrandTireKey(q.tire);
        const factorySpace = Math.max(0, getCap(s) - getInv(s));
        let storeQty = Math.min(goodQty, factorySpace);
        if (storeQty > 0) s.warehouseInventory[storeKey] = (s.warehouseInventory[storeKey] || 0) + storeQty;
        let overflow = goodQty - storeQty;
        if (overflow > 0 && s.locations.length > 0) {
          for (const loc of s.locations) {
            if (overflow <= 0) break;
            if (!loc.inventory) loc.inventory = {};
            const locSpace = Math.max(0, getLocCap(loc) - getLocInv(loc));
            const pushQty = Math.min(overflow, locSpace);
            if (pushQty > 0) {
              loc.inventory[storeKey] = (loc.inventory[storeKey] || 0) + pushQty;
              overflow -= pushQty;
              storeQty += pushQty;
            }
          }
        }
        producedTotal += storeQty;
        const tName = allTiresMap[storeKey]?.n || allTiresMap[q.tire]?.n || q.tire;
        const lineLabel = s.factory.lines.length > 1 ? ` [Line ${line.id + 1}]` : '';
        if (overflow > 0) {
          s.log.push({ msg: `\u{1F3ED} Produced ${storeQty}/${goodQty} ${tName}${lineLabel} (${overflow} lost — storage full!)`, cat: 'sale' });
        } else if (totalDefects > 0) {
          s.log.push({ msg: `\u{1F3ED} Produced ${goodQty}/${q.qty} ${tName}${lineLabel} (${totalDefects} defective: ${cosmeticDefects}C/${structuralDefects}S/${criticalDefects}X)`, cat: 'sale' });
        } else {
          s.log.push({ msg: `\u{1F3ED} Produced ${goodQty} ${tName}${lineLabel}`, cat: 'sale' });
        }
      }
    }

    // Trim defect history to last 90 entries
    if (s.factory.defectHistory.length > 90) {
      s.factory.defectHistory = s.factory.defectHistory.slice(-90);
    }

    // ── WARRANTY CLAIMS — based on recent defect rate ──
    const recentDefects = s.factory.defectHistory.filter(d => s.day - d.day < 30);
    if (recentDefects.length > 0) {
      const avgDefectRate = recentDefects.reduce((sum, d) => sum + d.defectRate, 0) / recentDefects.length;
      if (avgDefectRate > 0.02 && Math.random() < avgDefectRate * 0.5) {
        const claimRoll = Math.random();
        const claimType = claimRoll < 0.15 ? 'critical' : claimRoll < 0.50 ? 'structural' : 'cosmetic';
        const typeInfo = FACTORY.defectTypes[claimType];
        const avgCost = Object.values(FACTORY.productionCost).reduce((a, b) => a + b, 0) / Object.values(FACTORY.productionCost).length;
        const claimCost = Math.floor(avgCost * typeInfo.warrantyCost * (5 + Math.floor(Math.random() * 15)));
        s.cash -= claimCost;
        s.reputation = Math.max(0, s.reputation - typeInfo.repPenalty);
        s.factory.totalWarrantyClaims = (s.factory.totalWarrantyClaims || 0) + 1;
        s.factory.totalWarrantyCost = (s.factory.totalWarrantyCost || 0) + claimCost;
        s.log.push({ msg: `\u{26A0}\u{FE0F} Warranty claim (${claimType}): -$${claimCost.toLocaleString()} — avg defect rate ${(avgDefectRate * 100).toFixed(1)}%`, cat: 'factory' });
      }
    }

    // ── R&D PROJECT COMPLETION ──
    const completedRD = s.factory.rdProjects.filter(p => s.day >= p.completionDay);
    s.factory.rdProjects = s.factory.rdProjects.filter(p => s.day < p.completionDay);
    if (!s.factory.unlockedSpecials) s.factory.unlockedSpecials = [];
    if (!s.factory.completedRD) s.factory.completedRD = [];
    for (const proj of completedRD) {
      const rdDef = RD_PROJECTS.find(r => r.id === proj.id);
      if (!rdDef) continue;
      // Track completed project ID (prevents re-starting)
      if (!s.factory.completedRD.includes(proj.id)) {
        s.factory.completedRD.push(proj.id);
      }
      if (rdDef.qualityBoost) {
        s.factory.qualityRating = Math.min(1.0, (s.factory.qualityRating || 0.80) + rdDef.qualityBoost);
      }
      if (rdDef.wasteReduction) {
        s.factory.wasteReduction = (s.factory.wasteReduction || 0) + rdDef.wasteReduction;
      }
      if (rdDef.unlocksExclusive && !s.factory.unlockedSpecials.includes(rdDef.unlocksExclusive)) {
        s.factory.unlockedSpecials.push(rdDef.unlocksExclusive);
      }
      s.log.push({ msg: `\u{1F52C} R&D Complete: ${rdDef.name}${rdDef.qualityBoost ? ` (+${Math.round(rdDef.qualityBoost * 100)}% quality)` : ''}${rdDef.wasteReduction ? ` (-${Math.round(rdDef.wasteReduction * 100)}% waste)` : ''}${rdDef.unlocksExclusive ? ' — new tire unlocked!' : ''}`, cat: 'event' });
    }

    // ── CERTIFICATION COMPLETION ──
    const completedCerts = s.factory.certifications.filter(c => !c.earned && s.day >= c.completionDay);
    for (const cert of completedCerts) {
      cert.earned = true;
      const certDef = CERTIFICATIONS.find(c => c.id === cert.id);
      if (certDef) {
        s.factory.brandReputation = Math.min(100, (s.factory.brandReputation || 0) + certDef.repBoost);
        s.log.push({ msg: `\u{1F3C5} Certification earned: ${certDef.name} (+${certDef.repBoost} brand rep)`, cat: 'event' });
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

    // Factory overhead — scales with factory level
    const overhead = (FACTORY.monthlyOverheadByLevel?.[s.factory.level] ?? FACTORY.monthlyOverhead ?? 50000) / 30;
    s.cash -= overhead;

    // Factory staff payroll (including CFO if hired)
    let factoryPayroll = Object.entries(fStaff).reduce((a, [role, count]) => {
      const staffDef = FACTORY.staff[role];
      return a + (staffDef ? staffDef.salary * count : 0);
    }, 0) / 30;
    if (s.factory.hasCFO) factoryPayroll += CFO_ROLE.salary / 30;
    s.cash -= factoryPayroll;

    // ── RUBBER PRODUCTION (Farm + Synthetic Lab) — output into typed storage ──
    const rubberStorageLevel = s.factory.rubberStorage?.level || 0;
    const rubberStorageCap = rubberStorageLevel > 0
      ? (RUBBER_STORAGE.levels.find(l => l.level === rubberStorageLevel) || RUBBER_STORAGE.levels[0]).capacity
      : 0;
    const currentNatural = s.factory.naturalRubber || 0;
    const currentSynthetic = s.factory.syntheticRubber || 0;
    const currentTotalRubber = currentNatural + currentSynthetic;

    if (s.factory.rubberFarm) {
      const farmLevel = RUBBER_FARM.levels.find(l => l.level === s.factory.rubberFarm.level) || RUBBER_FARM.levels[0];
      let farmOutput = farmLevel.dailyOutput;
      // Weather vulnerability check — natural rubber affected by weather events
      const activeGlobal = shared.globalEvents || [];
      const hasWeatherEvent = activeGlobal.some(e => e.id === 'rubber_shortage' || e.id === 'winter_storm');
      if (hasWeatherEvent) farmOutput = Math.floor(farmOutput * 0.5);
      // New events: plantation_fire, monsoon_season reduce natural output
      const hasPlantationFire = activeGlobal.some(e => e.id === 'plantation_fire');
      if (hasPlantationFire) farmOutput = Math.floor(farmOutput * 0.3);
      const hasMonsoon = activeGlobal.some(e => e.id === 'monsoon_season');
      if (hasMonsoon) farmOutput = Math.floor(farmOutput * 0.6);
      const hasNewSource = activeGlobal.some(e => e.id === 'new_rubber_source');
      if (hasNewSource) farmOutput = Math.floor(farmOutput * 1.5);

      if (rubberStorageCap > 0) {
        const spaceLeft = Math.max(0, rubberStorageCap - currentTotalRubber);
        const stored = Math.min(farmOutput, spaceLeft);
        s.factory.naturalRubber = currentNatural + stored;
        if (stored < farmOutput && s.day % 7 === 0) {
          s.log.push({ msg: `\u{1F331} Rubber farm: ${farmOutput - stored} units wasted — storage full!`, cat: 'event' });
        }
      } else if (s.day % 7 === 0) {
        s.log.push({ msg: '\u{1F331} Rubber farm output paused — build Rubber Storage!', cat: 'event' });
      }
      s.cash -= RUBBER_FARM.operatingCost;
      if (farmOutput > 0 && rubberStorageCap > 0 && s.day % 7 === 0) {
        s.log.push({ msg: `\u{1F331} Rubber farm produced ${farmOutput * 7} units this week`, cat: 'sale' });
      }
    }

    if (s.factory.syntheticLab) {
      const labLevel = SYNTHETIC_LAB.levels.find(l => l.level === s.factory.syntheticLab.level) || SYNTHETIC_LAB.levels[0];
      let labOutput = labLevel.dailyOutput; // immune to weather by default
      // synthetic_chemical_shortage halves synthetic output
      const activeGlobal2 = shared.globalEvents || [];
      const hasChemShortage = activeGlobal2.some(e => e.id === 'synthetic_chemical_shortage');
      if (hasChemShortage) labOutput = Math.floor(labOutput * 0.5);

      const totalAfterFarm = (s.factory.naturalRubber || 0) + (s.factory.syntheticRubber || 0);
      if (rubberStorageCap > 0) {
        const spaceLeft = Math.max(0, rubberStorageCap - totalAfterFarm);
        const stored = Math.min(labOutput, spaceLeft);
        s.factory.syntheticRubber = (s.factory.syntheticRubber || 0) + stored;
        if (stored < labOutput && s.day % 7 === 0) {
          s.log.push({ msg: `\u{1F9EA} Synthetic lab: ${labOutput - stored} units wasted — storage full!`, cat: 'event' });
        }
      } else if (s.day % 7 === 0) {
        s.log.push({ msg: '\u{1F9EA} Synthetic lab output paused — build Rubber Storage!', cat: 'event' });
      }
      s.cash -= SYNTHETIC_LAB.operatingCost;
      // Synthetic lab increases chemical index
      s.factory.rawMaterials.chemicals = Math.min(
        RAW_MATERIALS.chemicals.max,
        (s.factory.rawMaterials.chemicals || 1.0) + SYNTHETIC_LAB.chemicalIndexIncrease / 30
      );
      if (labOutput > 0 && rubberStorageCap > 0 && s.day % 7 === 0) {
        s.log.push({ msg: `\u{1F9EA} Synthetic lab produced ${labOutput * 7} units this week`, cat: 'sale' });
      }
    }
  }

  // ── EXCLUSIVITY DEAL GENERATION (monthly) ──
  if (s.hasFactory && s.factory && (s.factory.brandReputation || 0) >= 20 && s.day % 30 === 0) {
    if (!s.factory.exclusivityOffers) s.factory.exclusivityOffers = [];
    if (!s.factory.exclusivityDeals) s.factory.exclusivityDeals = [];
    // Clean expired offers
    s.factory.exclusivityOffers = s.factory.exclusivityOffers.filter(o => s.day - o.offeredDay < 14);

    const pendingCount = s.factory.exclusivityOffers.length;
    if (pendingCount < 3 && Math.random() < 0.6) {
      const aiShopNames = ['AutoZone Express', 'QuikTire Co', 'Metro Tire Depot', 'Highway Tire Supply', 'CrossCountry Treads', 'Urban Tire Works'];
      const tireTypes = Object.keys(FACTORY.productionCost);
      const tireType = tireTypes[Math.floor(Math.random() * tireTypes.length)];
      const monthlyQty = 100 + Math.floor(Math.random() * 400);
      const baseCost = FACTORY.productionCost[tireType] || 50;
      const priceMult = 1.3 + Math.random() * 0.4; // 130-170% of production cost
      const pricePerUnit = Math.round(baseCost * priceMult);
      const durationMonths = 3 + Math.floor(Math.random() * 10); // 3-12 months
      const shopName = aiShopNames[Math.floor(Math.random() * aiShopNames.length)];

      s.factory.exclusivityOffers.push({
        id: `excl_${s.day}_${Math.floor(Math.random() * 9999)}`,
        shopName,
        tireType,
        monthlyQty,
        pricePerUnit,
        durationMonths,
        totalQty: monthlyQty * durationMonths,
        offeredDay: s.day,
        expiresDay: s.day + 14,
      });
      s.log.push({ msg: `Exclusivity offer from ${shopName}: ${monthlyQty}/mo of ${tireType} at $${pricePerUnit}/unit for ${durationMonths} months`, cat: 'event' });
    }
  }

  // ── EXCLUSIVITY DEAL FULFILLMENT (daily) ──
  if (s.hasFactory && s.factory?.exclusivityDeals?.length > 0) {
    for (const deal of s.factory.exclusivityDeals) {
      if (deal.status !== 'active') continue;
      if (s.day > deal.endDay) {
        deal.status = 'completed';
        s.log.push({ msg: `Exclusivity deal with ${deal.shopName} completed! Delivered ${deal.deliveredQty}/${deal.totalQty}`, cat: 'event' });
        continue;
      }

      // Daily shipment = monthlyQty / 30
      const dailyTarget = Math.ceil(deal.monthlyQty / 30);
      const storeKey = getBrandTireKey(deal.tireType);
      const available = s.warehouseInventory[storeKey] || 0;
      const shipped = Math.min(dailyTarget, available);

      if (shipped > 0) {
        s.warehouseInventory[storeKey] = available - shipped;
        deal.deliveredQty = (deal.deliveredQty || 0) + shipped;
        const revenue = shipped * deal.pricePerUnit;
        s.cash += revenue;
      }

      // Missed delivery penalty — check weekly
      if (shipped < dailyTarget && s.day % 7 === 0) {
        s.factory.brandReputation = Math.max(0, (s.factory.brandReputation || 0) - 1);
        s.log.push({ msg: `Missed exclusivity delivery to ${deal.shopName} — brand rep -1`, cat: 'event' });
      }
    }
    // Clean up completed deals (keep last 10 for history)
    const completed = s.factory.exclusivityDeals.filter(d => d.status === 'completed');
    if (completed.length > 10) {
      s.factory.exclusivityDeals = s.factory.exclusivityDeals.filter(d => d.status === 'active')
        .concat(completed.slice(-10));
    }
  }

  // ── FACTORY WHOLESALE ORDERS (AI shops buying from player) ──
  if (s.hasFactory && s.factory?.isDistributor) {
    const allTiresWS = getAllTires(s);
    const brandRep = s.factory.brandReputation || 0;
    for (const aiShop of (shared.aiShops || [])) {
      if (Math.random() > 1/7) continue; // weekly ordering
      // Attribute-boosted buy chance
      const wsAttrs = computeTireAttributes(s.factory);
      const avgAttrScore = (wsAttrs.grip + wsAttrs.durability + wsAttrs.comfort + wsAttrs.treadLife + wsAttrs.efficiency) / 5;
      const buyChance = brandRep * 0.006 + avgAttrScore * 0.003; // max ~0.78
      if (Math.random() > buyChance) continue;

      // Pick a tire type the shop might want that player produces
      const producibleKeys = Object.keys(FACTORY.productionCost);
      const brandedKeys = producibleKeys.map(k => getBrandTireKey(k));
      const availableKeys = brandedKeys.filter(k => (s.warehouseInventory[k] || 0) > 0);
      if (availableKeys.length === 0) continue;
      const chosenKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
      const stock = s.warehouseInventory[chosenKey] || 0;

      // Order qty: 5-50, constrained by stock
      const orderQty = Math.min(stock, Math.floor(5 + Math.random() * 45));
      if (orderQty <= 0) continue;

      // Find customer record
      const shopId = aiShop.id || aiShop.name;
      let customer = s.factory.customerList.find(c => c.id === shopId);
      if (!customer) {
        customer = { id: shopId, name: aiShop.name || 'AI Shop', totalPurchased: 0, lastOrderDay: 0 };
        s.factory.customerList.push(customer);
      }

      // Apply discount tier
      const tier = getCustomerTier(s.factory, customer.totalPurchased);
      const baseType = chosenKey.replace('brand_', '');
      const wsPrice = s.factory.wholesalePrices?.[baseType] || Math.round((FACTORY.productionCost[baseType] || 50) * 1.5);
      const discountedPrice = Math.round(wsPrice * (1 - tier.disc));

      // Shipping cost (6a: oil commodity affects shipping)
      const shopDist = Math.floor(Math.random() * 1500);
      const zone = SHIPPING_ZONES.find(z => shopDist <= z.maxDist) || SHIPPING_ZONES[SHIPPING_ZONES.length - 1];
      const shippingCost = orderQty * zone.costPerTire * (shared.commodities?.oil || 1.0);

      // Execute the sale
      s.warehouseInventory[chosenKey] -= orderQty;
      const grossRev = orderQty * discountedPrice;
      const netRev = grossRev - shippingCost;
      s.cash += netRev;
      s.dayRev += grossRev;
      s.dayProfit += netRev - orderQty * (FACTORY.productionCost[baseType] || 50);
      s.daySold += orderQty;
      s.dayRevByChannel.factoryWholesale = (s.dayRevByChannel.factoryWholesale || 0) + grossRev;
      s.daySoldByChannel.factoryWholesale = (s.daySoldByChannel.factoryWholesale || 0) + orderQty;
      s.daySoldByType[chosenKey] = (s.daySoldByType[chosenKey] || 0) + orderQty;

      // Track
      customer.totalPurchased += orderQty;
      customer.lastOrderDay = s.day;
      s.factory.totalWholesaleRev = (s.factory.totalWholesaleRev || 0) + grossRev;
      s.factory.totalWholesaleOrders = (s.factory.totalWholesaleOrders || 0) + 1;
      s.factory.orderHistory.push({ shopId, shopName: aiShop.name || 'AI Shop', tire: chosenKey, qty: orderQty, price: discountedPrice, day: s.day, tier: tier.label });
      if (s.factory.orderHistory.length > 100) s.factory.orderHistory = s.factory.orderHistory.slice(-100);

      const tireName = allTiresWS[chosenKey]?.n || chosenKey;
      s.log.push({ msg: `\u{1F3ED} ${aiShop.name || 'Shop'} ordered ${orderQty} ${tireName} ($${fmt(grossRev)})`, cat: 'sale' });
    }
  }

  // ── VINNIE'S SCHEMES ──
  if (s.hasFactory && s.factory && Math.random() < 0.02) {
    const hasCFO = !!s.factory.hasCFO;
    if (!hasCFO || Math.random() > CFO_ROLE.vinnieBlockChance) {
      const scheme = VINNIE_SCHEMES[Math.floor(Math.random() * VINNIE_SCHEMES.length)];
      const schemeQty = scheme.qty[0] + Math.floor(Math.random() * (scheme.qty[1] - scheme.qty[0]));
      const totalSchemeCost = schemeQty * scheme.tireCost;
      if (s.cash >= totalSchemeCost) {
        s.cash -= totalSchemeCost;
        s.factory.vinnieInventory[scheme.id] = {
          qty: (s.factory.vinnieInventory[scheme.id]?.qty || 0) + schemeQty,
          costPer: scheme.tireCost,
          day: s.day,
          sellRate: scheme.sellRate,
          name: scheme.name,
        };
        s.factory.vinnieTotalLoss = (s.factory.vinnieTotalLoss || 0); // track later
        s.log.push({ msg: `Vinnie: ${scheme.desc} \u2014 bought ${schemeQty} for $${fmt(totalSchemeCost)}`, cat: 'vinnie' });
      }
    } else {
      s.log.push({ msg: `Your CFO blocked one of Vinnie's "deals." Smart hire.`, cat: 'vinnie' });
    }
  }

  // ── VINNIE INVENTORY LIQUIDATION ──
  if (s.hasFactory && s.factory) {
    for (const [schemeId, item] of Object.entries(s.factory.vinnieInventory)) {
      if (!item || item.qty <= 0) { delete s.factory.vinnieInventory[schemeId]; continue; }
      const daysSincePurchase = s.day - (item.day || 0);
      if (daysSincePurchase > 90 && item.qty > 0) {
        // Dump remaining at 20% of cost
        const dumpRev = Math.round(item.qty * item.costPer * 0.20);
        const loss = item.qty * item.costPer - dumpRev;
        s.cash += dumpRev;
        s.factory.vinnieTotalLoss = (s.factory.vinnieTotalLoss || 0) + loss;
        s.log.push({ msg: `Vinnie: "Alright kid, the ${item.name} thing didn't work out." Dumped ${item.qty} for $${fmt(dumpRev)} (lost $${fmt(loss)})`, cat: 'vinnie' });
        delete s.factory.vinnieInventory[schemeId];
      } else {
        // Trickle sell at 30-60% of cost
        const sellQty = Math.max(1, Math.floor(item.qty * item.sellRate));
        const sellPricePer = Math.round(item.costPer * (0.3 + Math.random() * 0.3));
        const sellRev = sellQty * sellPricePer;
        const loss = sellQty * item.costPer - sellRev;
        s.cash += sellRev;
        item.qty -= sellQty;
        s.factory.vinnieTotalLoss = (s.factory.vinnieTotalLoss || 0) + loss;
        if (item.qty <= 0) delete s.factory.vinnieInventory[schemeId];
      }
    }
  }

  // ── VINNIE CHAOS EVENTS ──
  if (s.hasFactory && s.factory) {
    // "Quality Shortcut" — 1/80 days: next batch has 2x defect rate
    if (Math.random() < 1/80) {
      s.factory._vinnieQualityShortcut = true;
      s.log.push({ msg: `Vinnie: "Nobody's gonna notice a few bubbles..." (next batch: 2x defect rate)`, cat: 'vinnie' });
    }
    // "Vinnie's Marketing Genius" — 1/60 days: spend $10k-$50k for 1-3 brand rep
    if (Math.random() < 1/60) {
      const adCost = 10000 + Math.floor(Math.random() * 40000);
      if (s.cash >= adCost) {
        s.cash -= adCost;
        const repGain = 1 + Math.floor(Math.random() * 3);
        s.factory.brandReputation = Math.min(100, (s.factory.brandReputation || 0) + repGain);
        s.factory.vinnieTotalLoss = (s.factory.vinnieTotalLoss || 0) + adCost;
        s.log.push({ msg: `Vinnie spent $${fmt(adCost)} on a blimp ad. (+${repGain} brand rep... barely worth it)`, cat: 'vinnie' });
      }
    }
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

  // ── GLOBAL EVENT MODIFIERS ──
  let globalDemandMult = 1;
  let globalCostMult = 1;
  let globalBrandedDemandMult = 1;
  let globalUsedDemandMult = 1;
  let globalEvDemandMult = 1;
  let globalWinterDemandMult = 1;
  const activeGlobalEvents = shared.globalEvents || [];
  for (const ge of activeGlobalEvents) {
    const def = GLOBAL_EVENTS.find(e => e.id === ge.id);
    if (!def) continue;
    const fx = def.effects;
    if (fx.demandMult) globalDemandMult *= fx.demandMult;
    if (fx.productionCostMult) globalCostMult *= fx.productionCostMult;
    if (fx.brandedDemandMult) globalBrandedDemandMult *= fx.brandedDemandMult;
    if (fx.usedDemandMult) globalUsedDemandMult *= fx.usedDemandMult;
    if (fx.evDemandMult) globalEvDemandMult *= fx.evDemandMult;
    if (fx.winterDemandMult) globalWinterDemandMult *= fx.winterDemandMult;
    if (fx.overtimeCostMult) globalCostMult *= fx.overtimeCostMult;
    // Log event start once
    if (ge.startDay === s.day) {
      s.log.push({ msg: `${def.icon} Global Event: ${def.name} — ${def.description}`, cat: 'event' });

      // ── EARTHQUAKE DAMAGE — one-time hit on event start ──
      if (fx.earthquake) {
        const ins = s.insurance && INSURANCE[s.insurance];
        const hasEarthquakeCover = ins && ins.covers.includes('earthquake');
        let totalDamage = 0;

        // Damage each shop: $5K-$20K per location based on loyalty (better shop = more to fix)
        for (const loc of (s.locations || [])) {
          const shopDamage = 5000 + Math.floor(Math.random() * 15000) + (loc.loyalty || 0) * 100;
          totalDamage += shopDamage;
          loc.loyalty = Math.max(0, (loc.loyalty || 0) - Math.floor(Math.random() * 8 + 2));
        }

        // Damage factory: $25K-$75K if they have one
        if (s.factory) {
          const factoryDamage = 25000 + Math.floor(Math.random() * 50000) * (s.factory.level || 1);
          totalDamage += factoryDamage;
          // Halt production by clearing all line queues
          for (const line of (s.factory.lines || [])) {
            line.queue = [];
            line.status = 'idle';
          }
        }

        if (totalDamage > 0) {
          if (hasEarthquakeCover) {
            // Insured: pay 20% deductible
            const deductible = Math.round(totalDamage * 0.20);
            s.cash -= deductible;
            s.log.push({ msg: `${def.icon} Earthquake damage: $${deductible.toLocaleString()} deductible (insurance covered $${(totalDamage - deductible).toLocaleString()})`, cat: 'event' });
          } else {
            // Uninsured: pay full repair cost
            s.cash -= totalDamage;
            s.log.push({ msg: `${def.icon} Earthquake damage: $${totalDamage.toLocaleString()} in repairs (NO INSURANCE!)`, cat: 'event' });
          }
          s.reputation = Math.max(0, s.reputation - 2);
          s.log.push({ msg: `⭐ Rep -2 (earthquake damage)`, cat: 'event', day: s.day + (s.startDay || 1) - 1 });
        }
      }
    }
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

  // ── AUTO-REORDER FROM SUPPLIERS (keeps warehouse stocked) ──
  // If player has autoRestock enabled and warehouse is below threshold, auto-order
  if (s.autoRestock && s.autoRestock.enabled && (s.unlockedSuppliers || []).length > 0) {
    const whInv = Object.values(s.warehouseInventory || {}).reduce((a, b) => a + b, 0);
    const whCap = getStorageCap(s);
    const fillPct = whCap > 0 ? whInv / whCap : 1;
    const threshold = s.autoRestock.threshold || 0.3; // Reorder when below 30%
    
    if (fillPct < threshold && s.cash > 10000) {
      // Pick the cheapest unlocked supplier
      const supIdx = (s.unlockedSuppliers || [])[0]; // First unlocked
      const sup = SUPPLIERS[supIdx];
      if (sup) {
        const budget = Math.min(s.cash * 0.15, s.autoRestock.maxSpend || 50000); // Max 15% of cash or cap
        const freeSpace = whCap - whInv;
        
        // Order tires proportionally based on recent sales history
        const salesHistory = s.salesByType || [];
        // Aggregate last 7 days of sales for a better signal
        // Map branded tire sales (brand_allSeason) back to base types (allSeason)
        const recentSales = {};
        for (let si = Math.max(0, salesHistory.length - 7); si < salesHistory.length; si++) {
          for (const [t, q] of Object.entries(salesHistory[si] || {})) {
            if (t === 'day') continue;
            const baseKey = t.startsWith('brand_') ? t.replace('brand_', '') : t;
            if (TIRES[baseKey]) recentSales[baseKey] = (recentSales[baseKey] || 0) + (q || 0);
          }
        }
        const tireTypes = Object.keys(TIRES).filter(k => !TIRES[k].used);
        const totalSales = Object.values(recentSales).reduce((a, b) => a + b, 0) || 1;

        // Sort by most sold recently
        tireTypes.sort((a, b) => ((recentSales[b] || 0) - (recentSales[a] || 0)));

        // Always stock at least 4 types for variety, even if only 1 type has sold
        const typesToStock = tireTypes.filter(t => (recentSales[t] || 0) > 0);
        // Fill to minimum of 4 types with next most popular standard types
        for (const t of tireTypes) {
          if (typesToStock.length >= 4) break;
          if (!typesToStock.includes(t)) typesToStock.push(t);
        }

        // Cap max share per type at 40% to ensure diversity
        const MAX_SHARE = 0.40;
        let spent = 0;
        let ordered = 0;
        for (const tire of typesToStock) {
          if (spent >= budget || ordered >= freeSpace) break;
          const t = TIRES[tire];
          const priceMult = shared?.supplierPrices?.[supIdx]?.[tire] || shared?.supplierPricing?.[tire] || 1.0;
          const unitCost = Math.round(t.bMin * priceMult * (1 - (sup.disc || 0)));
          if (unitCost <= 0) continue;
          // Allocate space proportionally to sales share, capped at MAX_SHARE, min 5 units
          const salesShare = Math.min(MAX_SHARE, (recentSales[tire] || 0) / totalSales);
          const targetQty = Math.max(5, Math.round(freeSpace * salesShare));
          const canAfford = Math.floor((budget - spent) / unitCost);
          const qty = Math.min(canAfford, targetQty, freeSpace - ordered);
          if (qty > 0) {
            const totalCost = qty * unitCost;
            s.cash -= totalCost;
            s.warehouseInventory[tire] = (s.warehouseInventory[tire] || 0) + qty;
            spent += totalCost;
            ordered += qty;
          }
        }
        if (ordered > 0) {
          s.log.push({ msg: `\u{1F504} Auto-restock: ordered ${ordered} tires ($${Math.round(spent).toLocaleString()}) from ${sup.n}`, cat: 'source' });
        }
      }
    }
  }

  // ── AUTO-FILL STORES FROM WAREHOUSE (requires drivers) ──
  const driverCount = s.staff.drivers || 0;
  if (driverCount > 0 && s.locations.length > 0) {
    const driverCap = driverCount * 40; // 40 tires per driver per day
    let moved = 0;

    // Distribute driver capacity evenly across all stores (round-robin)
    const perStoreCap = Math.max(1, Math.floor(driverCap / s.locations.length));

    for (const loc of s.locations) {
      if (moved >= driverCap) break;
      if (!loc.inventory) loc.inventory = {};
      const storeAlloc = Math.min(perStoreCap, driverCap - moved);

      // ── STOCKING PREFERENCES — filter what gets pushed to this location ──
      const prefs = loc.stockingPrefs || { mode: 'all', tireTypes: [] };

      // Vinnie mode: smart stocking based on city climate + season
      let vinnieTypes = null;
      if (prefs.mode === 'vinnie') {
        const locCity = CITIES ? CITIES.find(c => c.id === loc.cityId) : null;
        const lat = locCity?.lat || 40;
        const winMult = locCity?.win || 1.0;
        const isWarm = lat < 33;
        const isCold = lat > 42 || winMult >= 1.3;
        const cal = getCalendar(s.day + (s.startDay || 1) - 1);
        const season = cal?.season || 'Spring';
        const isWinter = season === 'Winter' || season === 'Fall';

        // Build priority list based on climate + season
        vinnieTypes = new Set(['allSeason']); // Always stock all-season
        if (!isWarm) vinnieTypes.add('lightTruck');
        if (isWinter && isCold) { vinnieTypes.add('winter'); vinnieTypes.add('premiumAllWeather'); }
        else if (isWinter && !isWarm) { vinnieTypes.add('winter'); }
        if (!isWinter || isWarm) { vinnieTypes.add('performance'); vinnieTypes.add('evTire'); }
        if (isWarm) { vinnieTypes.add('performance'); vinnieTypes.add('luxuryTouring'); }
        vinnieTypes.add('commercial'); // Always some commercial
        if (lat > 35) vinnieTypes.add('runFlat'); // Urban areas
        // Use sales history to boost best sellers
        const history = loc.salesHistory || {};
        const topSellers = Object.entries(history).sort((a, b) => b[1] - a[1]).slice(0, 5);
        for (const [k] of topSellers) { vinnieTypes.add(k); }
      }

      const isAllowed = (tireKey) => {
        const baseKey = tireKey.startsWith('brand_') ? tireKey.slice(6) : tireKey;
        if (prefs.mode === 'vinnie') return vinnieTypes ? vinnieTypes.has(baseKey) : true;
        if (prefs.mode === 'all') return true;
        if (prefs.mode === 'whitelist') return (prefs.tireTypes || []).includes(tireKey) || (prefs.tireTypes || []).includes(baseKey);
        if (prefs.mode === 'blacklist') return !(prefs.tireTypes || []).includes(tireKey) && !(prefs.tireTypes || []).includes(baseKey);
        return true;
      };

      // Move tires from warehouse to this location (shuffle to avoid always prioritizing same types)
      const whEntries = Object.entries(s.warehouseInventory || {})
        .filter(([k, q]) => q > 0 && isAllowed(k));
      for (let i = whEntries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [whEntries[i], whEntries[j]] = [whEntries[j], whEntries[i]];
      }
      let storeMoved = 0;
      for (const [k, whQty] of whEntries) {
        if (storeMoved >= storeAlloc || moved >= driverCap) break;
        const currentWhQty = s.warehouseInventory[k] || 0;
        if (currentWhQty <= 0) continue;
        const locFree = getLocCap(loc) - getLocInv(loc);
        if (locFree <= 0) break;
        const take = Math.min(currentWhQty, locFree, storeAlloc - storeMoved, driverCap - moved);
        if (take <= 0) continue;
        s.warehouseInventory[k] -= take;
        loc.inventory[k] = (loc.inventory[k] || 0) + take;
        moved += take;
        storeMoved += take;
      }
    }
    if (moved > 0) {
      s.log.push({ msg: `\u{1F69A} Drivers moved ${moved} tires from warehouse to stores`, cat: 'source' });
    }
  }

  // ── CONSOLIDATE USED TIRES FROM SHOPS → WAREHOUSE (requires drivers) ──
  if (driverCount > 0 && s.locations.length > 0) {
    let usedMoved = 0;
    const usedKeys = ['used_junk', 'used_poor', 'used_good', 'used_premium'];
    const whCap = getStorageCap(s);

    for (const loc of s.locations) {
      if (!loc.inventory) continue;
      for (const uk of usedKeys) {
        const qty = loc.inventory[uk] || 0;
        if (qty <= 0) continue;
        const whInv = Object.values(s.warehouseInventory || {}).reduce((a, b) => a + b, 0);
        const whFree = whCap - whInv;
        if (whFree <= 0) break;
        const take = Math.min(qty, whFree);
        loc.inventory[uk] -= take;
        if (loc.inventory[uk] <= 0) delete loc.inventory[uk];
        s.warehouseInventory[uk] = (s.warehouseInventory[uk] || 0) + take;
        usedMoved += take;
      }
    }
    if (usedMoved > 0) {
      s.log.push({ msg: `♻️ Drivers consolidated ${usedMoved} used tires from shops to warehouse`, cat: 'source' });
    }
  }

  // ── RETAIL SALES (per-location inventory) — daily ──
  let newTiresSold = 0;
  const locTakeOffSources = {};
  if (s.locations.length > 0) {
    // Staff capacity: techs = output (installs), sales = demand (customers)
    // Per-location daily cap based on staff headcount
    const techCap = s.staff.techs * 12;
    const salesCap = s.staff.sales * 10;
    const staffCapTotal = Math.min(techCap, salesCap) * (1 + s.staff.managers * .15);
    const repBoostActive = s.repBoost && s.day < s.repBoost.expiresDay;
    const effectiveRep = s.reputation + (repBoostActive ? (s.repBoost.amount || 5) : 0);
    const demandMult = sDem * (1 + effectiveRep * .01) * (s._tB || 1);
    // whPenalty intentionally 1 — warehouse staff system (loaders, forklifts, etc.)
    // exists in getWhStaffReq/getWhShortage but has no player-facing hire UI yet.
    // TODO: restore penalty when StoragePanel gets warehouse staff hiring:
    //   const whPenalty = Math.max(0.1, 1 - getWhShortage(s) * .08);
    const whPenalty = 1;

    // 16a: Early game boost: logarithmic decay over 270 days (no cliff)
    const earlyBoostShop = s.day < 270
      ? 1 + Math.max(0, Math.log(270 - s.day) / Math.log(270))
      : 1;

    // Global staff capacity pool shared across all locations
    let remainingStaffCapGlobal = staffCapTotal;

    for (const loc of s.locations) {
      if (!loc.inventory) loc.inventory = {};
      loc.dailyStats = { rev: 0, sold: 0, profit: 0, soldByType: {} };
      let remainingStaffCap = remainingStaffCapGlobal;
      const city = (shared.cities || []).find(c => c.id === loc.cityId) || { dem: 50, cost: 1, win: 0 };
      // ── LOYALTY UPDATE ──
      const locLoyalty = loc.loyalty || 0;
      let priceRatio = 0, priceCount = 0;
      for (const [k2, t2] of Object.entries(getAllTires(s))) {
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
      const premiumTrafficMult = s.isPremium ? 1.08 : 1;
      const blitzMult = (s.marketingBlitz && s.day < s.marketingBlitz.expiresDay) ? 1.5 : 1;
      let locDemand = Math.max(1, Math.floor(city.dem * .25 * demandMult * whPenalty * earlyBoostShop * loyaltyMult * marketingMult * marketShareMult * monopolyMult * holidayMult * premiumTrafficMult * globalDemandMult * blitzMult));
      let locNewSold = 0;

      const retailTires = getAllTires(s);
      for (const [k, t] of Object.entries(retailTires)) {
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
        // Branded tire demand boost: attributes + brand reputation
        let brandBoost = 1;
        if (t.branded && s.factory) {
          const tireAttrs = computeTireAttributes(s.factory);
          const baseType = t.baseType || k.replace('brand_', '');
          brandBoost = getTireAttrMultiplier(tireAttrs, baseType) * (1 + (s.factory.brandReputation || 0) * 0.003);
        }
        // Global event modifiers for branded / used / EV tires
        const geBrandMod = t.branded ? globalBrandedDemandMult : 1;
        const geUsedMod = t.used ? globalUsedDemandMult : 1;
        const geEvMod = t.ev ? globalEvDemandMult : 1;
        const geWinterMod = (t.seas && season === 'Winter') ? globalWinterDemandMult : 1;

        const evAdoptionMult = t.ev ? (1 + Math.min(2.0, s.day / 365 * 0.5)) : 1;
        const emergencyMult = t.emergency ? (1 + (Math.random() < 0.05 ? 3 : 0)) : 1;
        // Regional demand profile: city-specific demand multiplier per tire category
        const cityProfile = CITY_DEMAND_PROFILES[loc.cityId] || {};
        const regionMult = cityProfile[k] || cityProfile[k.replace('brand_', '')] || 1.0;
        let qty = Math.min(
          locStock,
          Math.floor(locDemand * (.25 + Math.random() * .15) * winterMult * agMult * priceMult * evAdoptionMult * emergencyMult * tireSeasonMult * brandBoost * geBrandMod * geUsedMod * geEvMod * geWinterMod * regionMult)
        );
        qty = Math.min(qty, Math.ceil(remainingStaffCap));
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
        loc.dailyStats.soldByType[k] = (loc.dailyStats.soldByType[k] || 0) + qty;
        // Rolling best sellers — accumulate over time
        if (!loc.salesHistory) loc.salesHistory = {};
        loc.salesHistory[k] = (loc.salesHistory[k] || 0) + qty;
        s.dayRevByChannel.shops += rev;
        s.daySoldByChannel.shops += qty;
        s.daySoldByType[k] = (s.daySoldByType[k] || 0) + qty;
        if (!t.used) {
          newTiresSold += qty;
          locNewSold += qty;
        }
        locDemand -= qty;
        remainingStaffCap -= qty;
      }
      // Sync staff capacity back to global pool
      remainingStaffCapGlobal = remainingStaffCap;
      locTakeOffSources[loc.id] = locNewSold;
    }
  }

  // ── SHOP SERVICES — daily ──
  s.dayServiceRev = 0;
  s.dayServiceJobs = 0;
  if (s.locations.length > 0 && s.staff.techs > 0) {
    // Daily tech capacity (12 per tech)
    const totalTechCap = s.staff.techs * 12 * (1 + s.staff.managers * .15);
    const usedByTires = s.daySold;
    const spareCap = Math.max(0, totalTechCap - usedByTires);

    // 16g: Daily service demand — increased base for meaningful revenue
    const svcDemandBase = s.locations.length * (1.2 + s.reputation * .05) * sDem;
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
      const repPen = Math.round((disposalFee - 3) * 0.01 * totalTakeOffs * 100) / 100;
      s.reputation = C(s.reputation - repPen, 0, 100);
      if (repPen > 0.01) s.log.push({ msg: `⭐ Rep -${repPen} (high disposal fee)`, cat: 'event', day: s.day + (s.startDay || 1) - 1 });
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

  // ── VAN SALES — daily (scales down when stores exist) ──
  {
    // Graded van-to-shop transition: van sales taper as more shops open
    const vanScale = Math.max(0.15, 1 - s.locations.length * 0.2);
    const wh = s.warehouseInventory || {};
    const whTotal = Object.values(wh).reduce((a, b) => a + b, 0);
    if (whTotal > 0) {
      // Early boost: smooth exponential decay (~2x at day 1, asymptotically → 1x)
      const earlyBoost = 1 + Math.exp(-s.day / 120);
      // Base demand scales with rep (8 base → grows)
      const baseDemand = 8 + s.reputation * 0.4;
      const vanDemand = Math.max(2, Math.floor(baseDemand * sDem * (s._tB || 1) * earlyBoost * holidayMult * vanScale));
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
        s.daySoldByChannel.van += qty;
        s.daySoldByType[k] = (s.daySoldByType[k] || 0) + qty;
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

    // Each stand has its own capacity — scales UP with more stands
    const capsPerStand = 20 + numStands * 5; // 1=25, 2=30 each, 3=35 each

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
        s.daySoldByChannel.flea += sellQty;
        s.daySoldByType[k] = (s.daySoldByType[k] || 0) + sellQty;
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
          s.daySoldByChannel.carMeets += sellQty;
          s.daySoldByType[k] = (s.daySoldByType[k] || 0) + sellQty;
          meetSold += sellQty;
        }
        if (meetSold > 0) {
          s.log.push({ msg: `\u{1F3CE}\uFE0F ${meet.name}: sold ${meetSold} tires`, cat: 'sale' });
        }
      }
    }
  }

  // Distribution center coverage count (used by wholesale + ecom for delivery bonuses)
  const dcCoverage = (s.distCenters || []).length;

  // ── WHOLESALE ──
  if (s.hasWholesale) {
    if (!s.wsClients) s.wsClients = [];

    // Auto-generate new clients based on reputation + capacity (weekly chance)
    if (s.day % 7 === 0) {
      // 16i: Client cap scales with reputation + warehouse capacity
      const whCapacity = getCap(s) - (s.locations || []).reduce((a, l) => a + getLocCap(l), 0);
      const warehouseBonus = Math.floor(Math.max(0, whCapacity) / 5000);
      const maxClients = Math.floor(s.reputation / 8) + warehouseBonus;
      if (s.wsClients.length < maxClients && Math.random() < 0.4) {
        const WS_CLIENT_NAMES = [
          'Metro Fleet Services', 'County Transit Authority', 'Regional Auto Group',
          'Swift Logistics', 'Heartland Trucking', 'Eagle Transport Co',
          'Downtown Auto Mall', 'Valley Car Dealers', 'National Rental Corp',
          'Premier Fleet Mgmt', 'Interstate Freight', 'Coastal Delivery Inc',
          'Union Bus Lines', 'Capital City Motors', 'Suburban Auto Network',
          'Pro Haulers LLC', 'Central Dispatch', 'Liberty Motor Pool',
          'Patriot Freight', 'Summit Transport Group',
        ];
        const usedNames = new Set(s.wsClients.map(c => c.name));
        const available = WS_CLIENT_NAMES.filter(n => !usedNames.has(n));
        if (available.length > 0) {
          const tireKeys = Object.keys(TIRES).filter(k => !k.startsWith('used_') && !k.startsWith('brand_'));
          const newClient = {
            id: `wsc-${s.day}-${Math.random().toString(36).slice(2, 8)}`,
            name: available[R(0, available.length - 1)],
            preferredTire: tireKeys[R(0, tireKeys.length - 1)],
            minOrder: R(5, 15),
            maxOrder: R(20, 50),
            joinedDay: s.day,
            satisfaction: 100,
            totalOrdered: 0,
            failedOrders: 0,
          };
          s.wsClients.push(newClient);
          s.log.push({ msg: `New wholesale client: ${newClient.name} (wants ${TIRES[newClient.preferredTire]?.n || newClient.preferredTire})`, cat: 'wholesale' });
        }
      }

      // Clients leave if satisfaction drops too low
      s.wsClients = s.wsClients.filter(c => {
        if (c.satisfaction <= 20) {
          s.log.push({ msg: `Wholesale client ${c.name} left (too many unfilled orders)`, cat: 'wholesale' });
          return false;
        }
        return true;
      });
    }

    // Fulfill wholesale orders (~once per week per client)
    let monthlyVol = 0;
    for (const client of s.wsClients) {
      if (Math.random() > 1/7) continue;
      const qty = R(client.minOrder || 5, client.maxOrder || 20);
      const tire = client.preferredTire || 'allSeason';
      const t = TIRES[tire];
      const totalStock = (s.warehouseInventory?.[tire] || 0) +
        s.locations.reduce((a, l) => a + (l.inventory?.[tire] || 0), 0);
      if (!t || totalStock < qty) {
        client.failedOrders = (client.failedOrders || 0) + 1;
        client.satisfaction = Math.max(0, (client.satisfaction || 100) - 15);
        continue;
      }
      const pulled = pullFromStock(s, tire, qty);
      if (pulled <= 0) {
        client.failedOrders = (client.failedOrders || 0) + 1;
        client.satisfaction = Math.max(0, (client.satisfaction || 100) - 15);
        continue;
      }
      // Successful order — boost satisfaction
      client.satisfaction = Math.min(100, (client.satisfaction || 100) + 5);
      client.totalOrdered = (client.totalOrdered || 0) + pulled;
      monthlyVol += pulled;
      const margin = getWsMargin(s, client);
      const price = Math.round(t.def * (1 - margin));
      const rev = pulled * price;
      // DC coverage reduces wholesale delivery costs (closer fulfillment centers)
      const wsShipDisc = dcCoverage > 0 ? Math.min(0.40, dcCoverage * 0.08) : 0;
      const deliveryCost = pulled * Rf(WS_DELIVERY_COST.min, WS_DELIVERY_COST.max) * (1 - wsShipDisc);
      s.cash += rev - deliveryCost;
      s.dayRev += rev;
      s.dayProfit += rev - deliveryCost;
      s.daySold += pulled;
      s.dayRevByChannel.wholesale += rev;
      s.daySoldByChannel.wholesale += pulled;
      s.totalWholesaleRevenue = (s.totalWholesaleRevenue || 0) + rev;
      s.daySoldByType[tire] = (s.daySoldByType[tire] || 0) + pulled;
    }
    // Track monthly volume (rolling approximation: daily sales * 30)
    s.monthlyPurchaseVol = Math.round((s.monthlyPurchaseVol || 0) * 0.97 + monthlyVol * 4.3);
  }

  // ── E-COMMERCE REVENUE — daily (÷7) ──
  if (s.hasEcom) {
    const tier = getEcomTier(s.ecomTotalSpent || 0);
    let conv = ECOM_BASE_CONVERSION;
    let trafficMult = 1;

    for (const [role, info] of Object.entries(ECOM_STAFF)) {
      if ((s.ecomStaff || {})[role]) {
        if (info.convBoost) conv += info.convBoost;
        if (info.trafficBoost) trafficMult += info.trafficBoost;
      }
    }
    for (const upId of (s.ecomUpgrades || [])) {
      const up = ECOM_UPGRADES[upId];
      if (up?.convBoost) conv += up.convBoost;
      if (up?.trafficBoost) trafficMult += up.trafficBoost;
    }

    // Distribution center coverage bonus: more DCs = faster delivery = higher conversion
    // Each DC covers 1 region; 5 regions = national coverage = +12.5% conversion
    if (dcCoverage > 0) {
      conv += dcCoverage * 0.025; // +2.5% conversion per DC region
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
      // DC coverage reduces average shipping cost (closer fulfillment)
      const dcShipDisc = dcCoverage > 0 ? Math.min(0.40, dcCoverage * 0.08) : 0;
      // 6a: Oil commodity affects shipping costs
      const oilShipMult = (shared.commodities?.oil || 1.0);
      const ship = Rf(ECOM_SHIP_COST_RANGE[0], ECOM_SHIP_COST_RANGE[1]) * (1 - dcShipDisc) * oilShipMult;
      const fee = price * ECOM_PAYMENT_FEE;

      pullFromStock(s, k, 1);
      const net = price - ship - fee;
      s.cash += net;
      ecomRev += price;
      ecomSold++;
      s.daySoldByType[k] = (s.daySoldByType[k] || 0) + 1;
    }

    s.ecomDailyOrders = orders;
    s.ecomDailyRev = ecomRev;
    s.dayRev += ecomRev;
    s.daySold += ecomSold;
    s.dayRevByChannel.ecom += ecomRev;
    s.daySoldByChannel.ecom += ecomSold;
    s.totalEcomRevenue = (s.totalEcomRevenue || 0) + ecomRev;

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
      s.daySoldByChannel.gov += canDeliver;
      s.daySoldByType[gc.tire] = (s.daySoldByType[gc.tire] || 0) + canDeliver;
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
  // 6d: Inflation affects wages (±5% swing from inflation cycle)
  const wageMult = shared.inflationIndex || 1.0;

  // Staff payroll
  const payroll = Object.entries(s.staff).reduce((a, [k, v]) => a + (PAY[k] || 0) * v, 0) / 30 * wageMult;
  s.cash -= payroll;

  // Warehouse staff payroll
  const whPayroll = getWhPayroll(s) / 30 * wageMult;
  s.cash -= whPayroll;

  // Corp staff payroll
  const corpPayroll = Object.entries(s.corpStaff || {}).reduce(
    (a, [k, v]) => a + (CORP_PAY[k] || 0) * v, 0
  ) / 30 * wageMult;
  s.cash -= corpPayroll;

  // E-com staff payroll
  const ecomPayroll = Object.entries(s.ecomStaff || {}).reduce(
    (a, [role, hired]) => a + (hired ? (ECOM_STAFF[role]?.salary || 0) : 0), 0
  ) / 30 * wageMult;
  s.cash -= ecomPayroll;

  // Log daily cost summary (only if significant to avoid noise)
  const totalPayroll = payroll + whPayroll + corpPayroll + ecomPayroll;
  if (totalPayroll > 0) {
    const parts = [];
    if (payroll > 0) parts.push(`staff $${Math.round(payroll)}`);
    if (whPayroll > 0) parts.push(`warehouse $${Math.round(whPayroll)}`);
    if (corpPayroll > 0) parts.push(`corp $${Math.round(corpPayroll)}`);
    if (ecomPayroll > 0) parts.push(`ecom $${Math.round(ecomPayroll)}`);
    s.log.push({ msg: `💼 Payroll: $${Math.round(totalPayroll)} (${parts.join(', ')})`, cat: 'cost', day: s.day + (s.startDay || 1) - 1 });
  }

  // ── Franchise royalties + monthly fees ──
  // Processed daily (royalty % of today's shop revenue + monthly fee prorated)
  if ((s.franchises || []).length > 0) {
    for (const franchise of s.franchises) {
      if (franchise.status !== 'active') continue;
      const loc = (s.locations || []).find(l => l.id === franchise.locationId);
      if (!loc || !loc.franchise) continue;

      const locRev = loc.dailyStats?.rev || 0;
      const royaltyAmt = Math.floor(locRev * (loc.franchise.royaltyPct || 0));
      const dailyFee = Math.floor((loc.franchise.monthlyFee || 0) / 30);
      const totalOwed = royaltyAmt + dailyFee;

      if (s.cash >= totalOwed) {
        s.cash -= totalOwed;
        franchise.totalRoyaltiesPaid = (franchise.totalRoyaltiesPaid || 0) + totalOwed;
        franchise.missedPayments = 0;
        s.log.push({ msg: `🏪 ${loc.franchise.brandName} royalty: $${totalOwed.toLocaleString()} ($${royaltyAmt.toLocaleString()} rev + $${dailyFee.toLocaleString()} fee)`, cat: 'franchise' });

        // Check required brand compliance — franchisee must stock branded tires (brand_* keys)
        if (loc.franchise.requiredBrand) {
          const inv = loc.inventory || {};
          const hasRequired = Object.keys(inv).some(k => k.startsWith('brand_') && inv[k] > 0);
          if (!hasRequired) {
            franchise.brandViolationDays = (franchise.brandViolationDays || 0) + 1;
            s.reputation = Math.max(0, s.reputation - 0.2);
            if (franchise.brandViolationDays % 7 === 1) {
              s.log.push({ msg: `⚠️ ${loc.franchise.brandName}: not stocking required brand "${loc.franchise.requiredBrand}" — reputation penalty`, cat: 'franchise' });
            }
          } else {
            franchise.brandViolationDays = 0;
          }
        }

        // Queue royalty payment to franchisor — handled by tickLoop cross-player transfer
        if (!s._franchisePayments) s._franchisePayments = [];
        s._franchisePayments.push({
          franchisorId: franchise.franchisorId,
          amount: totalOwed,
          locationName: loc.name || loc.franchise.brandName,
          agreementId: franchise.agreementId,
        });
      } else {
        // Can't pay — missed payment
        franchise.missedPayments = (franchise.missedPayments || 0) + 1;
        s.log.push({ msg: `⚠️ Missed ${loc.franchise.brandName} royalty payment ($${totalOwed.toLocaleString()}) — ${franchise.missedPayments} missed`, cat: 'franchise' });

        if (franchise.missedPayments >= 3) {
          // Terminate for non-payment
          if (loc.franchise) delete loc.franchise;
          franchise.status = 'terminated_nonpayment';
          s.log.push({ msg: `❌ ${franchise.franchisorName} franchise TERMINATED — too many missed payments`, cat: 'franchise' });
        }
      }
    }
    // Apply loyalty boost from franchise brand recognition perk
    for (const loc of s.locations) {
      if (loc.franchise?.perks?.includes('brand_recognition')) {
        loc.loyalty = Math.min(100, (loc.loyalty || 0) + 0.1);
      }
    }
  }

  // E-com upgrade monthly costs
  const ecomUpgradeCost = (s.ecomUpgrades || []).reduce(
    (a, upId) => a + (ECOM_UPGRADES[upId]?.monthly || 0), 0
  ) / 30;
  s.cash -= ecomUpgradeCost;

  // E-com hosting
  if (s.hasEcom) {
    const ecomHosting = (ECOM_HOSTING_BASE + (s.ecomDailyOrders || 0) * ECOM_HOSTING_SCALE / 200) / 30;
    s.cash -= ecomHosting;
    if (ecomHosting > 0) {
      s.log.push({ msg: `🌐 E-com hosting: $${Math.round(ecomHosting)}/day`, cat: 'cost', day: s.day + (s.startDay || 1) - 1 });
    }
  }

  // Track ecom investment + revenue toward tier progression
  // Tier is driven by total ecom spend AND revenue — both count
  if (s.hasEcom) {
    const dailyEcomContrib = ((ecomPayroll + ecomUpgradeCost) / 30) + (s.ecomDailyRev || 0);
    if (dailyEcomContrib > 0) {
      s.ecomTotalSpent = (s.ecomTotalSpent || 0) + dailyEcomContrib;
    }
  }

  // Storage rent (premium players get 50% off)
  const rawStorageRent = s.storage.reduce((a, st) => a + (STORAGE[st.type]?.mo || 0), 0) / 30;
  const storageRent = s.isPremium ? rawStorageRent * 0.5 : rawStorageRent;
  s.cash -= storageRent;
  if (storageRent > 0) {
    s.log.push({ msg: `📦 Storage rent: $${Math.round(storageRent)}/day${s.isPremium ? ' (PRO 50% off)' : ''}`, cat: 'cost', day: s.day + (s.startDay || 1) - 1 });
  }

  // Shop rent (variable by city cost, 6d: inflation affects rent)
  // 16e: First shop gets 25% rent discount for first 90 days
  if (!s._firstShopOpenDay && (s.locations || []).length > 0) s._firstShopOpenDay = s.day;
  const firstShopDiscountActive = (s.locations || []).length === 1 && s._firstShopOpenDay && (s.day - s._firstShopOpenDay) < 90;
  const totalShopRent = s.locations.reduce((a, loc) => {
    const city = CITIES.find(c => c.id === loc.cityId);
    return a + shopRent(city);
  }, 0) / 30 * wageMult * (firstShopDiscountActive ? 0.75 : 1);
  s.cash -= totalShopRent;
  if (totalShopRent > 0) {
    s.log.push({ msg: `🏠 Rent: $${Math.round(totalShopRent)}/day (${s.locations.length} shop${s.locations.length !== 1 ? 's' : ''}${firstShopDiscountActive ? ' — 25% new-shop discount' : ''})`, cat: 'cost', day: s.day + (s.startDay || 1) - 1 });
  }

  // Distribution monthly: base network fee + per-DC operating cost
  if (s.hasDist) {
    s.cash -= DIST_MONTHLY / 30; // base network fee
    const dcCount = (s.distCenters || []).length;
    if (dcCount > 0) {
      s.cash -= (dcCount * DC_MONTHLY) / 30;
    }
  }

  // Installer listing fees
  if (s.installers && s.installers.length > 0) {
    s.cash -= s.installers.length * INSTALLER_NET.monthlyListingFee / 30;
  }

  // Marketplace specialist salary
  if (s.marketplaceSpecialist) s.cash -= 3500 / 30;

  // Insurance premium (6a: volatile during economic turmoil / high commodity prices)
  if (s.insurance && INSURANCE[s.insurance]) {
    const baseInsurance = (INSURANCE[s.insurance].costPerMonth || INSURANCE[s.insurance].monthlyCost) / 30;
    // Insurance premiums rise with commodity volatility + active global events
    const avgCommodity = ((shared.commodities?.rubber || 1) + (shared.commodities?.steel || 1) + (shared.commodities?.chemicals || 1)) / 3;
    const volatilityMult = 1 + Math.max(0, (avgCommodity - 1.05)) * 2; // +2% insurance per 1% commodity above 1.05
    const eventCount = (shared.globalEvents || []).length;
    const eventMult = 1 + eventCount * 0.10; // +10% per active global event
    const insuranceCost = baseInsurance * volatilityMult * eventMult;
    s.cash -= insuranceCost;
    s.log.push({ msg: `🛡️ Insurance: $${Math.round(insuranceCost)}/day (${INSURANCE[s.insurance].name || s.insurance}${volatilityMult > 1.01 ? ` — commodity surcharge ${Math.round((volatilityMult-1)*100)}%` : ''})`, cat: 'cost', day: s.day + (s.startDay || 1) - 1 });
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

  // ── 3PL LEASE PAYMENTS (monthly) ──
  if (s.storageLeases && s.storageLeases.length > 0 && s.day % 30 === 0) {
    for (const lease of s.storageLeases) {
      if (s.cash >= lease.monthlyRent) {
        s.cash -= lease.monthlyRent;
        lease.lastPaidDay = s.day;
        s.log.push({ msg: `3PL rent: $${lease.monthlyRent.toFixed(2)} to ${lease.ownerName}`, cat: 'cost' });
      } else {
        // Can't pay — start grace period countdown
        if (!lease._graceDayStart) {
          lease._graceDayStart = s.day;
          s.log.push({ msg: `⚠️ 3PL rent overdue — ${7} day grace period`, cat: 'cost' });
        }
      }
    }
  }

  // ── BANKRUPTCY PROTECTION ──
  if (s.cash < -10000) {
    s.log.push({ msg: `Vinnie: "Kid, you're bleeding money. Fire some people or close a shop."`, cat: 'vinnie' });
  }
  if (s.cash < -50000) {
    // Forced cost reduction: skip marketing on all locations
    for (const loc of s.locations) {
      if (loc.marketing) {
        s.log.push({ msg: `Auto-cancelled marketing in ${loc.cityId} due to cash crisis`, cat: 'cost' });
        loc.marketing = null;
      }
    }
  }
  if (s.cash < -100000) {
    // Auto-fire non-essential staff (leave 1 tech, 1 sales minimum)
    const minTechs = 1, minSales = 1;
    let fired = false;
    if (s.staff.managers > 0) { s.staff.managers = 0; fired = true; }
    if (s.staff.drivers > 1) { s.staff.drivers = 1; fired = true; }
    if (s.staff.techs > minTechs) { s.staff.techs = minTechs; fired = true; }
    if (s.staff.sales > minSales) { s.staff.sales = minSales; fired = true; }
    if (fired) {
      s.log.push({ msg: `Emergency layoffs! Staff reduced to skeleton crew. Cash: $${Math.round(s.cash).toLocaleString()}`, cat: 'cost' });
    }
    // Clamp cash floor at -100k
    s.cash = Math.max(s.cash, -100000);
  }

  // ── BANK DEPOSITS — daily interest with tiered deposit bonus ──
  if (s.bankBalance > 0) {
    // Tiered deposit bonus: larger balances earn higher rates
    let depositBonus = 0;
    if (s.bankBalance >= 1000000) depositBonus = 0.015;      // $1M+ → +1.5%
    else if (s.bankBalance >= 500000) depositBonus = 0.01;    // $500K+ → +1%
    else if (s.bankBalance >= 100000) depositBonus = 0.005;   // $100K+ → +0.5%
    const effectiveRate = Math.min(0.085, (s.bankRate || 0.042) + depositBonus);
    const dailyRate = effectiveRate / 360;
    const premiumBankBonus = s.isPremium ? 1.10 : 1;
    const interest = Math.round(s.bankBalance * dailyRate * premiumBankBonus * 100) / 100;
    s.bankBalance += interest;
    s.bankInterestEarned = interest;
    s.bankDepositBonus = depositBonus;
    s.bankTotalInterest = (s.bankTotalInterest || 0) + interest;
    if (interest >= 1) {
      const bonusLabel = depositBonus > 0 ? ` (+${(depositBonus * 100).toFixed(1)}% tier)` : '';
      s.log.push({ msg: `\u{1F3E6} Bank paid $${Math.floor(interest)} interest${s.isPremium ? ' (PRO +10%)' : ''}${bonusLabel}`, cat: 'bank' });
    }
  } else {
    s.bankInterestEarned = 0;
    s.bankDepositBonus = 0;
  }
  // ── Sync rates from global economy (centralized in tick loop) ──
  // Bank rate and loan rate are now calculated globally for all players.
  // Per-player tiered deposit bonus is still applied above in the interest section.
  if (shared.bankRate != null) s.bankRate = shared.bankRate;
  if (shared.loanRateMult != null) s.loanRateMult = shared.loanRateMult;

  // ── SUPPLIER FREE SAMPLES ──
  for (const [supIdx, rel] of Object.entries(s.supplierRelationships || {})) {
    const tier = getSupplierRelTier(rel.totalPurchased || 0);
    if (tier.freeSampleChance > 0 && Math.random() < tier.freeSampleChance / 30) {
      const sampleSpace = Math.max(0, getCap(s) - getInv(s));
      if (sampleSpace > 0) {
        const newTireKeys = Object.keys(TIRES).filter(k => !TIRES[k].used);
        if (newTireKeys.length > 0) {
          const k = newTireKeys[R(0, newTireKeys.length - 1)];
          const qty = Math.min(R(2, 5), sampleSpace);
          s.warehouseInventory[k] = (s.warehouseInventory[k] || 0) + qty;
          s.log.push({ msg: `🎁 Free sample: ${qty} ${TIRES[k].n} from supplier!`, cat: 'source' });
        }
      }
    }
  }

  // ── CONTRACT OFFER GENERATION (monthly, based on supplier tier) ──
  if (s.day % 30 === 0) {
    if (!s.contractOffers) s.contractOffers = [];
    // Clear expired offers
    s.contractOffers = s.contractOffers.filter(o => s.day < o.expiresDay);

    for (const [supIdx, rel] of Object.entries(s.supplierRelationships || {})) {
      const tier = getSupplierRelTier(rel.totalPurchased || 0);
      const offersCount = OFFERS_PER_MONTH[tier.level] || 0;
      if (offersCount <= 0) continue;

      const sup = SUPPLIERS[Number(supIdx)];
      if (!sup) continue;
      const eligibleTires = CONTRACTABLE_TIRES.filter(t => {
        if (sup.ag && !TIRES[t]?.ag) return false;
        if (!sup.ag && TIRES[t]?.ag) return false;
        return true;
      });
      if (eligibleTires.length === 0) continue;

      for (let i = 0; i < offersCount; i++) {
        // Pick contract type (weighted toward tier)
        const typeKeys = Object.keys(CONTRACT_TYPES).filter(k => tier.level >= CONTRACT_TYPES[k].minTier);
        if (typeKeys.length === 0) continue;
        const typeKey = typeKeys[R(0, typeKeys.length - 1)];
        const tmpl = CONTRACT_TYPES[typeKey];

        // Pick a tire
        let tire;
        if (typeKey === 'seasonalPreBuy') {
          // Only offer seasonal tires in appropriate seasons
          const seasonalMatch = Object.values(SEASONAL_TIRES).find(st => st.offerSeasons.includes(season));
          if (seasonalMatch) {
            const seasonalEligible = seasonalMatch.tires.filter(t => eligibleTires.includes(t));
            tire = seasonalEligible.length > 0 ? seasonalEligible[R(0, seasonalEligible.length - 1)] : eligibleTires[R(0, eligibleTires.length - 1)];
          } else {
            tire = eligibleTires[R(0, eligibleTires.length - 1)];
          }
        } else {
          tire = eligibleTires[R(0, eligibleTires.length - 1)];
        }

        const t = TIRES[tire];
        if (!t) continue;

        const qty = R(tmpl.qtyRange[0], tmpl.qtyRange[1]);
        const currentMult = (shared.supplierPricing && shared.supplierPricing[tire]) || 1.0;
        const discount = Rf(tmpl.discountRange[0], tmpl.discountRange[1]);
        const pricePerTire = Math.round(t.bMin * currentMult * (1 - sup.disc) * (1 - discount));
        const upfrontCost = pricePerTire * qty;

        s.contractOffers.push({
          id: uid(),
          type: typeKey,
          label: tmpl.label,
          supplierIndex: Number(supIdx),
          supplierName: sup.n,
          tireType: tire,
          tireName: t.n,
          pricePerTire,
          totalQuantity: qty,
          durationDays: tmpl.durationDays,
          deliveryMode: tmpl.deliveryMode,
          dailyAllotment: tmpl.deliveryMode === 'daily' ? Math.max(1, Math.ceil(qty * (tmpl.dailyAllotmentPct || 0.01))) : null,
          deliveryLeadDays: tmpl.deliveryLeadDays || 0,
          upfrontCost,
          penaltyForDefault: tmpl.penaltyForDefault,
          discount: Math.round(discount * 100),
          offeredDay: s.day,
          expiresDay: s.day + 14, // Offers expire after 14 days
        });
      }
    }

    if (s.contractOffers.length > 0) {
      s.log.push({ msg: `📋 ${s.contractOffers.length} new supplier contract offer${s.contractOffers.length > 1 ? 's' : ''} available`, cat: 'supplier' });
    }
  }

  // ── PREMIUM: BONUS SOURCE FINDS ──
  if (s.isPremium && Math.random() < 0.5) {
    const freeSpace = getCap(s) - getInv(s);
    if (freeSpace > 0) {
      const usedTypes = ['used_good', 'used_premium'];
      const bonusQty = Math.min(freeSpace, R(2, 5));
      for (let i = 0; i < bonusQty; i++) {
        const k = usedTypes[R(0, usedTypes.length - 1)];
        s.warehouseInventory[k] = (s.warehouseInventory[k] || 0) + 1;
      }
      s.log.push({ msg: `\u{1F451} Vinnie's connections found ${bonusQty} quality used tires`, cat: 'source' });
    }
  }

  // ── PREMIUM: WEEKLY VINNIE INSIDER TIP ──
  if (s.isPremium && s.day % 7 === 0) {
    // Find highest-margin tire type based on current market
    let bestTire = null, bestMargin = 0;
    for (const [k, t] of Object.entries(TIRES)) {
      if (t.used) continue;
      const mkt = (s.marketPrices && s.marketPrices[k]) || t.def;
      const cost = (t.bMin + t.bMax) / 2;
      const margin = mkt - cost;
      if (margin > bestMargin) { bestMargin = margin; bestTire = k; }
    }
    // Find best-performing city
    let bestCity = null, bestCityRev = 0;
    for (const loc of s.locations) {
      const rev = loc.dailyStats?.rev || 0;
      if (rev > bestCityRev) {
        bestCityRev = rev;
        const city = CITIES.find(c => c.id === loc.cityId);
        bestCity = city?.name || loc.cityId;
      }
    }
    const tips = [];
    if (bestTire) tips.push(`${TIRES[bestTire].n} has the best margins right now ($${Math.round(bestMargin)}/tire)`);
    if (bestCity) tips.push(`${bestCity} is your top performer`);
    const nextSeason = { Spring: 'Summer', Summer: 'Fall', Fall: 'Winter', Winter: 'Spring' }[season];
    tips.push(`${nextSeason} is coming — adjust your stock accordingly`);
    const tip = tips[R(0, tips.length - 1)];
    s.log.push({ msg: `\u{1F451} Vinnie's Insider Tip: ${tip}`, cat: 'vinnie' });
  }

  // ── VINNIE: BANK RATE COMMENTARY (monthly) ──
  if (s.day % 30 === 0 && shared.bankState) {
    const bst = shared.bankState;
    const rPct = (bst.savingsRate * 100).toFixed(1);
    const totalLoanDebt = (s.loans || []).reduce((a, l) => a + (l.remaining || 0), 0);

    if (bst.rateDirection === 'lowering' && Math.random() < 0.3) {
      s.log.push({ msg: `Vinnie: "Rates just dropped to ${rPct}%. Time to borrow big and expand!"`, cat: 'vinnie' });
    } else if (bst.rateDirection === 'raising' && Math.random() < 0.3) {
      s.log.push({ msg: `Vinnie: "Oof, rates are going up. Maybe hold off on that loan for now."`, cat: 'vinnie' });
    }
    if (bst.savingsRate >= 0.070 && Math.random() < 0.2) {
      s.log.push({ msg: `Vinnie: "Bank's paying ${rPct}% on savings? That's almost as good as selling tires."`, cat: 'vinnie' });
    } else if (bst.savingsRate <= 0.020 && Math.random() < 0.2) {
      s.log.push({ msg: `Vinnie: "I've never seen rates this low. Even I'm thinking about opening a shop."`, cat: 'vinnie' });
    }
    if (s.bankBalance > 200000 && bst.savingsRate < 0.025 && Math.random() < 0.4) {
      s.log.push({ msg: `Vinnie: "You've got $${Math.round(s.bankBalance / 1000)}K sitting in savings earning peanuts at ${rPct}%. That money should be working for you."`, cat: 'vinnie' });
    }
    if (totalLoanDebt > 100000 && bst.rateDirection === 'raising' && Math.random() < 0.3) {
      s.log.push({ msg: `Vinnie: "Your loan payments are about to go up. Might want to pay some of that down."`, cat: 'vinnie' });
    }
  }

  // ── VINNIE: PRICE WAR COMMENTARY (6c) ──
  if (s.locations.length > 0 && s.day % 14 === 0 && Math.random() < 0.3) {
    // Check if player is in a price war (their prices significantly below market)
    let undercuts = 0, totalChecked = 0;
    for (const [k, t] of Object.entries(TIRES)) {
      if (!s.prices[k]) continue;
      const mkt = (s.marketPrices && s.marketPrices[k]) || t.def;
      totalChecked++;
      if (s.prices[k] < mkt * 0.80) undercuts++;
    }
    if (undercuts > 3 && totalChecked > 0) {
      const msgs = [
        `"You're pricing below cost on ${undercuts} tires. That's bold, kid. Hope you've got the cash to outlast them."`,
        `"Word on the street is the other shops are NOT happy about your prices. Expect them to fight back."`,
        `"A price war is fun until your bank account hits zero. Just saying."`,
      ];
      s.log.push({ msg: `Vinnie: ${msgs[R(0, msgs.length - 1)]}`, cat: 'vinnie' });
    }
  }

  // ── VINNIE: INFLATION COMMENTARY (6d) ──
  if (s.day % 30 === 15 && Math.random() < 0.25) {
    const infl = shared.inflationIndex || 1.0;
    if (infl > 1.06) {
      s.log.push({ msg: `Vinnie: "Everything's getting more expensive — wages, rent, tires. Raise your prices or get squeezed."`, cat: 'vinnie' });
    } else if (infl < 0.94) {
      s.log.push({ msg: `Vinnie: "Prices are dropping across the board. Good time to stock up cheap, bad time to have inventory."`, cat: 'vinnie' });
    }
  }

  // ── WEEKLY TOURNAMENT SNAPSHOT ──
  if (s.day % 7 === 1) {
    s.weeklySnapshot = { day: s.day, totalRev: s.totalRev, totalProfit: s.totalProfit, totalSold: s.totalSold };
  }

  // ── REPUTATION — boosted early game ──
  const _repBefore = s.reputation;
  if (s.daySold > 0) {
    const earlyBonus = s.day <= 180
      ? Math.max(0, (25 - s.reputation) * 0.025)   // aggressive early: +0.625/day at rep 0
      : Math.max(0, (10 - s.reputation) * 0.005);  // normal: +0.05/day at rep 0
    let repGain = Math.min(0.5, s.daySold * 0.005 + s.locations.length * 0.005 + earlyBonus);
    repGain *= (s._activeBoosts?.rep?.multiplier || 1);
    s.reputation = C(s.reputation + repGain, 0, 100);
  }
  // Small passive daily rep for being in business
  if (s.day > 7) {
    s.reputation = C(s.reputation + 0.002, 0, 100);
  }
  // Log rep delta so players can see daily changes
  const _repDelta = Math.round((s.reputation - _repBefore) * 100) / 100;
  if (Math.abs(_repDelta) >= 0.01) {
    const sign = _repDelta >= 0 ? '+' : '';
    s.log.push({ msg: `⭐ Rep: ${sign}${_repDelta} → ${Math.round(s.reputation * 10) / 10}`, cat: 'event', day: s.day + (s.startDay || 1) - 1 });
  }

  // ── REVENUE BOOST (referral perk) ──
  if (s._activeBoosts?.revenue?.multiplier) {
    const mult = s._activeBoosts.revenue.multiplier;
    const bonusRev = Math.round(s.dayRev * (mult - 1));
    s.dayRev += bonusRev;
    s.dayProfit += bonusRev;
    s.cash += bonusRev;
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
      // 6d: Inflation drifts market prices
      const inflDrift = shared.inflationIndex || 1.0;
      const newPrice = Math.round(blended * noise * inflDrift);
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

  // ── TIRE COINS — weekly drip + reputation bonus ──
  const tcCap = getTcCap(s);

  // 14b: Emission scaling — ONLY applies to weekly drip, NOT achievements or premium
  // This prevents one achievement from dumping 2000 TC into the economy
  const tcEmit = MONET.tcEmission;
  const dripMult = Math.min(
    tcEmit.maxMultiplier,
    Math.max(tcEmit.minMultiplier, tcEmit.targetPlayerCount / (shared.activePlayerCount || 1))
  );

  if (s.day % 7 === 0) {
    // Base weekly drip: 1 TC for all players (~52 TC/year base)
    let weeklyTC = 1;

    // Reputation bonus: higher-rep players earn more TC (rewards engagement)
    if (s.reputation >= 75) weeklyTC += 2;
    else if (s.reputation >= 50) weeklyTC += 1;
    else if (s.reputation >= 25) weeklyTC += 1;

    // Apply emission multiplier to drip ONLY
    const scaledTC = Math.max(1, Math.round(weeklyTC * dripMult));
    const prev = s.tireCoins || 0;
    s.tireCoins = Math.min(prev + scaledTC, tcCap);
    if (s.tireCoins > prev && scaledTC > 1) {
      s.log.push({ msg: `Weekly TC drip: +${scaledTC} TireCoins${dripMult > 1.5 ? ' (small-server bonus)' : ' (rep bonus)'}`, cat: 'event' });
    }
  }

  // 16d: Premium TC stipend — flat 100 TC/month, NO multiplier
  if (s.isPremium && s.day % 30 === 0) {
    const stipend = 100;
    s.tireCoins = Math.min((s.tireCoins || 0) + stipend, tcCap);
    s.log.push({ msg: `Monthly PRO bonus: +${stipend} TireCoins`, cat: 'event' });
  }

  // Clean up temp event flags
  delete s._tB;
  delete s._wB;
  delete s._uB;
  delete s._cM;
  delete s._vR;
  delete s._fO;

  // Rebuild aggregate inventory from all locations + warehouse
  rebuildGlobalInv(s);

  // ── ACHIEVEMENTS — flat TC rewards, NO emission multiplier ──
  if (!s.achievements || Array.isArray(s.achievements)) s.achievements = {};
  s._newAchievements = [];
  for (const ach of ACHIEVEMENTS) {
    if (s.achievements[ach.id]) continue;
    try {
      if (ach.check(s)) {
        s.achievements[ach.id] = true;
        const reward = ach.coins || 0; // Flat — no multiplier
        s.tireCoins = Math.min((s.tireCoins || 0) + reward, tcCap);
        s.log.push({ msg: `🏆 Achievement: ${ach.title} (+${reward} TC)`, cat: 'event' });
        s._newAchievements.push({ id: ach.id, name: ach.title, reward });
      }
    } catch {}
  }

  // ── NOTIFICATIONS (based on player preferences) ──
  const notifs = s.notifications || {};
  s._notifications = [];

  // Global events — notify on event start
  if (notifs.globalEvents !== false) {
    for (const ge of activeGlobalEvents) {
      if (ge.startDay === s.day) {
        const def = GLOBAL_EVENTS.find(e => e.id === ge.id);
        if (def) {
          s._notifications.push({ type: 'globalEvent', title: def.name, message: def.description, icon: def.icon, severity: 'warning' });
        }
      }
      // Notify on event end (last day)
      if (ge.endDay === s.day) {
        const def = GLOBAL_EVENTS.find(e => e.id === ge.id);
        if (def) {
          s._notifications.push({ type: 'globalEvent', title: `${def.name} Ended`, message: 'Market conditions returning to normal.', icon: def.icon, severity: 'info' });
        }
      }
    }
  }

  // Cash reserve warning
  if (notifs.cashReserve !== false) {
    const threshold = notifs.cashReserveThreshold || 5000;
    if (s.cash < threshold && (s.prevCash || 500) >= threshold) {
      s._notifications.push({ type: 'cashReserve', title: 'Cash Reserve Warning', message: `Cash dropped below $${threshold.toLocaleString()}. You have $${Math.round(s.cash).toLocaleString()} remaining.`, icon: '\u26A0\uFE0F', severity: 'critical' });
    }
  }

  // TC storage cap warning
  if (notifs.tcStorage !== false) {
    if (s.tireCoins >= tcCap && tcCap > 0) {
      // Only notify once per day when at cap
      if (s.day % 7 === 0) {
        s._notifications.push({ type: 'tcStorage', title: 'TC Storage Full', message: `You're at ${tcCap} TC capacity. Earned coins are being lost. Upgrade your storage.`, icon: '\u{1F4E6}', severity: 'warning' });
      }
    } else if (tcCap > 0 && s.tireCoins / tcCap >= 0.9) {
      if (s.day % 7 === 0) {
        s._notifications.push({ type: 'tcStorage', title: 'TC Storage Almost Full', message: `${s.tireCoins}/${tcCap} TC — upgrade storage soon.`, icon: '\u{1F4E6}', severity: 'info' });
      }
    }
  }

  // Inventory alerts
  if (notifs.inventory !== false) {
    const totalInv = getInv(s);
    const totalCap = getCap(s);
    if (totalCap > 20 && totalInv <= Math.ceil(totalCap * 0.1)) {
      s._notifications.push({ type: 'inventory', title: 'Low Inventory', message: `Only ${totalInv} tires in stock (${totalCap} capacity). Restock soon!`, icon: '\u{1F4C9}', severity: 'warning' });
    }
    if (totalCap > 0 && totalInv >= Math.floor(totalCap * 0.95)) {
      s._notifications.push({ type: 'inventory', title: 'Storage Nearly Full', message: `${totalInv}/${totalCap} capacity. Sell or upgrade storage.`, icon: '\u{1F4E6}', severity: 'info' });
    }
  }

  // Loan payment reminder (weekly payments happen every 7 days)
  if (notifs.loanPayments && (s.loans || []).length > 0 && s.day % 7 === 6) {
    const totalPayment = s.loans.reduce((a, l) => a + (l.weeklyPayment || 0), 0);
    if (totalPayment > 0) {
      s._notifications.push({ type: 'loanPayment', title: 'Loan Payment Tomorrow', message: `$${totalPayment.toLocaleString()} in loan payments due tomorrow.`, icon: '\u{1F3E6}', severity: 'info' });
    }
  }

  // Factory production alerts
  if (notifs.factoryProduction && s.hasFactory && s.factory) {
    // Batch completion — check all production lines
    for (const line of (s.factory.lines || [])) {
      for (const batch of (line.queue || [])) {
        if (batch.completionDay === s.day) {
          s._notifications.push({ type: 'factoryProduction', title: 'Batch Complete', message: `${batch.qty} ${batch.tire || 'tires'} finished production.`, icon: '\u{1F3ED}', severity: 'info' });
        }
      }
    }
    // Rubber surplus reminder (weekly)
    if (s.day % 7 === 0 && (s.factory.rubberSupply || 0) > 100) {
      s._notifications.push({ type: 'factoryProduction', title: 'Rubber Surplus', message: `${s.factory.rubberSupply} rubber units stockpiled. Consider selling surplus.`, icon: '\u{1F333}', severity: 'info' });
    }
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

  // Per-location daily history (last 30 days) — for individual store performance charts
  if (!s.locHistory) s.locHistory = {};
  for (const loc of (s.locations || [])) {
    const ds = loc.dailyStats || {};
    if (!s.locHistory[loc.id]) s.locHistory[loc.id] = [];
    s.locHistory[loc.id].push({
      day: s.day,
      rev: Math.round(ds.rev || 0),
      profit: Math.round(ds.profit || 0),
      sold: ds.sold || 0,
    });
    if (s.locHistory[loc.id].length > 30) s.locHistory[loc.id] = s.locHistory[loc.id].slice(-30);
  }
  // Clean up history for closed locations
  const activeLocIds = new Set((s.locations || []).map(l => l.id));
  for (const locId of Object.keys(s.locHistory)) {
    if (!activeLocIds.has(locId)) delete s.locHistory[locId];
  }

  // Revenue history by channel for map/chart (last 60 days)
  if (!s.revHistory) s.revHistory = [];
  s.revHistory.push({ day: s.day, ...s.dayRevByChannel });
  if (s.revHistory.length > 60) s.revHistory = s.revHistory.slice(-60);

  // Tire sales history by type (last 30 days) — for sales reporting
  if (!s.salesByType) s.salesByType = [];
  s.salesByType.push({ day: s.day, ...s.daySoldByType });
  if (s.salesByType.length > 30) s.salesByType = s.salesByType.slice(-30);

  // ── VINNIE TRIGGER SYSTEM (Section 15) ──
  if (!s.vinnieSeen) s.vinnieSeen = [];
  if (!s.vinnieCooldowns) s.vinnieCooldowns = {};
  s._vinnieQueue = [];

  // Track days since last Vinnie message
  s._vinnieDaysSilent = (s._vinnieDaysSilent || 0) + 1;

  for (const trigger of VINNIE_TRIGGERS) {
    // Check cooldown
    const lastFired = s.vinnieCooldowns[trigger.id] || 0;
    if (trigger.cooldown > 0 && s.day - lastFired < trigger.cooldown) continue;

    // Check one-time triggers
    if (trigger.oneTime) {
      const seenId = trigger.seenId || trigger.id;
      if (s.vinnieSeen.includes(seenId)) continue;
    }

    // Evaluate condition
    try {
      if (!trigger.condition(s, shared)) continue;
    } catch { continue; }

    // Render message with template variables
    let msg = trigger.message;
    msg = msg.replace(/\{cash\}/g, '$' + fmt(Math.round(s.cash || 0)));
    msg = msg.replace(/\{tcAmount\}/g, String(s.tireCoins || 0));
    msg = msg.replace(/\{tcValue\}/g, '$' + fmt(shared.tcValue || 0));
    msg = msg.replace(/\{rate\}/g, ((shared.bankState?.savingsRate || 0.042) * 100).toFixed(1) + '%');

    s._vinnieQueue.push({
      id: trigger.id,
      message: msg,
      priority: trigger.priority || 'low',
      priorityNum: PRIORITY_ORDER[trigger.priority] ?? 3,
    });

    // Mark as seen for one-time triggers
    if (trigger.oneTime) {
      const seenId = trigger.seenId || trigger.id;
      s.vinnieSeen.push(seenId);
    }

    // Record cooldown
    s.vinnieCooldowns[trigger.id] = s.day;
  }

  // ── 15e: Vinnie's Daily Briefing (if no triggers fired) ──
  if (s._vinnieQueue.length === 0) {
    const briefing = [];
    if (s.daySold > 0) briefing.push(`sold ${s.daySold} tires ($${fmt(Math.round(s.dayRev))} rev)`);
    if (s.dayProfit < 0) briefing.push(`lost $${fmt(Math.abs(Math.round(s.dayProfit)))} today — check your costs`);
    const totalInv = getInv(s);
    const totalCap = getCap(s);
    if (totalCap > 20 && totalInv < totalCap * 0.2) briefing.push(`inventory is running low (${totalInv}/${totalCap})`);
    if (shared.globalEvents && shared.globalEvents.length > 0) {
      briefing.push(`${shared.globalEvents.length} active market event${shared.globalEvents.length > 1 ? 's' : ''} — stay sharp`);
    }
    if (briefing.length > 0) {
      s._vinnieQueue.push({
        id: 'daily_briefing',
        message: `Yesterday: ${briefing.slice(0, 3).join('. ')}.`,
        priority: 'low', priorityNum: 3,
      });
    }
  }

  // Sort by priority and limit to 2 per day (critical bypasses limit)
  s._vinnieQueue.sort((a, b) => a.priorityNum - b.priorityNum);
  const criticals = s._vinnieQueue.filter(v => v.priority === 'critical');
  const others = s._vinnieQueue.filter(v => v.priority !== 'critical').slice(0, 2);
  s._vinnieQueue = [...criticals, ...others];

  if (s._vinnieQueue.length > 0) {
    s._vinnieDaysSilent = 0;
  }

  // Set active Vinnie goal
  s._vinnieGoal = getActiveGoal(s);
  s._vinnieStage = getVinnieStage(s.reputation || 0);

  return s;
}
