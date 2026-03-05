import { TIRES } from '../../../shared/constants/tires.js';
import { CITIES } from '../../../shared/constants/cities.js';
import { uid } from '../../../shared/helpers/random.js';
import { R } from '../../../shared/helpers/format.js';
import { getCalendar } from '../../../shared/helpers/calendar.js';
import { FRANCHISE } from '../../../shared/constants/franchise.js';
import { FLEA_MARKETS, FLEA_STAND_COST, FLEA_TRANSPORT } from '../../../shared/constants/fleaMarkets.js';
import { CAR_MEETS, CAR_MEET_SUMMER_START, CAR_MEET_SUMMER_END, CAR_MEET_TRANSPORT } from '../../../shared/constants/carMeets.js';
import { rebuildGlobalInv } from '../../../shared/helpers/inventory.js';
import {
  TC_RUSH, TC_SUPPLIER_ACCESS, TC_INTEL,
  TC_FINANCIAL, TC_OPERATIONS,
} from '../../../shared/constants/tcUtility.js';

export async function handleMisc(action, params, g, ctx) {
  switch (action) {
    case 'tutorialAdvance': {
      g.tutorialStep = (g.tutorialStep || 0) + 1;
      break;
    }

    case 'tutorialDone': {
      g.tutorialDone = true;
      ctx.trackEvent(ctx.playerId, 'tutorial_done', {});
      break;
    }

    case 'registerPushToken': {
      const { token } = params;
      if (!token || typeof token !== 'string') return ctx.fail('Invalid token');
      g.fcmToken = token;
      break;
    }

    case 'devBoost': {
      if (ctx.NODE_ENV === 'production' && (!process.env.ADMIN_KEY || params.adminKey !== process.env.ADMIN_KEY)) {
        return ctx.fail('Not available');
      }
      if (params.cash != null) g.cash = Number(params.cash);
      if (params.reputation != null) g.reputation = Number(params.reputation);
      g.log.push(`[DEV] Set cash=${g.cash}, rep=${g.reputation}`);
      break;
    }

    case 'dismissVinnie': {
      const { id } = params;
      if (!id) return ctx.fail('Missing milestone id');
      if (!g.vinnieSeen) g.vinnieSeen = [];
      if (!g.vinnieSeen.includes(id)) g.vinnieSeen.push(id);
      break;
    }

    case 'resetGame': {
      const { init: initFn } = await import('../../engine/init.js');
      const game = await ctx.getGame();
      const globalDay = game?.day || game?.week || 1;

      const oldTicker = g.stockExchange?.ticker;
      if (oldTicker && game?.economy?.exchange?.stocks?.[oldTicker]) {
        const stock = game.economy.exchange.stocks[oldTicker];
        const crashPrice = Math.max(0.01, +(stock.price * 0.05).toFixed(2));
        stock.price = crashPrice;
        stock.change = -95;
        stock.eps = 0;
        stock.revenue = 0;
        stock.profit = 0;
        stock.dailyProfit = 0;
        stock.bookValue = 0;
        stock.locations = 0;
        stock.reputation = 0;
        stock.priceHistory.push({
          day: globalDay, open: stock.price, high: stock.price,
          low: crashPrice, close: crashPrice, volume: 0,
        });

        const founderQty = g.stockExchange?.founderSharesLocked || 0;
        stock.totalShares = Math.max(stock.floatShares || 0, (stock.totalShares || 100000) - founderQty);
        stock.founderShares = 0;
        stock.bankrupted = true;
        stock.bankruptDay = globalDay;

        const exchange = game.economy.exchange;
        if (exchange) {
          if (!exchange.bankruptcies) exchange.bankruptcies = [];
          exchange.bankruptcies.push({
            ticker: oldTicker,
            companyName: g.companyName || 'Unknown',
            day: globalDay,
            preCrashPrice: stock.price / 0.05,
          });
          if (exchange.bankruptcies.length > 50) exchange.bankruptcies = exchange.bankruptcies.slice(-50);
          if (exchange.sentiment) {
            exchange.sentiment.value = Math.max(0.5, (exchange.sentiment.value || 1) - 0.15);
          }
        }

        await ctx.saveGame('default', globalDay, game.economy, game.ai_shops || [], game.liquidation || []);
      }

      const savedName = g.name || 'Player';
      const savedCompanyName = g.companyName || '';
      const savedId = g.id || ctx.playerId;

      const fresh = initFn(savedName, globalDay);
      fresh.id = savedId;
      fresh.companyName = savedCompanyName;

      g = fresh;
      break;
    }

    case 'hireMarketplaceSpecialist': {
      if (g.marketplaceSpecialist) return ctx.fail('Already hired');
      if (g.reputation < 5) return ctx.fail('Need reputation 5+');
      if ((g.locations || []).length < 1) return ctx.fail('Need at least 1 location');
      g.marketplaceSpecialist = true;
      g.log.push('Hired Marketplace Specialist ($3,500/mo)');
      break;
    }

    case 'fireMarketplaceSpecialist': {
      if (!g.marketplaceSpecialist) return ctx.fail('No specialist to fire');
      g.marketplaceSpecialist = false;
      g.log.push('Fired Marketplace Specialist');
      break;
    }

    case 'unlockFranchise': {
      if (g.hasFranchise) return ctx.fail('Already unlocked');
      if ((g.locations || []).length < FRANCHISE.minLocations) return ctx.fail(`Need ${FRANCHISE.minLocations}+ locations`);
      if (g.reputation < FRANCHISE.minRep) return ctx.fail(`Need reputation ${FRANCHISE.minRep}+`);
      if (g.cash < FRANCHISE.unlockCost) return ctx.fail('Not enough cash');
      g.cash -= FRANCHISE.unlockCost;
      g.hasFranchise = true;
      g.franchiseTemplates = [];
      break;
    }

    case 'createFranchiseTemplate': {
      if (!g.hasFranchise) return ctx.fail('Franchise not unlocked');
      const { name, sourceLocationId } = params;
      const srcLoc = (g.locations || []).find(l => l.id === sourceLocationId);
      if (!srcLoc) return ctx.fail('Invalid source location');
      if ((g.franchiseTemplates || []).length >= FRANCHISE.templateMaxCount) {
        return ctx.fail('Max templates reached');
      }
      if (!g.franchiseTemplates) g.franchiseTemplates = [];
      g.franchiseTemplates.push({
        id: uid(),
        name: name || 'Template',
        prices: { ...g.prices },
        marketing: srcLoc.marketing || null,
      });
      break;
    }

    case 'openFranchise': {
      if (!g.hasFranchise) return ctx.fail('Franchise not unlocked');
      const { cityId, templateId } = params;
      const city = CITIES.find(c => c.id === cityId);
      if (!city) return ctx.fail('Invalid city');
      const template = (g.franchiseTemplates || []).find(t2 => t2.id === templateId);
      if (!template) return ctx.fail('Invalid template');
      const shopCostBase = 137500 * (city.cost || 1);
      // Scaling franchise fee: each additional franchise costs more
      const existingFranchises = (g.locations || []).filter(l => l.isFranchise).length;
      const scaledFee = Math.round(FRANCHISE.franchiseFee * Math.pow(FRANCHISE.franchiseFeeScale || 1.5, existingFranchises));
      const totalCost = shopCostBase + scaledFee;
      if (g.cash < totalCost) return ctx.fail(`Not enough cash ($${totalCost.toLocaleString()} needed)`);
      g.cash -= totalCost;
      g.locations.push({
        cityId, id: uid(), locStorage: 0, inventory: {},
        loyalty: 0, marketing: template.marketing,
        isFranchise: true, templateId: template.id, openedDay: g.day,
      });
      break;
    }

    case 'vinnieBailout': {
      if (g.cash >= 0) return ctx.fail('You don\'t need a bailout');
      if ((g.tireCoins || 0) < 10000) return ctx.fail('Need 10,000 TireCoins');
      g.tireCoins -= 10000;
      const bailoutAmt = Math.abs(g.cash) + 5000;
      g.cash += bailoutAmt;
      g.log.push(`Vinnie bailed you out! +$${bailoutAmt.toLocaleString()} (cost: 10K TC)`);
      break;
    }

    case 'buyCosmetic': {
      const { cosmeticId } = params;
      const { MONET } = await import('../../../shared/constants/monetization.js');
      const item = MONET?.cosmetics ? MONET.cosmetics.find(c => c.id === cosmeticId) : null;
      if (!item) return ctx.fail('Invalid cosmetic');
      if ((g.tireCoins || 0) < item.cost) return ctx.fail('Not enough TireCoins');
      if (!g.cosmetics) g.cosmetics = [];
      if (g.cosmetics.includes(cosmeticId)) return ctx.fail('Already owned');
      g.tireCoins -= item.cost;
      g.cosmetics.push(cosmeticId);
      break;
    }

    case 'bidOnContract': {
      const { contractType } = params;
      const { GOV_TYPES } = await import('../../../shared/constants/govTypes.js');
      const contract = GOV_TYPES ? GOV_TYPES.find(c => c.type === contractType) : null;
      if (!contract) return ctx.fail('Invalid contract');
      if (g.reputation < (contract.minRep || 0)) return ctx.fail(`Need reputation ${contract.minRep}+`);
      if ((g.locations || []).length < (contract.minLocs || 1)) return ctx.fail(`Need ${contract.minLocs}+ locations`);
      if (!g.govContracts) g.govContracts = [];
      if (g.govContracts.length >= 3) return ctx.fail('Max 3 active contracts');
      const tireKey = contract.tires[R(0, contract.tires.length - 1)];
      const t = TIRES[tireKey];
      const totalQty = R(contract.qtyMin, contract.qtyMax);
      const durationDays = (contract.dur || 4) * 7;
      const dailyTarget = Math.max(1, Math.ceil(totalQty / durationDays));
      g.govContracts.push({
        id: uid(),
        contractType: contract.type,
        name: contract.name,
        tire: tireKey,
        dailyTarget,
        pricePerTire: Math.round((t?.def || 100) * 0.95),
        daysLeft: durationDays,
        delivered: 0,
        totalTarget: totalQty,
      });
      g.log.push(`Won contract: ${contract.name} (${totalQty} ${t?.n || tireKey})`);
      break;
    }

    case 'openFleaStand': {
      const { marketId } = params;
      const market = FLEA_MARKETS.find(m => m.id === marketId);
      if (!market) return ctx.fail('Invalid flea market');
      const transportCost = FLEA_TRANSPORT[market.transport] || 50;
      const totalFleaCost = FLEA_STAND_COST + transportCost;
      if (g.cash < totalFleaCost) return ctx.fail(`Need $${totalFleaCost}`);
      if (!g.fleaMarketStands) g.fleaMarketStands = [];
      if (g.fleaMarketStands.some(s => s.marketId === marketId)) {
        return ctx.fail('Already have a stand there');
      }
      g.cash -= totalFleaCost;
      g.fleaMarketStands.push({ id: uid(), marketId, cityId: market.cityId, name: market.name });
      g.log.push(`Opened flea stand at ${market.name} (-$${FLEA_STAND_COST + transportCost})`);
      break;
    }

    case 'closeFleaStand': {
      const { standId } = params;
      if (!g.fleaMarketStands) g.fleaMarketStands = [];
      const idx = g.fleaMarketStands.findIndex(s => s.id === standId);
      if (idx === -1) return ctx.fail('Stand not found');
      const removed = g.fleaMarketStands.splice(idx, 1)[0];
      g.log.push(`Closed flea stand at ${removed.name}`);
      break;
    }

    case 'attendCarMeet': {
      const { meetId } = params;
      const meet = CAR_MEETS.find(m => m.id === meetId);
      if (!meet) return ctx.fail('Invalid car meet');
      const cal = getCalendar(g.day || 1);
      const dayOfYear = cal.dayOfYear;
      if (dayOfYear < CAR_MEET_SUMMER_START || dayOfYear > CAR_MEET_SUMMER_END) {
        return ctx.fail('Car meets are only held in summer (June-August)');
      }
      if (cal.dayOfWeek !== 0 && cal.dayOfWeek !== 5 && cal.dayOfWeek !== 6) {
        return ctx.fail('Car meets are only on weekends');
      }
      const transportCost = CAR_MEET_TRANSPORT[meet.transport] || 50;
      const totalCost = meet.fee + transportCost;
      if (g.cash < totalCost) return ctx.fail(`Need $${totalCost} (fee + transport)`);
      if (!g.carMeetAttendance) g.carMeetAttendance = [];
      if (g.carMeetAttendance.some(a => a.meetId === meetId && a.day === g.day)) {
        return ctx.fail('Already attending this meet today');
      }
      g.cash -= totalCost;
      g.carMeetAttendance.push({ meetId, day: g.day, cityId: meet.cityId, name: meet.name });
      g.carMeetsAttended = (g.carMeetsAttended || 0) + 1;
      g.log.push(`Attending ${meet.name} (-$${totalCost})`);
      break;
    }

    case 'setPremium': {
      if (ctx.NODE_ENV === 'production') return ctx.fail('Use in-app purchase');
      g.isPremium = true;
      g.premiumSince = g.day;
      if (!g.cosmetics) g.cosmetics = [];
      if (!g.cosmetics.includes('gold_name')) g.cosmetics.push('gold_name');
      g.log.push('[DEV] Premium membership activated');
      break;
    }

    case 'activatePremium': {
      g.isPremium = true;
      g.premiumSince = g.day;
      if (!g.cosmetics) g.cosmetics = [];
      if (!g.cosmetics.includes('gold_name')) g.cosmetics.push('gold_name');
      g.log.push('Premium membership activated!');
      break;
    }

    case 'rewardAdWatch': {
      const { MONET: monetAd } = await import('../../../shared/constants/monetization.js');
      const schedule = monetAd.adRewards.schedule;
      const maxAds = monetAd.adRewards.maxRewardedPerDay;

      if (!g.adRewards) g.adRewards = { lastDay: 0, count: 0 };
      const adDay = g.day || 1;
      if (g.adRewards.lastDay !== adDay) {
        g.adRewards.lastDay = adDay;
        g.adRewards.count = 0;
      }
      if (g.adRewards.count >= maxAds) {
        return ctx.fail(`Maximum ${maxAds} ad rewards per day`);
      }

      // Diminishing returns from schedule
      const reward = schedule[Math.min(g.adRewards.count, schedule.length - 1)];

      // TC cap check
      let adCap = monetAd.tcStorage.baseCap;
      if (g.isPremium) adCap += monetAd.tcStorage.premiumBonus;
      for (let i = 0; i < (g.tcStorageLevel || 0) && i < monetAd.tcStorage.upgrades.length; i++) adCap += monetAd.tcStorage.upgrades[i].addCap;

      const prev = g.tireCoins || 0;
      g.tireCoins = Math.min(prev + reward, adCap);
      const actual = g.tireCoins - prev;

      g.adRewards.count += 1;
      g.totalAdWatches = (g.totalAdWatches || 0) + 1;

      if (actual > 0) {
        g.log.push(`Earned ${actual} TC from watching an ad (${g.adRewards.count}/${maxAds} today)`);
      } else {
        g.log.push({ msg: 'TC at capacity — ad reward lost!', cat: 'warning' });
      }

      ctx.trackEvent(ctx.playerId, 'ad_watched', {
        reward: actual, adsToday: g.adRewards.count, totalAds: g.totalAdWatches,
      });

      // Log to revenue_events for admin dashboard
      try {
        const { pool } = await import('../../db/pool.js');
        await pool.query(`
          INSERT INTO revenue_events (player_id, event_type, revenue_cents, platform, metadata)
          VALUES ($1, 'ad_impression', 0, 'android', $2)
        `, [ctx.playerId, JSON.stringify({ adUnit: 'rewarded_tc', rewardAmount: actual, adIndex: g.adRewards.count })]);
      } catch { /* non-critical */ }

      break;
    }

    case 'activateAutoRestock': {
      g.hasAutoRestock = true;
      g.log.push('Auto-Restock unlocked! Set up automatic supplier orders.');
      break;
    }

    case 'blockPlayer': {
      const { targetPlayerId, targetName } = params;
      if (!targetPlayerId) return ctx.fail('Missing targetPlayerId');
      if (targetPlayerId === ctx.playerId) return ctx.fail('Cannot block yourself');
      if (!g.blockedPlayers) g.blockedPlayers = [];
      if (!g.blockedPlayers.some(b => b.id === targetPlayerId)) {
        g.blockedPlayers.push({ id: targetPlayerId, name: targetName || 'Unknown' });
      }
      break;
    }

    case 'unblockPlayer': {
      const { targetPlayerId: unblockId } = params;
      if (!unblockId) return ctx.fail('Missing targetPlayerId');
      g.blockedPlayers = (g.blockedPlayers || []).filter(b => b.id !== unblockId);
      break;
    }

    case 'updateNotifications': {
      const allowed = ['globalEvents', 'cashReserve', 'cashReserveThreshold', 'tcStorage', 'inventory', 'loanPayments', 'factoryProduction'];
      if (!g.notifications) g.notifications = { globalEvents: true, cashReserve: true, cashReserveThreshold: 5000, tcStorage: true, inventory: true, loanPayments: false, factoryProduction: false };
      for (const [key, val] of Object.entries(params)) {
        if (!allowed.includes(key)) continue;
        if (key === 'cashReserveThreshold') {
          g.notifications[key] = Math.max(0, Math.min(10000000, Number(val) || 5000));
        } else {
          g.notifications[key] = !!val;
        }
      }
      break;
    }

    case 'instantRetread': {
      const { MONET: monetConsts } = await import('../../../shared/constants/monetization.js');
      const pending = (g.retreadQueue || []).filter(r => g.day < r.completionDay);
      if (pending.length === 0) return ctx.fail('No pending retreads');
      const tcCost = pending.length * (monetConsts.instantRetreadCost || 30);
      if ((g.tireCoins || 0) < tcCost) return ctx.fail(`Need ${tcCost} TC (you have ${g.tireCoins || 0})`);
      for (const r of pending) r.completionDay = g.day;
      g.tireCoins -= tcCost;
      g.log = g.log || [];
      g.log.push({ msg: `Instant retread: ${pending.length} tire${pending.length !== 1 ? 's' : ''} completed (${tcCost} TC)`, cat: 'event' });
      break;
    }

    case 'buyMarketIntel': {
      const { MONET: monetConsts2 } = await import('../../../shared/constants/monetization.js');
      const intelCost = monetConsts2.marketIntelCost || 100;
      const intelDuration = monetConsts2.marketIntelDuration || 7;
      if ((g.tireCoins || 0) < intelCost) return ctx.fail(`Need ${intelCost} TC (you have ${g.tireCoins || 0})`);
      if (g.marketIntel && g.day < g.marketIntel.expiresDay) {
        return ctx.fail(`Intel still active (${g.marketIntel.expiresDay - g.day} days remaining)`);
      }
      g.marketIntel = { purchasedDay: g.day, expiresDay: g.day + intelDuration };
      g.tireCoins -= intelCost;
      g.log = g.log || [];
      g.log.push({ msg: `Market Intel purchased: ${intelDuration}-day city demand analysis (${intelCost} TC)`, cat: 'event' });
      break;
    }

    case 'upgradeTcStorage': {
      const { MONET: monetTcStore } = await import('../../../shared/constants/monetization.js');
      const tcStore = monetTcStore.tcStorage;
      const currentLevel = g.tcStorageLevel || 0;
      const nextUpgrade = tcStore.upgrades.find(u => u.level === currentLevel + 1);
      if (!nextUpgrade) return ctx.fail('TC storage already at max level');
      if ((g.tireCoins || 0) < nextUpgrade.tcCost) {
        return ctx.fail(`Need ${nextUpgrade.tcCost} TC (you have ${g.tireCoins || 0})`);
      }
      g.tireCoins -= nextUpgrade.tcCost;
      g.tcStorageLevel = nextUpgrade.level;
      const newCap = tcStore.baseCap
        + (g.isPremium ? tcStore.premiumBonus : 0)
        + tcStore.upgrades.filter(u => u.level <= nextUpgrade.level).reduce((a, u) => a + u.addCap, 0);
      g.log = g.log || [];
      g.log.push({ msg: `Upgraded TC Storage to Level ${nextUpgrade.level} (+${nextUpgrade.addCap} capacity, new cap: ${newCap} TC)`, cat: 'event' });
      break;
    }

    case 'buyMarketingBlitz': {
      // TC sink: 7-day marketing boost across all locations (+50% customer traffic)
      const blitzCost = 75;
      if ((g.tireCoins || 0) < blitzCost) return ctx.fail(`Need ${blitzCost} TC (you have ${g.tireCoins || 0})`);
      if (g.marketingBlitz && g.day < g.marketingBlitz.expiresDay) {
        return ctx.fail(`Blitz still active (${g.marketingBlitz.expiresDay - g.day} days remaining)`);
      }
      g.tireCoins -= blitzCost;
      g.marketingBlitz = { purchasedDay: g.day, expiresDay: g.day + 7 };
      g.log = g.log || [];
      g.log.push({ msg: `Marketing Blitz activated! +50% customer traffic for 7 days (${blitzCost} TC)`, cat: 'event' });
      break;
    }

    case 'buyRepBoost': {
      // TC sink: temporary +5 reputation for 14 days (useful for unlocking thresholds)
      const boostCost = 150;
      if ((g.tireCoins || 0) < boostCost) return ctx.fail(`Need ${boostCost} TC (you have ${g.tireCoins || 0})`);
      if (g.repBoost && g.day < g.repBoost.expiresDay) {
        return ctx.fail(`Rep boost still active (${g.repBoost.expiresDay - g.day} days remaining)`);
      }
      g.tireCoins -= boostCost;
      g.repBoost = { purchasedDay: g.day, expiresDay: g.day + 14, amount: 5 };
      g.log = g.log || [];
      g.log.push({ msg: `Reputation Boost activated! +5 rep for 14 days (${boostCost} TC)`, cat: 'event' });
      break;
    }

    // ═══════════════════════════════════════
    // TC UTILITY — Rush Timers
    // ═══════════════════════════════════════

    case 'rushRetread': {
      const cost = TC_RUSH.retreading.cost;
      if ((g.tireCoins || 0) < cost) return ctx.fail(`Need ${cost} TC`);
      const pending = (g.retreadQueue || []).filter(r => r.completionDay > g.day);
      if (pending.length === 0) return ctx.fail('No retreads in progress');
      for (const r of pending) r.completionDay = g.day;
      g.tireCoins -= cost * pending.length;
      g.log.push({ msg: `Rushed ${pending.length} retread(s) — ready now! (-${cost * pending.length} TC)`, cat: 'event' });
      break;
    }

    case 'rushShopConstruction': {
      const cost = TC_RUSH.shopConstruction.cost;
      if ((g.tireCoins || 0) < cost) return ctx.fail(`Need ${cost} TC`);
      if (!g._pendingShop) return ctx.fail('No shop under construction');
      g._pendingShop.completionDay = g.day;
      g.tireCoins -= cost;
      g.log.push({ msg: `Fast-tracked grand opening! Shop ready now (-${cost} TC)`, cat: 'event' });
      break;
    }

    case 'rushFactoryBatch': {
      if (!g.hasFactory || !g.factory) return ctx.fail('No factory');
      const queue = g.factory.productionQueue || [];
      const pending = queue.filter(q => q.completionDay > g.day);
      if (pending.length === 0) return ctx.fail('No production in progress');
      const daysToSkip = Math.ceil((pending[0].completionDay - g.day) * (TC_RUSH.factoryBatch.maxSkip || 0.5));
      const cost = daysToSkip * TC_RUSH.factoryBatch.costPerDay;
      if ((g.tireCoins || 0) < cost) return ctx.fail(`Need ${cost} TC`);
      for (const q of pending) q.completionDay = Math.max(g.day, q.completionDay - daysToSkip);
      g.tireCoins -= cost;
      g.log.push({ msg: `Expedited production — ${daysToSkip} days skipped (-${cost} TC)`, cat: 'event' });
      break;
    }

    case 'rushRDProject': {
      if (!g.factory?.rdProjects?.length) return ctx.fail('No R&D in progress');
      const project = g.factory.rdProjects.find(p => !p.earned && p.completionDay > g.day);
      if (!project) return ctx.fail('No active R&D project');
      const daysRemaining = project.completionDay - g.day;
      const daysToSkip = Math.ceil(daysRemaining * (TC_RUSH.rdProject.maxSkip || 0.3));
      const cost = daysToSkip * TC_RUSH.rdProject.costPerDay;
      if ((g.tireCoins || 0) < cost) return ctx.fail(`Need ${cost} TC`);
      project.completionDay -= daysToSkip;
      g.tireCoins -= cost;
      g.log.push({ msg: `Accelerated R&D — ${daysToSkip} days shaved off (-${cost} TC)`, cat: 'event' });
      break;
    }

    // ═══════════════════════════════════════
    // TC UTILITY — Supplier Access (Vinnie's Connections)
    // ═══════════════════════════════════════

    case 'buySupplierAccess': {
      const cfg = TC_SUPPLIER_ACCESS.premiumSupplierUnlock;
      if ((g.tireCoins || 0) < cfg.cost) return ctx.fail(`Need ${cfg.cost} TC`);
      if (!g._supplierUnlockUses) g._supplierUnlockUses = 0;
      if (g._supplierUnlockUses >= cfg.maxUses) return ctx.fail(`Already used ${cfg.maxUses} times`);
      // Reduce rep requirement for next supplier tier by repDiscount
      g._supplierRepDiscount = (g._supplierRepDiscount || 0) + cfg.repDiscount;
      g._supplierUnlockUses++;
      g.tireCoins -= cfg.cost;
      g.log.push({ msg: `Vinnie pulled some strings — supplier rep requirement reduced by ${cfg.repDiscount} (-${cfg.cost} TC)`, cat: 'event' });
      break;
    }

    case 'buyPriorityRestock': {
      const cost = TC_SUPPLIER_ACCESS.priorityRestocking.cost;
      if ((g.tireCoins || 0) < cost) return ctx.fail(`Need ${cost} TC`);
      if (g._priorityRestock && g.day < g._priorityRestock.expiresDay) {
        return ctx.fail(`Priority restock active (${g._priorityRestock.expiresDay - g.day} days left)`);
      }
      g._priorityRestock = { purchasedDay: g.day, expiresDay: g.day + 7 };
      g.tireCoins -= cost;
      g.log.push({ msg: `Priority restocking active for 7 days — first dibs on supply (-${cost} TC)`, cat: 'event' });
      break;
    }

    case 'buyExclusiveLot': {
      // Vinnie offers exclusive discounted tire lots for TC
      const lotCfg = TC_SUPPLIER_ACCESS.exclusiveLots;
      if (!lotCfg.enabled) return ctx.fail('Exclusive lots not available');
      const { tireType, qty, discount, tcCost } = params;
      if (!tireType || !TIRES[tireType]) return ctx.fail('Invalid tire type');
      if ((g.tireCoins || 0) < tcCost) return ctx.fail(`Need ${tcCost} TC`);
      if (qty < lotCfg.maxQuantity[0] || qty > lotCfg.maxQuantity[1]) return ctx.fail('Invalid quantity');
      // Add tires to warehouse
      if (!g.warehouseInventory) g.warehouseInventory = {};
      g.warehouseInventory[tireType] = (g.warehouseInventory[tireType] || 0) + qty;
      g.tireCoins -= tcCost;
      g.log.push({ msg: `Vinnie's deal: ${qty} ${TIRES[tireType]?.n || tireType} at ${Math.round(discount * 100)}% off (-${tcCost} TC)`, cat: 'event' });
      break;
    }

    // ═══════════════════════════════════════
    // TC UTILITY — Competitive Intelligence
    // ═══════════════════════════════════════

    case 'buyDemandHeatmap': {
      const cost = TC_INTEL.cityDemandHeatmap.cost;
      if ((g.tireCoins || 0) < cost) return ctx.fail(`Need ${cost} TC`);
      if (g.demandHeatmap && g.day < g.demandHeatmap.expiresDay) {
        return ctx.fail(`Heatmap active (${g.demandHeatmap.expiresDay - g.day} days left)`);
      }
      g.demandHeatmap = { purchasedDay: g.day, expiresDay: g.day + TC_INTEL.cityDemandHeatmap.duration };
      g.tireCoins -= cost;
      g.log.push({ msg: `City demand heatmap unlocked for ${TC_INTEL.cityDemandHeatmap.duration} days (-${cost} TC)`, cat: 'event' });
      break;
    }

    case 'buyCompetitorPricing': {
      const cost = TC_INTEL.competitorPricing.cost;
      if ((g.tireCoins || 0) < cost) return ctx.fail(`Need ${cost} TC`);
      if (g.competitorPricing && g.day < g.competitorPricing.expiresDay) {
        return ctx.fail(`Competitor intel active (${g.competitorPricing.expiresDay - g.day} days left)`);
      }
      g.competitorPricing = { purchasedDay: g.day, expiresDay: g.day + TC_INTEL.competitorPricing.duration };
      g.tireCoins -= cost;
      g.log.push({ msg: `Competitor pricing intel for ${TC_INTEL.competitorPricing.duration} days (-${cost} TC)`, cat: 'event' });
      break;
    }

    case 'buySupplierForecast': {
      const cost = TC_INTEL.supplierForecast.cost;
      if ((g.tireCoins || 0) < cost) return ctx.fail(`Need ${cost} TC`);
      if (g.supplierForecast && g.day < g.supplierForecast.expiresDay) {
        return ctx.fail(`Forecast active (${g.supplierForecast.expiresDay - g.day} days left)`);
      }
      g.supplierForecast = {
        purchasedDay: g.day,
        expiresDay: g.day + TC_INTEL.supplierForecast.duration,
        accuracy: TC_INTEL.supplierForecast.accuracy,
      };
      g.tireCoins -= cost;
      g.log.push({ msg: `Vinnie's supplier forecast: 30-day price predictions unlocked (-${cost} TC)`, cat: 'event' });
      break;
    }

    case 'buyPlayerScout': {
      const cost = TC_INTEL.playerScout.cost;
      const { targetPlayerId } = params;
      if (!targetPlayerId) return ctx.fail('Must specify a player');
      if ((g.tireCoins || 0) < cost) return ctx.fail(`Need ${cost} TC`);
      if (!g.scoutedPlayers) g.scoutedPlayers = {};
      g.scoutedPlayers[targetPlayerId] = { purchasedDay: g.day, expiresDay: g.day + TC_INTEL.playerScout.duration };
      g.tireCoins -= cost;
      g.log.push({ msg: `Scouting competitor for ${TC_INTEL.playerScout.duration} days (-${cost} TC)`, cat: 'event' });
      break;
    }

    case 'buyStockInsider': {
      const cost = TC_INTEL.stockInsider.cost;
      if ((g.tireCoins || 0) < cost) return ctx.fail(`Need ${cost} TC`);
      // Generate a tip — 75% chance it's accurate
      const accurate = Math.random() < 0.75;
      const direction = Math.random() < 0.5 ? 'up' : 'down';
      const tip = accurate ? direction : (direction === 'up' ? 'down' : 'up');
      g.stockInsiderTip = { day: g.day, tip, expiresDay: g.day + 7 };
      g.tireCoins -= cost;
      g.log.push({ msg: `Vinnie's stock tip: market trending ${tip} this week (75% reliable) (-${cost} TC)`, cat: 'event' });
      break;
    }

    // ═══════════════════════════════════════
    // TC UTILITY — Financial Perks
    // ═══════════════════════════════════════

    case 'buyLoanRateReduction': {
      const cfg = TC_FINANCIAL.loanRateReduction;
      if ((g.tireCoins || 0) < cfg.cost) return ctx.fail(`Need ${cfg.cost} TC`);
      if (!g._loanRateReductions) g._loanRateReductions = 0;
      if (g._loanRateReductions >= cfg.maxReductions) return ctx.fail('Already at max rate reductions');
      g._loanRateReductions++;
      g._loanRateBonus = (g._loanRateBonus || 0) + cfg.rateReduction;
      g.tireCoins -= cfg.cost;
      g.log.push({ msg: `Vinnie negotiated a better rate — loans ${(g._loanRateBonus * 100).toFixed(0)}% cheaper (-${cfg.cost} TC)`, cat: 'event' });
      break;
    }

    case 'buyCreditLine': {
      const cfg = TC_FINANCIAL.creditLine;
      if ((g.tireCoins || 0) < cfg.cost) return ctx.fail(`Need ${cfg.cost} TC`);
      if (g._activeCreditLine && g._activeCreditLine.remaining > 0) return ctx.fail('Already have an active credit line');
      g._activeCreditLine = {
        amount: cfg.cashAmount,
        remaining: cfg.cashAmount,
        rate: cfg.interestRate,
        dueDay: g.day + cfg.repaymentDays,
        purchasedDay: g.day,
      };
      g.cash += cfg.cashAmount;
      g.tireCoins -= cfg.cost;
      g.log.push({ msg: `Vinnie's credit line: +$${(cfg.cashAmount/1000).toFixed(0)}K cash, ${(cfg.interestRate*100)}% interest, ${cfg.repaymentDays} days (-${cfg.cost} TC)`, cat: 'event' });
      break;
    }

    case 'buyInsuranceUpgrade': {
      const cfg = TC_FINANCIAL.insuranceUpgrade;
      if ((g.tireCoins || 0) < cfg.cost) return ctx.fail(`Need ${cfg.cost} TC`);
      if (g._insuranceBoost && g.day < g._insuranceBoost.expiresDay) {
        return ctx.fail(`Insurance boost active (${g._insuranceBoost.expiresDay - g.day} days left)`);
      }
      g._insuranceBoost = { purchasedDay: g.day, expiresDay: g.day + cfg.duration, boost: cfg.coverageBoost };
      g.tireCoins -= cfg.cost;
      g.log.push({ msg: `Enhanced insurance for ${cfg.duration} days — +${Math.round(cfg.coverageBoost * 100)}% coverage (-${cfg.cost} TC)`, cat: 'event' });
      break;
    }

    // ═══════════════════════════════════════
    // TC UTILITY — Staff & Operations
    // ═══════════════════════════════════════

    case 'hireElite': {
      const cfg = TC_OPERATIONS.eliteHire;
      const { locationId, role } = params;
      if (!cfg.roles.includes(role)) return ctx.fail(`Invalid role. Must be: ${cfg.roles.join(', ')}`);
      if ((g.tireCoins || 0) < cfg.cost) return ctx.fail(`Need ${cfg.cost} TC`);
      const loc = (g.locations || []).find(l => l.id === locationId);
      if (!loc) return ctx.fail('Location not found');
      if (!loc._eliteStaff) loc._eliteStaff = {};
      if (loc._eliteStaff[role]) return ctx.fail(`Already have an elite ${role} at this location`);
      loc._eliteStaff[role] = { hiredDay: g.day, multiplier: cfg.productivityMultiplier };
      g.tireCoins -= cfg.cost;
      g.log.push({ msg: `Vinnie's contact: elite ${role} hired — 1.5x productivity! (-${cfg.cost} TC)`, cat: 'event' });
      break;
    }

    case 'buyTrainingProgram': {
      const cfg = TC_OPERATIONS.trainingProgram;
      const { locationId } = params;
      if ((g.tireCoins || 0) < cfg.cost) return ctx.fail(`Need ${cfg.cost} TC`);
      const loc = (g.locations || []).find(l => l.id === locationId);
      if (!loc) return ctx.fail('Location not found');
      if (loc._trainingComplete) return ctx.fail('Training already completed at this location');
      loc._trainingInProgress = { startDay: g.day, completionDay: g.day + cfg.duration };
      g.tireCoins -= cfg.cost;
      g.log.push({ msg: `Staff training program started — permanent +${Math.round(cfg.boost * 100)}% productivity in ${cfg.duration} days (-${cfg.cost} TC)`, cat: 'event' });
      break;
    }

    // ═══════════════════════════════════════
    // TC PURCHASE — IAP (real money → TireCoins)
    // ═══════════════════════════════════════

    case 'purchaseTC': {
      // This is called AFTER the client-side IAP receipt is validated
      // In production, the server should verify the receipt with Apple/Google
      // For now, we trust the client (will add server-side validation with SSVC later)
      const { MONET: monetPurchase } = await import('../../../shared/constants/monetization.js');
      const { tierId, receipt } = params;
      const tier = monetPurchase.tcPurchase?.tiers?.find(t => t.id === tierId);
      if (!tier) return ctx.fail('Invalid purchase tier');

      // TODO: Validate receipt with App Store / Play Store
      // For now, grant the TC
      let tcToGrant = tier.tc;

      // First purchase ever? Double it
      if (!g._firstTcPurchase) {
        tcToGrant = Math.floor(tcToGrant * monetPurchase.tcPurchase.firstPurchaseMultiplier);
        g._firstTcPurchase = g.day;
      }

      // Premium bonus
      if (g.isPremium) {
        tcToGrant = Math.floor(tcToGrant * (1 + monetPurchase.tcPurchase.premiumPurchaseBonus));
      }

      // Grant TC (bypasses cap — paid TC should never be lost)
      g.tireCoins = (g.tireCoins || 0) + tcToGrant;
      g._totalTcPurchased = (g._totalTcPurchased || 0) + tcToGrant;
      g._purchaseHistory = g._purchaseHistory || [];
      g._purchaseHistory.push({
        tierId, tc: tcToGrant, price: tier.price, day: g.day, timestamp: Date.now(),
      });
      if (g._purchaseHistory.length > 50) g._purchaseHistory.shift();

      g.log.push({ msg: `Purchased ${tcToGrant} TireCoins! ${tier.bonus > 0 ? `(includes ${tier.bonus} bonus)` : ''}`, cat: 'event' });

      // Log to revenue_events for admin dashboard
      try {
        const { pool } = await import('../../../server/db/pool.js');
        await pool.query(`INSERT INTO revenue_events (id, player_id, event_type, data) VALUES ($1, $2, 'tc_purchase', $3::jsonb)`,
          [uid(), ctx.playerId, JSON.stringify({ tierId, tc: tcToGrant, price: tier.price, firstPurchase: !g._firstTcPurchase })]);
      } catch (e) { /* non-critical */ }

      break;
    }

    case 'devSetState': {
      if (ctx.NODE_ENV === 'production' && (!process.env.ADMIN_KEY || params.adminKey !== process.env.ADMIN_KEY)) {
        return ctx.fail('Not available');
      }
      if (params.cash != null) g.cash = Number(params.cash);
      if (params.reputation != null) g.reputation = Number(params.reputation);
      if (params.day != null) g.day = Number(params.day);
      if (params.tireCoins != null) g.tireCoins = Number(params.tireCoins);
      break;
    }

    default: return null;
  }
  return g;
}
