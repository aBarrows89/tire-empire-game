import { TIRES } from '../../../shared/constants/tires.js';
import { CITIES } from '../../../shared/constants/cities.js';
import { uid } from '../../../shared/helpers/random.js';
import { R } from '../../../shared/helpers/format.js';
import { getCalendar } from '../../../shared/helpers/calendar.js';
import { FRANCHISE } from '../../../shared/constants/franchise.js';
import { FLEA_MARKETS, FLEA_STAND_COST, FLEA_TRANSPORT } from '../../../shared/constants/fleaMarkets.js';
import { CAR_MEETS, CAR_MEET_SUMMER_START, CAR_MEET_SUMMER_END, CAR_MEET_TRANSPORT } from '../../../shared/constants/carMeets.js';
import { rebuildGlobalInv } from '../../../shared/helpers/inventory.js';

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
      const totalCost = shopCostBase + FRANCHISE.franchiseFee;
      if (g.cash < totalCost) return ctx.fail('Not enough cash');
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
      if (!g.adRewards) g.adRewards = { lastDay: 0, count: 0 };
      const adDay = g.day || 1;
      if (g.adRewards.lastDay !== adDay) {
        g.adRewards.lastDay = adDay;
        g.adRewards.count = 0;
      }
      if (g.adRewards.count >= 3) {
        return ctx.fail('Daily ad reward limit reached');
      }
      g.adRewards.count += 1;
      // Diminishing returns: 1st=50, 2nd=30, 3rd=15
      const adRewardTiers = [50, 30, 15];
      const reward = adRewardTiers[g.adRewards.count - 1] || 15;
      const { MONET: monetAd } = await import('../../../shared/constants/monetization.js');
      let adCap = monetAd.tcStorage.baseCap;
      if (g.isPremium) adCap += monetAd.tcStorage.premiumBonus;
      for (let i = 0; i < (g.tcStorageLevel || 0) && i < monetAd.tcStorage.upgrades.length; i++) adCap += monetAd.tcStorage.upgrades[i].addCap;
      g.tireCoins = Math.min((g.tireCoins || 0) + reward, adCap);
      g.log.push(`Earned ${reward} TC from watching an ad (${g.adRewards.count}/3 today)`);
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
