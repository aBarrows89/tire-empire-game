import { Router } from 'express';
import { getPlayer, savePlayerState, getGame, saveGame, addShopSaleListing, removeShopSaleListing, getShopSaleListings } from '../db/queries.js';
import { authMiddleware } from '../middleware/auth.js';
import { NODE_ENV } from '../config.js';
import { uid } from '../../shared/helpers/random.js';
import { getCap, getInv, getLocInv, getLocCap, getStorageCap, rebuildGlobalInv, addA } from '../../shared/helpers/inventory.js';
import { canOpenInCity } from '../../shared/helpers/market.js';
import { TIRES } from '../../shared/constants/tires.js';
import { STORAGE } from '../../shared/constants/storage.js';
import { SOURCES } from '../../shared/constants/sources.js';
import { SUPPLIERS } from '../../shared/constants/suppliers.js';
import { LOANS } from '../../shared/constants/loans.js';
import { SHOP_BASE, shopCost, shopRent } from '../../shared/constants/shop.js';
import { CITIES } from '../../shared/constants/cities.js';
import { SERVICES } from '../../shared/constants/services.js';
import { R } from '../../shared/helpers/format.js';
import { getCalendar } from '../../shared/helpers/calendar.js';
import { MARKETING } from '../../shared/constants/marketing.js';
import { INSURANCE } from '../../shared/constants/insurance.js';
import { RETREADING } from '../../shared/constants/retreading.js';
import { getSupplierRelTier } from '../../shared/constants/supplierRelations.js';
import { INSPECTION } from '../../shared/constants/inspection.js';
import { FRANCHISE } from '../../shared/constants/franchise.js';
import { FLEA_MARKETS, FLEA_STAND_COST, FLEA_TRANSPORT } from '../../shared/constants/fleaMarkets.js';
import { CAR_MEETS, CAR_MEET_SUMMER_START, CAR_MEET_SUMMER_END, CAR_MEET_TRANSPORT } from '../../shared/constants/carMeets.js';
import { FACTORY } from '../../shared/constants/factory.js';
import { RAW_MATERIALS, FACTORY_DISCOUNT_TIERS_DEFAULT, RD_PROJECTS, CERTIFICATIONS, EXCLUSIVE_TIRES, CFO_ROLE, LINE_SWITCH_DAYS, RUBBER_FARM, SYNTHETIC_LAB } from '../../shared/constants/factoryBrand.js';
import { getEffectiveProductionCost, getBrandTireKey } from '../../shared/helpers/factoryBrand.js';
import { MANUFACTURERS } from '../../shared/constants/manufacturers.js';
import { PAY } from '../../shared/constants/staff.js';
import { getNextUpgrade } from '../../shared/constants/shopStorage.js';
import { getShopValuation, SHOP_BID, AI_BUYER_NAMES } from '../../shared/constants/shopSale.js';

const router = Router();

// POST /api/action — player actions
router.post('/', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    let g = { ...player.game_state };
    const { action, ...params } = req.body;
    g.log = g.log || [];

    switch (action) {
      case 'setPrice': {
        const { tire, price } = params;
        if (!TIRES[tire]) return res.status(400).json({ error: 'Invalid tire type' });
        const t = TIRES[tire];
        g.prices[tire] = Math.max(t.lo, Math.min(t.hi, price));
        break;
      }

      case 'buySource': {
        const { sourceId } = params;
        const src = SOURCES[sourceId];
        if (!src) return res.status(400).json({ error: 'Invalid source' });
        // Day-of-week restriction (e.g. flea market: Fri/Sat/Sun)
        if (src.days) {
          const cal = getCalendar(g.day || g.week || 1);
          if (!src.days.includes(cal.dayOfWeek)) {
            return res.status(400).json({ error: `${src.n} is only open on certain days` });
          }
        }
        if (g.cash < src.c) return res.status(400).json({ error: 'Not enough cash' });
        if (src.rr && g.reputation < src.rr) return res.status(400).json({ error: 'Not enough reputation' });

        const freeSpace = getCap(g) - getInv(g);
        if (freeSpace <= 0) return res.status(400).json({ error: 'No storage space' });

        g.cash -= src.c;
        const rawQty = R(src.min, src.max);
        const qty = Math.min(rawQty, freeSpace);
        // Target: warehouse inventory (van/garage/warehouse storage), or first location
        if (!g.warehouseInventory) g.warehouseInventory = {};
        const whFree = getStorageCap(g) - Object.values(g.warehouseInventory).reduce((a, b) => a + b, 0);
        const usedTypes = Object.keys(TIRES).filter(k => TIRES[k].used);
        let added = 0;
        for (let i = 0; i < qty; i++) {
          const k = usedTypes[R(0, usedTypes.length - 1)];
          if (added < whFree) {
            g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + 1;
          } else if (g.locations.length > 0) {
            // Overflow to first location with space (skip if all full)
            const loc = g.locations.find(l => getLocInv(l) < getLocCap(l));
            if (loc) {
              if (!loc.inventory) loc.inventory = {};
              loc.inventory[k] = (loc.inventory[k] || 0) + 1;
            }
            // else: all locations full — tire is lost (global cap should prevent this)
          } else {
            g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + 1;
          }
          added++;
        }
        rebuildGlobalInv(g);
        g.log.push(`Sourced ${qty} tires from ${src.n}${qty < rawQty ? ` (${rawQty - qty} didn't fit)` : ''}`);
        break;
      }

      case 'buyStorage': {
        const { type } = params;
        const st = STORAGE[type];
        if (!st) return res.status(400).json({ error: 'Invalid storage type' });
        if (g.cash < st.c) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= st.c;
        g.storage.push({ type, id: uid() });
        // Unlock warehouse feature when buying warehouse-class storage
        if (['smallWH', 'warehouse', 'distCenter'].includes(type)) {
          g.hasWarehouse = true;
          if (!g.warehouseInventory) g.warehouseInventory = {};
        }
        break;
      }

      case 'buyStorageTC': {
        const TC_STORAGE_COST = 500;
        const TC_STORAGE_BONUS = 100;
        const TC_STORAGE_MAX = 5;
        const currentBonus = g.bonusStorage || 0;
        const purchases = currentBonus / TC_STORAGE_BONUS;
        if (purchases >= TC_STORAGE_MAX) return res.status(400).json({ error: `Max ${TC_STORAGE_MAX} storage upgrades purchased` });
        if ((g.tireCoins || 0) < TC_STORAGE_COST) return res.status(400).json({ error: `Need ${TC_STORAGE_COST} TC (you have ${g.tireCoins || 0})` });
        g.tireCoins -= TC_STORAGE_COST;
        g.bonusStorage = currentBonus + TC_STORAGE_BONUS;
        g.log = g.log || [];
        g.log.push(`Purchased +${TC_STORAGE_BONUS} warehouse capacity for ${TC_STORAGE_COST} TC`);
        break;
      }

      case 'sellStorage': {
        const { storageId } = params;
        const idx = g.storage.findIndex(s => s.id === storageId);
        if (idx === -1) return res.status(400).json({ error: 'Storage unit not found' });
        const unit = g.storage[idx];
        const st = STORAGE[unit.type];
        if (!st) return res.status(400).json({ error: 'Invalid storage type' });
        // Calculate current warehouse inventory
        const whInv = Object.values(g.warehouseInventory || {}).reduce((a, b) => a + b, 0);
        // Calculate remaining capacity if we remove this unit
        const remainingCap = getStorageCap(g) - st.cap;
        if (whInv > remainingCap) {
          return res.status(400).json({ error: `Cannot sell: ${whInv} tires in warehouse but only ${remainingCap} capacity would remain. Move tires first.` });
        }
        const sellPrice = Math.round(st.c * 0.5);
        g.cash += sellPrice;
        g.storage.splice(idx, 1);
        g.log.push(`Sold ${st.n} for $${sellPrice.toLocaleString()} (50% of cost)`);
        break;
      }

      case 'openShop': {
        const { cityId } = params;
        const city = CITIES.find(c => c.id === cityId);
        if (!city) return res.status(400).json({ error: 'Invalid city' });
        const cost = shopCost(city);
        if (g.cash < cost) return res.status(400).json({ error: 'Not enough cash' });
        const check = canOpenInCity(g, cityId);
        if (!check.ok) return res.status(400).json({ error: check.reason });
        g.cash -= cost;
        g.locations.push({ cityId, id: uid(), locStorage: 0, inventory: {}, loyalty: 0, openedDay: g.day });
        break;
      }

      case 'hireStaff': {
        const { role } = params;
        if (g.staff[role] === undefined) return res.status(400).json({ error: 'Invalid role' });
        const hireCost = PAY[role] || 0;
        if (g.cash < hireCost) return res.status(400).json({ error: `Not enough cash (need $${hireCost} for first month salary)` });
        g.cash -= hireCost;
        g.staff[role]++;
        break;
      }

      case 'fireStaff': {
        const { role } = params;
        if (!g.staff[role] || g.staff[role] <= 0) return res.status(400).json({ error: 'No staff to fire' });
        g.staff[role]--;
        break;
      }

      case 'buySupplier': {
        const { index } = params;
        const sup = SUPPLIERS[index];
        if (!sup) return res.status(400).json({ error: 'Invalid supplier' });
        if (g.cash < sup.c) return res.status(400).json({ error: 'Not enough cash' });
        if (sup.rr && g.reputation < sup.rr) return res.status(400).json({ error: 'Not enough reputation' });
        g.cash -= sup.c;
        g.unlockedSuppliers = addA(g.unlockedSuppliers || [], index);
        break;
      }

      case 'orderTires': {
        const { tire, qty, supplierIndex } = params;
        const t = TIRES[tire];
        if (!t) return res.status(400).json({ error: 'Invalid tire type' });
        const sup = SUPPLIERS[supplierIndex];
        if (!sup) return res.status(400).json({ error: 'Invalid supplier' });
        if (qty < sup.min) return res.status(400).json({ error: `Minimum order is ${sup.min} tires` });
        const orderCost = qty * t.bMin * (1 - sup.disc);
        if (g.cash < orderCost) return res.status(400).json({ error: 'Not enough cash' });
        if (getInv(g) + qty > getCap(g)) return res.status(400).json({ error: 'Not enough storage' });
        g.cash -= orderCost;
        // Add to warehouse storage first, overflow to first location
        if (!g.warehouseInventory) g.warehouseInventory = {};
        const whInv = Object.values(g.warehouseInventory).reduce((a, b) => a + b, 0);
        const whCap = getStorageCap(g);
        const toWh = Math.min(qty, whCap - whInv);
        if (toWh > 0) g.warehouseInventory[tire] = (g.warehouseInventory[tire] || 0) + toWh;
        const overflow = qty - toWh;
        if (overflow > 0 && g.locations.length > 0) {
          const loc = g.locations.find(l => getLocInv(l) < getLocCap(l));
          if (loc) {
            if (!loc.inventory) loc.inventory = {};
            loc.inventory[tire] = (loc.inventory[tire] || 0) + overflow;
          }
        } else if (overflow > 0) {
          g.warehouseInventory[tire] = (g.warehouseInventory[tire] || 0) + overflow;
        }
        rebuildGlobalInv(g);
        g.monthlyPurchaseVol = (g.monthlyPurchaseVol || 0) + qty;
        // Track supplier relationship
        if (!g.supplierRelationships) g.supplierRelationships = {};
        const supKey = String(supplierIndex);
        if (!g.supplierRelationships[supKey]) g.supplierRelationships[supKey] = { totalPurchased: 0, level: 0 };
        g.supplierRelationships[supKey].totalPurchased += qty;
        const relTier = getSupplierRelTier(g.supplierRelationships[supKey].totalPurchased);
        g.supplierRelationships[supKey].level = relTier.level;
        // Relationship discount refund
        if (relTier.discBonus > 0) {
          const refund = Math.floor(qty * TIRES[tire].bMin * relTier.discBonus);
          g.cash += refund;
        }
        break;
      }

      case 'takeLoan': {
        const { index } = params;
        const loan = LOANS[index];
        if (!loan) return res.status(400).json({ error: 'Invalid loan' });
        if ((g.loans || []).length >= 3) return res.status(400).json({ error: 'Max 3 active loans' });
        if (loan.rr && g.reputation < loan.rr) return res.status(400).json({ error: 'Not enough reputation' });
        g.cash += loan.amt;
        g.loans.push({
          id: uid(),
          name: loan.n,
          amt: loan.amt,
          r: loan.r,
          remaining: loan.amt * (1 + loan.r),
          weeklyPayment: (loan.amt * (1 + loan.r)) / (loan.t * 4),
        });
        break;
      }

      case 'bankDeposit': {
        const depAmt = Math.floor(Number(params.amount));
        if (!depAmt || depAmt <= 0) return res.status(400).json({ error: 'Invalid amount' });
        if (g.cash < depAmt) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= depAmt;
        g.bankBalance = (g.bankBalance || 0) + depAmt;
        g.log.push(`Deposited $${depAmt.toLocaleString()} to savings`);
        break;
      }

      case 'bankWithdraw': {
        const wdAmt = Math.floor(Number(params.amount));
        if (!wdAmt || wdAmt <= 0) return res.status(400).json({ error: 'Invalid amount' });
        if ((g.bankBalance || 0) < wdAmt) return res.status(400).json({ error: 'Insufficient balance' });
        g.bankBalance -= wdAmt;
        g.cash += wdAmt;
        g.log.push(`Withdrew $${wdAmt.toLocaleString()} from savings`);
        break;
      }

      case 'tutorialAdvance': {
        g.tutorialStep = (g.tutorialStep || 0) + 1;
        break;
      }

      case 'tutorialDone': {
        g.tutorialDone = true;
        break;
      }

      case 'devBoost': {
        if (NODE_ENV === 'production' && (!process.env.ADMIN_KEY || params.adminKey !== process.env.ADMIN_KEY)) {
          return res.status(403).json({ error: 'Not available' });
        }
        if (params.cash != null) g.cash = Number(params.cash);
        if (params.reputation != null) g.reputation = Number(params.reputation);
        g.log.push(`[DEV] Set cash=${g.cash}, rep=${g.reputation}`);
        break;
      }

      case 'dismissVinnie': {
        const { id } = params;
        if (!id) return res.status(400).json({ error: 'Missing milestone id' });
        if (!g.vinnieSeen) g.vinnieSeen = [];
        if (!g.vinnieSeen.includes(id)) g.vinnieSeen.push(id);
        break;
      }

      case 'setAutoPrice': {
        const { tire, strategy, offset } = params;
        if (!TIRES[tire]) return res.status(400).json({ error: 'Invalid tire type' });
        const validStrategies = ['off', 'undercut', 'above', 'match', 'max'];
        if (!validStrategies.includes(strategy)) return res.status(400).json({ error: 'Invalid strategy' });
        if (!g.staff.pricingAnalyst || g.staff.pricingAnalyst <= 0) {
          return res.status(400).json({ error: 'Hire a Pricing Analyst first' });
        }
        if (!g.autoPrice) g.autoPrice = {};
        g.autoPrice[tire] = { strategy, offset: Math.max(0, Number(offset) || 0) };
        break;
      }

      case 'setServicePrice': {
        const { service, price } = params;
        if (!SERVICES[service]) return res.status(400).json({ error: 'Invalid service' });
        const svc = SERVICES[service];
        const clamped = Math.max(Math.round(svc.price * 0.5), Math.min(Math.round(svc.price * 3), Number(price)));
        if (!g.servicePrices) g.servicePrices = {};
        g.servicePrices[service] = clamped;
        break;
      }

      case 'transferTires': {
        const { from, to, tire, qty: txQty } = params;
        if (!TIRES[tire]) return res.status(400).json({ error: 'Invalid tire type' });
        const transferQty = Math.floor(Number(txQty));
        if (!transferQty || transferQty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
        if (!g.warehouseInventory) g.warehouseInventory = {};

        // Resolve source
        let srcInv;
        if (from === 'warehouse') {
          srcInv = g.warehouseInventory;
        } else {
          const srcLoc = g.locations.find(l => l.id === from);
          if (!srcLoc) return res.status(400).json({ error: 'Invalid source location' });
          if (!srcLoc.inventory) srcLoc.inventory = {};
          srcInv = srcLoc.inventory;
        }
        if ((srcInv[tire] || 0) < transferQty) return res.status(400).json({ error: 'Not enough tires at source' });

        // Resolve destination
        let dstInv, dstCap, dstUsed;
        if (to === 'warehouse') {
          dstInv = g.warehouseInventory;
          dstCap = getStorageCap(g);
          dstUsed = Object.values(g.warehouseInventory).reduce((a, b) => a + b, 0);
        } else {
          const dstLoc = g.locations.find(l => l.id === to);
          if (!dstLoc) return res.status(400).json({ error: 'Invalid destination location' });
          if (!dstLoc.inventory) dstLoc.inventory = {};
          dstInv = dstLoc.inventory;
          dstCap = getLocCap(dstLoc);
          dstUsed = getLocInv(dstLoc);
        }
        if (dstUsed + transferQty > dstCap) return res.status(400).json({ error: 'Not enough space at destination' });

        srcInv[tire] -= transferQty;
        dstInv[tire] = (dstInv[tire] || 0) + transferQty;
        rebuildGlobalInv(g);
        break;
      }

      case 'setDisposalFee': {
        const fee = Math.max(0, Math.min(15, Math.floor(Number(params.fee))));
        g.disposalFee = fee;
        break;
      }

      case 'resetGame': {
        // Production reset allowed for game owner
        const { init: initFn } = await import('../engine/init.js');
        const game = await getGame();
        const globalDay = game?.day || game?.week || 1;

        // If player was publicly traded, crash their stock (bankruptcy restructuring)
        const oldTicker = g.stockExchange?.ticker;
        if (oldTicker && game?.economy?.exchange?.stocks?.[oldTicker]) {
          const stock = game.economy.exchange.stocks[oldTicker];
          const crashPrice = Math.max(0.01, +(stock.price * 0.05).toFixed(2)); // 95% crash
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

          // Track bankruptcy in exchange state for sentiment impact
          const exchange = game.economy.exchange;
          if (exchange) {
            if (!exchange.bankruptcies) exchange.bankruptcies = [];
            exchange.bankruptcies.push({
              ticker: oldTicker,
              companyName: g.companyName || 'Unknown',
              day: globalDay,
              preCrashPrice: stock.price / 0.05, // approximate pre-crash
            });
            // Keep last 50
            if (exchange.bankruptcies.length > 50) exchange.bankruptcies = exchange.bankruptcies.slice(-50);
            // Immediate sentiment hit
            if (exchange.sentiment) {
              exchange.sentiment.value = Math.max(0.5, (exchange.sentiment.value || 1) - 0.15);
            }
          }

          await saveGame('default', globalDay, game.economy, game.ai_shops || [], game.liquidation || []);
        }

        // Preserve identity
        const savedName = g.name || 'Player';
        const savedCompanyName = g.companyName || '';
        const savedId = g.id || req.playerId;

        const fresh = initFn(savedName, globalDay);
        fresh.id = savedId;
        fresh.companyName = savedCompanyName;

        // Keep brokerage + ticker (stock still exists, just crashed)
        if (oldTicker) {
          fresh.stockExchange = {
            hasBrokerage: true,
            brokerageOpenedDay: g.stockExchange.brokerageOpenedDay,
            portfolio: {},
            openOrders: [],
            tradeHistory: [],
            isPublic: true,
            ipoDay: g.stockExchange.ipoDay,
            ticker: oldTicker,
            dividendPayoutRatio: 0.25,
            founderSharesLocked: g.stockExchange.founderSharesLocked || 0,
            shortPositions: {},
            marginEnabled: false, marginDebt: 0, marginCallDay: null,
            darkPoolAccess: false, advancedCharting: false,
            shortSellingEnabled: false, ipoPriority: false, realTimeAlerts: false,
            priceAlerts: [], dividendIncome: 0, capitalGains: 0, taxesPaid: 0,
            brokerageFeePaid: 0, wealthTaxPaid: 0,
          };
          // Founder still holds shares (locked)
          fresh.stockExchange.portfolio[oldTicker] = {
            qty: g.stockExchange.founderSharesLocked || 0,
            avgCost: 0.01,
            acquiredDay: globalDay,
          };
        }

        g = fresh;
        break;
      }

      case 'hireMarketplaceSpecialist': {
        if (g.marketplaceSpecialist) return res.status(400).json({ error: 'Already hired' });
        if (g.reputation < 5) return res.status(400).json({ error: 'Need reputation 5+' });
        if ((g.locations || []).length < 1) return res.status(400).json({ error: 'Need at least 1 location' });
        g.marketplaceSpecialist = true;
        g.log.push('Hired Marketplace Specialist ($3,500/mo)');
        break;
      }

      case 'fireMarketplaceSpecialist': {
        if (!g.marketplaceSpecialist) return res.status(400).json({ error: 'No specialist to fire' });
        g.marketplaceSpecialist = false;
        g.log.push('Fired Marketplace Specialist');
        break;
      }

      case 'setAutoSource': {
        const { sourceId } = params;
        if (sourceId && !SOURCES[sourceId]) return res.status(400).json({ error: 'Invalid source' });
        g.autoSource = sourceId || null;
        break;
      }

      case 'inspectSource': {
        const { sourceId } = params;
        const src = SOURCES[sourceId];
        if (!src) return res.status(400).json({ error: 'Invalid source' });
        if (g.cash < src.c) return res.status(400).json({ error: 'Not enough cash' });
        if (src.rr && g.reputation < src.rr) return res.status(400).json({ error: 'Not enough reputation' });
        // Day-of-week check for flea market
        if (sourceId === 'fleaMarket') {
          const cal = getCalendar(g.day || 1);
          if (cal.dayOfWeek !== 0 && cal.dayOfWeek !== 5 && cal.dayOfWeek !== 6)
            return res.status(400).json({ error: 'Flea market is closed today' });
        }
        const rawQty = R(src.min, src.max);
        const weights = (INSPECTION.sourceGradeWeights && INSPECTION.sourceGradeWeights[sourceId]) || { used_junk: .25, used_poor: .25, used_good: .25, used_premium: .25 };
        const tires = [];
        for (let i = 0; i < rawQty; i++) {
          // Weighted pick
          const r = Math.random();
          let cum = 0;
          let grade = 'used_junk';
          for (const [g2, w] of Object.entries(weights)) {
            cum += w;
            if (r <= cum) { grade = g2; break; }
          }
          const conditions = (INSPECTION.conditions && INSPECTION.conditions[grade]) || [{ label: 'Standard', valueMult: 1.0 }];
          const cond = conditions[Math.floor(Math.random() * conditions.length)];
          tires.push({ grade, condition: cond.label, valueMult: cond.valueMult });
        }
        g.pendingLot = { sourceId, tires, cost: src.c };
        break;
      }

      case 'buyFromLot': {
        if (!g.pendingLot) return res.status(400).json({ error: 'No lot to buy from' });
        const { indices } = params;
        const lot = g.pendingLot;
        const selected = indices === 'all' ? lot.tires : (indices || []).map(i => lot.tires[i]).filter(Boolean);
        if (selected.length === 0) return res.status(400).json({ error: 'Select at least one tire' });
        if (g.cash < lot.cost) return res.status(400).json({ error: 'Not enough cash' });
        const freeSpace = getCap(g) - getInv(g);
        if (freeSpace < selected.length) return res.status(400).json({ error: 'Not enough space' });
        const toAdd = Math.min(selected.length, freeSpace);
        g.cash -= lot.cost;
        for (let i = 0; i < toAdd; i++) {
          const t = selected[i];
          g.warehouseInventory = g.warehouseInventory || {};
          g.warehouseInventory[t.grade] = (g.warehouseInventory[t.grade] || 0) + 1;
        }
        rebuildGlobalInv(g);
        g.pendingLot = null;
        break;
      }

      case 'dismissLot': {
        g.pendingLot = null;
        break;
      }

      case 'setMarketing': {
        const { locationId, tier } = params;
        const loc = g.locations.find(l => l.id === locationId);
        if (!loc) return res.status(400).json({ error: 'Invalid location' });
        if (tier && !MARKETING[tier]) return res.status(400).json({ error: 'Invalid marketing tier' });
        loc.marketing = tier || null;
        break;
      }

      case 'setInsurance': {
        const { tier } = params;
        if (tier && !INSURANCE[tier]) return res.status(400).json({ error: 'Invalid insurance tier' });
        g.insurance = tier || null;
        break;
      }

      case 'retreadTires': {
        const { tire, qty } = params;
        if (!RETREADING.costPerTire[tire]) return res.status(400).json({ error: 'Can only retread used_junk or used_poor' });
        if (g.reputation < RETREADING.minRep) return res.status(400).json({ error: `Need reputation ${RETREADING.minRep}+` });
        if ((g.staff?.techs || 0) < RETREADING.minTechs) return res.status(400).json({ error: 'Need at least 1 tech' });
        const retreadQty = Math.max(1, Math.floor(Number(qty) || 0));
        const currentQueue = (g.retreadQueue || []).length;
        if (currentQueue + retreadQty > RETREADING.maxQueueSize) {
          return res.status(400).json({ error: `Max ${RETREADING.maxQueueSize} in queue (${currentQueue} already)` });
        }
        const totalStock = (g.warehouseInventory?.[tire] || 0) +
          (g.locations || []).reduce((a, l) => a + (l.inventory?.[tire] || 0), 0);
        if (totalStock < retreadQty) return res.status(400).json({ error: 'Not enough tires' });
        const cost = retreadQty * RETREADING.costPerTire[tire];
        if (g.cash < cost) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= cost;
        let remaining = retreadQty;
        g.warehouseInventory = g.warehouseInventory || {};
        if ((g.warehouseInventory[tire] || 0) > 0) {
          const take = Math.min(g.warehouseInventory[tire], remaining);
          g.warehouseInventory[tire] -= take;
          remaining -= take;
        }
        for (const loc of (g.locations || [])) {
          if (remaining <= 0) break;
          if (!loc.inventory?.[tire]) continue;
          const take = Math.min(loc.inventory[tire], remaining);
          loc.inventory[tire] -= take;
          remaining -= take;
        }
        rebuildGlobalInv(g);
        if (!g.retreadQueue) g.retreadQueue = [];
        for (let i = 0; i < retreadQty; i++) {
          g.retreadQueue.push({ tire, startDay: g.day, completionDay: g.day + RETREADING.processDays });
        }
        break;
      }

      case 'importOrder': {
        const { mfgId: rawMfgId, tire: rawTire, type: rawType, qty: rawQty } = params;
        const tire = rawTire || rawType;
        // Auto-pick manufacturer if not provided
        let mfgId = rawMfgId;
        if (!mfgId) {
          const unlocked = (g.unlockedMfgs || []);
          if (unlocked.length > 0) {
            const cheapest = unlocked
              .map(id => MANUFACTURERS.find(m => m.id === id))
              .filter(Boolean)
              .sort((a, b) => (a.freight || 0) - (b.freight || 0));
            mfgId = cheapest.length > 0 ? cheapest[0].id : 'apex_domestic';
          } else {
            mfgId = 'apex_domestic';
          }
        }
        const mfg = MANUFACTURERS.find(m => m.id === mfgId);
        if (!mfg) return res.status(400).json({ error: 'Invalid manufacturer' });
        if (!(g.unlockedMfgs || []).includes(mfgId)) return res.status(400).json({ error: 'Manufacturer not unlocked' });
        const t = TIRES[tire];
        if (!t) return res.status(400).json({ error: 'Invalid tire' });
        const orderQty = Math.min(Math.max(1, Math.floor(Number(rawQty) || 0)), mfg.containerQty || 500);
        const tireCost = orderQty * t.bMin * (1 - (mfg.disc || 0));
        const freight = mfg.freight || 0;
        const totalCost = tireCost + freight;
        if (g.cash < totalCost) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= totalCost;
        const leadDays = (mfg.leadWeeks || 4) * 7;
        if (!g.pendingImports) g.pendingImports = [];
        g.pendingImports.push({ mfgId, tire, qty: orderQty, orderDay: g.day, arrivalDay: g.day + leadDays, cost: totalCost });
        break;
      }

      case 'exportTires': {
        const { tire, qty: rawQty } = params;
        const t = TIRES[tire];
        if (!t) return res.status(400).json({ error: 'Invalid tire' });
        const exportQty = Math.max(1, Math.floor(Number(rawQty) || 0));
        const totalStock = (g.warehouseInventory?.[tire] || 0) +
          (g.locations || []).reduce((a, l) => a + (l.inventory?.[tire] || 0), 0);
        if (totalStock < exportQty) return res.status(400).json({ error: 'Not enough tires' });
        // Pull from warehouse first
        let rem = exportQty;
        g.warehouseInventory = g.warehouseInventory || {};
        if ((g.warehouseInventory[tire] || 0) > 0) {
          const take = Math.min(g.warehouseInventory[tire], rem);
          g.warehouseInventory[tire] -= take;
          rem -= take;
        }
        for (const loc of (g.locations || [])) {
          if (rem <= 0) break;
          if (!loc.inventory?.[tire]) continue;
          const take = Math.min(loc.inventory[tire], rem);
          loc.inventory[tire] -= take;
          rem -= take;
        }
        rebuildGlobalInv(g);
        const revenue = exportQty * Math.round(t.def * 0.85);
        g.cash += revenue;
        break;
      }

      case 'unlockFranchise': {
        if (g.hasFranchise) return res.status(400).json({ error: 'Already unlocked' });
        if ((g.locations || []).length < FRANCHISE.minLocations) return res.status(400).json({ error: `Need ${FRANCHISE.minLocations}+ locations` });
        if (g.reputation < FRANCHISE.minRep) return res.status(400).json({ error: `Need reputation ${FRANCHISE.minRep}+` });
        if (g.cash < FRANCHISE.unlockCost) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= FRANCHISE.unlockCost;
        g.hasFranchise = true;
        g.franchiseTemplates = [];
        break;
      }

      case 'createFranchiseTemplate': {
        if (!g.hasFranchise) return res.status(400).json({ error: 'Franchise not unlocked' });
        const { name, sourceLocationId } = params;
        const srcLoc = (g.locations || []).find(l => l.id === sourceLocationId);
        if (!srcLoc) return res.status(400).json({ error: 'Invalid source location' });
        if ((g.franchiseTemplates || []).length >= FRANCHISE.templateMaxCount) {
          return res.status(400).json({ error: 'Max templates reached' });
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
        if (!g.hasFranchise) return res.status(400).json({ error: 'Franchise not unlocked' });
        const { cityId, templateId } = params;
        const city = CITIES.find(c => c.id === cityId);
        if (!city) return res.status(400).json({ error: 'Invalid city' });
        const template = (g.franchiseTemplates || []).find(t2 => t2.id === templateId);
        if (!template) return res.status(400).json({ error: 'Invalid template' });
        const shopCostBase = 137500 * (city.cost || 1);
        const totalCost = shopCostBase + FRANCHISE.franchiseFee;
        if (g.cash < totalCost) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= totalCost;
        g.locations.push({
          cityId, id: uid(), locStorage: 0, inventory: {},
          loyalty: 0, marketing: template.marketing,
          isFranchise: true, templateId: template.id, openedDay: g.day,
        });
        break;
      }

      case 'buildFactory': {
        if (g.hasFactory) return res.status(400).json({ error: 'Already have a factory' });
        if (g.reputation < FACTORY.minRep) return res.status(400).json({ error: `Need reputation ${FACTORY.minRep}+` });
        if ((g.locations || []).length < FACTORY.minLocations) return res.status(400).json({ error: `Need ${FACTORY.minLocations}+ locations` });
        if (g.cash < FACTORY.buildCost) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= FACTORY.buildCost;
        g.hasFactory = true;
        g.factory = {
          level: 1,
          brandName: (g.companyName || 'My') + ' Tires',
          productionQueue: [],
          dailyCapacity: 50,
          qualityRating: 0.80,
          brandReputation: 0,
          rawMaterials: { rubber: 1.0, steel: 1.0, chemicals: 1.0 },
          staff: { lineWorkers: 0, inspectors: 0, engineers: 0, manager: 0 },
          currentLine: null,
          switchCooldown: 0,
          isDistributor: false,
          discountTiers: [...FACTORY_DISCOUNT_TIERS_DEFAULT],
          wholesalePrices: {},
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
          rubberFarm: null,    // { level: 1, purchasedDay }
          syntheticLab: null,  // { level: 1, purchasedDay }
          rubberSupply: 0,     // accumulated rubber units
        };
        break;
      }

      case 'produceFactoryTires': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { tire, qty: rawQty2 } = params;
        // Allow standard producible types and exclusive unlocked types
        const isExclusive = tire.startsWith('brand_') && (g.factory.unlockedSpecials || []).includes(tire);
        const baseCostKey = isExclusive ? null : tire;
        if (!isExclusive && !FACTORY.productionCost[tire]) return res.status(400).json({ error: 'Cannot manufacture this tire type' });
        const prodQty = Math.max(1, Math.floor(Number(rawQty2) || 0));
        // Calculate effective cost with raw materials
        const unitCost = isExclusive
          ? (EXCLUSIVE_TIRES[tire]?.baseCost || 80)
          : getEffectiveProductionCost(g.factory, tire);
        const cost = prodQty * unitCost;
        if (g.cash < cost) return res.status(400).json({ error: 'Not enough cash' });
        const currentQueue = (g.factory.productionQueue || []).reduce((a, q) => a + q.qty, 0);
        if (currentQueue + prodQty > g.factory.dailyCapacity * 7) {
          return res.status(400).json({ error: 'Production queue full' });
        }
        // Line switching cooldown
        let switchDelay = 0;
        if (g.factory.currentLine && g.factory.currentLine !== tire) {
          switchDelay = LINE_SWITCH_DAYS;
        }
        g.factory.currentLine = tire;
        g.cash -= cost;
        if (!g.factory.productionQueue) g.factory.productionQueue = [];
        const storeKey = tire.startsWith('brand_') ? tire : getBrandTireKey(tire);
        g.factory.productionQueue.push({
          tire: storeKey, qty: prodQty, startDay: g.day,
          completionDay: g.day + switchDelay + Math.ceil(prodQty / g.factory.dailyCapacity),
        });
        if (switchDelay > 0) {
          g.log = g.log || [];
          g.log.push({ msg: `Factory line switch: +${switchDelay} day cooldown`, cat: 'sale' });
        }
        break;
      }

      case 'repayLoan': {
        const { loanIndex, amount } = params;
        const loan = (g.loans || [])[loanIndex];
        if (!loan) return res.status(400).json({ error: 'Invalid loan' });
        const repayAmt = Math.min(Math.floor(Number(amount) || 0), loan.remaining, g.cash);
        if (repayAmt <= 0) return res.status(400).json({ error: 'Invalid amount' });
        g.cash -= repayAmt;
        loan.remaining -= repayAmt;
        if (loan.remaining <= 0) {
          g.reputation = Math.min(100, (g.reputation || 0) + 0.5);
          g.log.push(`Loan "${loan.name}" paid off early! +0.5 reputation`);
          g.loans = g.loans.filter((_, i) => i !== loanIndex);
        } else {
          g.log.push(`Paid $${repayAmt.toLocaleString()} extra on "${loan.name}" ($${Math.round(loan.remaining).toLocaleString()} remaining)`);
        }
        break;
      }

      case 'financeShop': {
        const { cityId } = params;
        const city = CITIES.find(c => c.id === cityId);
        if (!city) return res.status(400).json({ error: 'Invalid city' });
        const cost = shopCost(city);
        const downPayment = Math.ceil(cost * 0.20);
        if (g.cash < downPayment) return res.status(400).json({ error: `Need at least $${downPayment} (20% down)` });
        const check = canOpenInCity(g, cityId);
        if (!check.ok) return res.status(400).json({ error: check.reason });
        g.cash -= downPayment;
        g.locations.push({ cityId, id: uid(), locStorage: 0, inventory: {}, loyalty: 0, openedDay: g.day });
        // Create financing loan for remaining 80%
        const financed = cost - downPayment;
        const rate = 0.08;
        const totalOwed = financed * (1 + rate);
        if (!g.loans) g.loans = [];
        g.loans.push({
          id: uid(),
          name: `Shop Loan (${city.name})`,
          amt: financed,
          r: rate,
          remaining: totalOwed,
          weeklyPayment: totalOwed / (12 * 4), // 12 months
        });
        g.log.push(`Financed shop in ${city.name}: $${downPayment.toLocaleString()} down, $${financed.toLocaleString()} loan`);
        break;
      }

      case 'sellShop': {
        const { locationId } = params;
        const locIdx = g.locations.findIndex(l => l.id === locationId);
        if (locIdx === -1) return res.status(400).json({ error: 'Invalid location' });
        const loc = g.locations[locIdx];
        const city = CITIES.find(c => c.id === loc.cityId);
        const sellPrice = Math.round((city ? shopCost(city) : 120000) * 0.50);
        // Return inventory to warehouse
        if (!g.warehouseInventory) g.warehouseInventory = {};
        for (const [k, qty] of Object.entries(loc.inventory || {})) {
          if (qty > 0) g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + qty;
        }
        g.locations.splice(locIdx, 1);
        g.cash += sellPrice;
        rebuildGlobalInv(g);
        // Clean up marketplace listings and bids for this shop
        if (g.shopListings) g.shopListings = g.shopListings.filter(l => l.locationId !== locationId);
        if (g.shopBids) g.shopBids = g.shopBids.filter(b => b.locationId !== locationId);
        // Also remove from shared marketplace
        const sellSharedListings = await getShopSaleListings({ sellerId: req.playerId });
        const sellSharedListing = sellSharedListings.find(l => l.locationId === locationId);
        if (sellSharedListing) await removeShopSaleListing(sellSharedListing.id);
        g.log.push(`Sold shop in ${city?.name || 'unknown'} for $${sellPrice.toLocaleString()}`);
        break;
      }

      case 'vinnieBailout': {
        if (g.cash >= 0) return res.status(400).json({ error: 'You don\'t need a bailout' });
        if ((g.tireCoins || 0) < 10000) return res.status(400).json({ error: 'Need 10,000 TireCoins' });
        g.tireCoins -= 10000;
        const bailoutAmt = Math.abs(g.cash) + 5000; // cover debt + $5K buffer
        g.cash += bailoutAmt;
        g.log.push(`Vinnie bailed you out! +$${bailoutAmt.toLocaleString()} (cost: 10K TC)`);
        break;
      }

      case 'buyCosmetic': {
        const { cosmeticId } = params;
        const { MONET } = await import('../../shared/constants/monetization.js');
        const item = MONET?.cosmetics ? MONET.cosmetics.find(c => c.id === cosmeticId) : null;
        if (!item) return res.status(400).json({ error: 'Invalid cosmetic' });
        if ((g.tireCoins || 0) < item.cost) return res.status(400).json({ error: 'Not enough TireCoins' });
        if (!g.cosmetics) g.cosmetics = [];
        if (g.cosmetics.includes(cosmeticId)) return res.status(400).json({ error: 'Already owned' });
        g.tireCoins -= item.cost;
        g.cosmetics.push(cosmeticId);
        break;
      }

      case 'bidOnContract': {
        const { contractType } = params;
        const { GOV_TYPES } = await import('../../shared/constants/govTypes.js');
        const contract = GOV_TYPES ? GOV_TYPES.find(c => c.type === contractType) : null;
        if (!contract) return res.status(400).json({ error: 'Invalid contract' });
        if (g.reputation < (contract.minRep || 0)) return res.status(400).json({ error: `Need reputation ${contract.minRep}+` });
        if ((g.locations || []).length < (contract.minLocs || 1)) return res.status(400).json({ error: `Need ${contract.minLocs}+ locations` });
        if (!g.govContracts) g.govContracts = [];
        if (g.govContracts.length >= 3) return res.status(400).json({ error: 'Max 3 active contracts' });
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
        if (!market) return res.status(400).json({ error: 'Invalid flea market' });
        const transportCost = FLEA_TRANSPORT[market.transport] || 50;
        const totalFleaCost = FLEA_STAND_COST + transportCost;
        if (g.cash < totalFleaCost) return res.status(400).json({ error: `Need $${totalFleaCost}` });
        if (!g.fleaMarketStands) g.fleaMarketStands = [];
        if (g.fleaMarketStands.some(s => s.marketId === marketId)) {
          return res.status(400).json({ error: 'Already have a stand there' });
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
        if (idx === -1) return res.status(400).json({ error: 'Stand not found' });
        const removed = g.fleaMarketStands.splice(idx, 1)[0];
        g.log.push(`Closed flea stand at ${removed.name}`);
        break;
      }

      case 'attendCarMeet': {
        const { meetId } = params;
        const meet = CAR_MEETS.find(m => m.id === meetId);
        if (!meet) return res.status(400).json({ error: 'Invalid car meet' });
        const cal = getCalendar(g.day || 1);
        const dayOfYear = cal.dayOfYear;
        // Check summer: days 151-240
        if (dayOfYear < CAR_MEET_SUMMER_START || dayOfYear > CAR_MEET_SUMMER_END) {
          return res.status(400).json({ error: 'Car meets are only held in summer (June-August)' });
        }
        // Check weekend (0=Sunday, 5=Friday, 6=Saturday)
        if (cal.dayOfWeek !== 0 && cal.dayOfWeek !== 5 && cal.dayOfWeek !== 6) {
          return res.status(400).json({ error: 'Car meets are only on weekends' });
        }
        const transportCost = CAR_MEET_TRANSPORT[meet.transport] || 50;
        const totalCost = meet.fee + transportCost;
        if (g.cash < totalCost) return res.status(400).json({ error: `Need $${totalCost} (fee + transport)` });
        if (!g.carMeetAttendance) g.carMeetAttendance = [];
        // Check if already attending this meet today
        if (g.carMeetAttendance.some(a => a.meetId === meetId && a.day === g.day)) {
          return res.status(400).json({ error: 'Already attending this meet today' });
        }
        g.cash -= totalCost;
        g.carMeetAttendance.push({ meetId, day: g.day, cityId: meet.cityId, name: meet.name });
        g.carMeetsAttended = (g.carMeetsAttended || 0) + 1;
        g.log.push(`Attending ${meet.name} (-$${totalCost})`);
        break;
      }

      // ── Feature 1: Expandable Shop Storage ──
      case 'upgradeShopStorage': {
        const { locationId } = params;
        const loc = g.locations.find(l => l.id === locationId);
        if (!loc) return res.status(400).json({ error: 'Invalid location' });
        const upgrade = getNextUpgrade(loc);
        if (!upgrade) return res.status(400).json({ error: 'Storage already at max' });
        if (g.cash < upgrade.cost) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= upgrade.cost;
        loc.locStorage = upgrade.cumCap;
        g.log.push(`Upgraded storage: ${upgrade.ic} ${upgrade.n} (+${upgrade.add} capacity)`);
        break;
      }

      // ── Feature 2: Auto Supplier Orders ──
      case 'addAutoSupplier': {
        const { supplierIndex, tire, qty, threshold } = params;
        const sup = SUPPLIERS[supplierIndex];
        if (!sup) return res.status(400).json({ error: 'Invalid supplier' });
        if (!(g.unlockedSuppliers || []).includes(supplierIndex)) return res.status(400).json({ error: 'Supplier not unlocked' });
        const t = TIRES[tire];
        if (!t) return res.status(400).json({ error: 'Invalid tire type' });
        // Validate tire is valid for this supplier (ag check)
        if (sup.ag && !t.ag) return res.status(400).json({ error: 'This supplier only sells agricultural tires' });
        if (!sup.ag && t.ag) return res.status(400).json({ error: 'This supplier does not sell agricultural tires' });
        if (t.used) return res.status(400).json({ error: 'Cannot auto-order used tires from supplier' });
        const orderQty = Math.max(sup.min, Math.floor(Number(qty) || sup.min));
        const orderThreshold = Math.max(1, Math.floor(Number(threshold) || 50));
        if (!g.autoSuppliers) g.autoSuppliers = [];
        // Dedup by supplierIndex + tire
        g.autoSuppliers = g.autoSuppliers.filter(a => !(a.supplierIndex === supplierIndex && a.tire === tire));
        g.autoSuppliers.push({ supplierIndex, tire, qty: orderQty, threshold: orderThreshold });
        g.log.push(`Auto-order set: ${t.n} x${orderQty} from ${sup.n} when stock < ${orderThreshold}`);
        break;
      }

      case 'removeAutoSupplier': {
        const { supplierIndex, tire } = params;
        if (!g.autoSuppliers) { g.autoSuppliers = []; break; }
        g.autoSuppliers = g.autoSuppliers.filter(a => !(a.supplierIndex === supplierIndex && a.tire === tire));
        break;
      }

      // ── Feature 3: Shop Marketplace ──
      case 'listShopForSale': {
        const { locationId, askingPrice } = params;
        const loc = g.locations.find(l => l.id === locationId);
        if (!loc) return res.status(400).json({ error: 'Invalid location' });
        if (!g.shopListings) g.shopListings = [];
        if (g.shopListings.some(l => l.locationId === locationId)) return res.status(400).json({ error: 'Shop already listed' });
        const ownedDays = g.day - (loc.openedDay || 0);
        if (ownedDays < SHOP_BID.minOwnershipDays) {
          return res.status(400).json({ error: `Must own shop at least ${SHOP_BID.minOwnershipDays} days before listing (${SHOP_BID.minOwnershipDays - ownedDays} days left)` });
        }
        const city = CITIES.find(c => c.id === loc.cityId);
        const val = getShopValuation(loc, city);
        const price = Math.max(1, Math.floor(Number(askingPrice) || val.totalValue));
        g.shopListings.push({ locationId, askingPrice: price, listedDay: g.day });
        // Mirror to shared marketplace
        const invEntries = Object.entries(loc.inventory || {}).filter(([, q]) => q > 0);
        const monthlyRent = shopRent(city) * 4; // weekly rent * 4
        const locStaff = loc.staff || g.staff || {};
        const monthlyStaffCost = Object.entries(locStaff).reduce((a, [k, v]) => a + (PAY[k] || 0) * v, 0);
        const monthlyExpenses = monthlyRent + monthlyStaffCost;
        const monthlyRevenue = Math.round((loc.dailyStats?.rev || 0) * 30);
        await addShopSaleListing({
          id: uid(), sellerId: req.playerId,
          sellerName: g.companyName || g.name || 'Unknown',
          cityId: loc.cityId, cityName: city?.name || 'Unknown',
          state: city?.state || '', askingPrice: price, valuation: val,
          inventorySummary: { totalTires: invEntries.reduce((a, [, q]) => a + q, 0), tireTypes: invEntries.map(([k, q]) => `${TIRES[k]?.n || k} x${q}`) },
          loyalty: loc.loyalty || 0, dayRevenue: (loc.dailyStats?.rev) || 0,
          monthlyRevenue, monthlyRent, monthlyStaffCost, monthlyExpenses,
          listedDay: g.day, status: 'active', locationId,
          offers: [], messages: [],
        });
        g.log.push(`Listed shop in ${city?.name || 'unknown'} for sale at $${price.toLocaleString()}`);
        break;
      }

      case 'delistShop': {
        const { locationId } = params;
        if (!g.shopListings) g.shopListings = [];
        if (!g.shopListings.some(l => l.locationId === locationId)) return res.status(400).json({ error: 'Shop not listed' });
        g.shopListings = g.shopListings.filter(l => l.locationId !== locationId);
        if (!g.shopBids) g.shopBids = [];
        g.shopBids = g.shopBids.filter(b => b.locationId !== locationId);
        // Remove from shared marketplace
        const sharedListings = await getShopSaleListings({ sellerId: req.playerId });
        const sharedListing = sharedListings.find(l => l.locationId === locationId);
        if (sharedListing) await removeShopSaleListing(sharedListing.id);
        g.log.push('Delisted shop from marketplace');
        break;
      }

      case 'acceptShopBid': {
        const { bidId } = params;
        if (!g.shopBids) g.shopBids = [];
        const bid = g.shopBids.find(b => b.id === bidId);
        if (!bid) return res.status(400).json({ error: 'Bid not found' });
        const locIdx = g.locations.findIndex(l => l.id === bid.locationId);
        if (locIdx === -1) return res.status(400).json({ error: 'Location not found' });
        const loc = g.locations[locIdx];
        const city = CITIES.find(c => c.id === loc.cityId);

        // Payment handling by type
        if (bid.paymentType === 'cash') {
          g.cash += bid.bidPrice;
        } else if (bid.paymentType === 'installment') {
          const downPayment = Math.round(bid.bidPrice * bid.downPct);
          g.cash += downPayment;
          if (!g.shopInstallments) g.shopInstallments = [];
          const monthlyPayment = Math.round((bid.bidPrice - downPayment) / bid.months);
          g.shopInstallments.push({
            buyerName: bid.bidderName,
            monthlyPayment,
            remaining: bid.months,
            startDay: g.day,
          });
        } else if (bid.paymentType === 'revShare') {
          const upfront = Math.round(bid.bidPrice * SHOP_BID.revShareUpfront);
          g.cash += upfront;
          if (!g.shopRevenueShares) g.shopRevenueShares = [];
          const dailyRev = (loc.dailyStats && loc.dailyStats.rev) || 0;
          g.shopRevenueShares.push({
            buyerName: bid.bidderName,
            cityId: loc.cityId,
            monthlyEstimate: dailyRev * 30,
            revSharePct: bid.revSharePct,
            remaining: bid.revShareMonths,
            startDay: g.day,
          });
        }

        // Remove location (inventory goes with buyer)
        g.locations.splice(locIdx, 1);
        rebuildGlobalInv(g);

        // Clean up listing and all bids for this shop
        if (!g.shopListings) g.shopListings = [];
        g.shopListings = g.shopListings.filter(l => l.locationId !== bid.locationId);
        g.shopBids = g.shopBids.filter(b => b.locationId !== bid.locationId);

        const payDesc = bid.paymentType === 'cash' ? `$${bid.bidPrice.toLocaleString()} cash`
          : bid.paymentType === 'installment' ? `installment (${Math.round(bid.downPct * 100)}% down)`
          : `revenue share (${Math.round(bid.revSharePct * 100)}% for ${bid.revShareMonths}mo)`;
        g.log.push(`Sold shop in ${city?.name || 'unknown'} to ${bid.bidderName} — ${payDesc}`);
        break;
      }

      case 'rejectShopBid': {
        const { bidId } = params;
        if (!g.shopBids) g.shopBids = [];
        g.shopBids = g.shopBids.filter(b => b.id !== bidId);
        break;
      }

      case 'setPremium': {
        if (NODE_ENV === 'production') return res.status(403).json({ error: 'Use in-app purchase' });
        g.isPremium = true;
        g.premiumSince = g.day;
        if (!g.cosmetics) g.cosmetics = [];
        if (!g.cosmetics.includes('gold_name')) g.cosmetics.push('gold_name');
        g.log.push('[DEV] Premium membership activated');
        break;
      }

      case 'activatePremium': {
        // Production IAP activation — called after successful RevenueCat purchase
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
          return res.status(429).json({ error: 'Daily ad reward limit reached' });
        }
        g.adRewards.count += 1;
        const { MONET: monetAd } = await import('../../shared/constants/monetization.js');
        let adCap = monetAd.tcStorage.baseCap;
        if (g.isPremium) adCap += monetAd.tcStorage.premiumBonus;
        for (let i = 0; i < (g.tcStorageLevel || 0) && i < monetAd.tcStorage.upgrades.length; i++) adCap += monetAd.tcStorage.upgrades[i].addCap;
        g.tireCoins = Math.min((g.tireCoins || 0) + 50, adCap);
        g.log.push(`Earned 50 TC from watching an ad (${g.adRewards.count}/3 today)`);
        break;
      }

      case 'activateAutoRestock': {
        // One-time $0.99 IAP — unlocks auto-supplier system. Resets on game restart.
        g.hasAutoRestock = true;
        g.log.push('Auto-Restock unlocked! Set up automatic supplier orders.');
        break;
      }

      // ── CHAT BLOCKING ──
      case 'blockPlayer': {
        const { targetPlayerId, targetName } = params;
        if (!targetPlayerId) return res.status(400).json({ error: 'Missing targetPlayerId' });
        if (targetPlayerId === req.playerId) return res.status(400).json({ error: 'Cannot block yourself' });
        if (!g.blockedPlayers) g.blockedPlayers = [];
        if (!g.blockedPlayers.some(b => b.id === targetPlayerId)) {
          g.blockedPlayers.push({ id: targetPlayerId, name: targetName || 'Unknown' });
        }
        break;
      }

      case 'unblockPlayer': {
        const { targetPlayerId: unblockId } = params;
        if (!unblockId) return res.status(400).json({ error: 'Missing targetPlayerId' });
        g.blockedPlayers = (g.blockedPlayers || []).filter(b => b.id !== unblockId);
        break;
      }

      // ── NOTIFICATION PREFERENCES ──
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

      // ── E-COMMERCE UNLOCK & MANAGEMENT ──
      case 'unlockEcom': {
        if (g.hasEcom) return res.status(400).json({ error: 'Already unlocked' });
        const { ECOM_UNLOCK_COST, ECOM_MIN_REP, ECOM_MIN_STORAGE } = await import('../../shared/constants/ecommerce.js');
        if (g.reputation < ECOM_MIN_REP) return res.status(400).json({ error: `Need reputation ${ECOM_MIN_REP}+` });
        const totalCap = getCap(g);
        if (totalCap < ECOM_MIN_STORAGE) return res.status(400).json({ error: `Need ${ECOM_MIN_STORAGE}+ storage capacity` });
        if (g.cash < ECOM_UNLOCK_COST) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= ECOM_UNLOCK_COST;
        g.hasEcom = true;
        if (!g.ecomStaff) g.ecomStaff = {};
        if (!g.ecomUpgrades) g.ecomUpgrades = [];
        g.ecomTotalSpent = (g.ecomTotalSpent || 0) + ECOM_UNLOCK_COST;
        g.log.push('Launched online tire store!');
        break;
      }

      case 'hireEcomStaff': {
        const { role } = params;
        if (!g.hasEcom || !g.ecomStaff) return res.status(400).json({ error: 'Unlock e-commerce first' });
        const { ECOM_STAFF: ESTAFF } = await import('../../shared/constants/ecommerce.js');
        if (!ESTAFF[role]) return res.status(400).json({ error: 'Invalid role' });
        if (g.ecomStaff[role]) return res.status(400).json({ error: 'Already hired' });
        const staff = ESTAFF[role];
        if (staff.req) {
          for (const [req2, val] of Object.entries(staff.req)) {
            if (!g.ecomStaff[req2]) return res.status(400).json({ error: `Requires ${ESTAFF[req2]?.title || req2} first` });
          }
        }
        if (g.cash < staff.salary) return res.status(400).json({ error: 'Not enough cash for first month salary' });
        g.cash -= staff.salary;
        g.ecomStaff[role] = true;
        g.ecomTotalSpent = (g.ecomTotalSpent || 0) + staff.salary;
        break;
      }

      case 'fireEcomStaff': {
        const { role } = params;
        if (!g.ecomStaff || !g.ecomStaff[role]) return res.status(400).json({ error: 'Staff not hired' });
        g.ecomStaff[role] = false;
        break;
      }

      case 'buyEcomUpgrade': {
        const { upgradeId } = params;
        const { ECOM_UPGRADES: EUPG } = await import('../../shared/constants/ecommerce.js');
        if (!EUPG[upgradeId]) return res.status(400).json({ error: 'Invalid upgrade' });
        if ((g.ecomUpgrades || []).includes(upgradeId)) return res.status(400).json({ error: 'Already purchased' });
        const up = EUPG[upgradeId];
        if (up.req) {
          for (const [req2, val] of Object.entries(up.req)) {
            if (!g.ecomStaff?.[req2]) return res.status(400).json({ error: `Requires ${req2} first` });
          }
        }
        if (g.cash < up.cost) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= up.cost;
        if (!g.ecomUpgrades) g.ecomUpgrades = [];
        g.ecomUpgrades.push(upgradeId);
        g.ecomTotalSpent = (g.ecomTotalSpent || 0) + up.cost;
        break;
      }

      // ── WHOLESALE UNLOCK & MANAGEMENT ──
      case 'unlockWholesale': {
        if (g.hasWholesale) return res.status(400).json({ error: 'Already unlocked' });
        const { WS_MIN_REP, WS_MIN_STORAGE } = await import('../../shared/constants/wholesale.js');
        if (g.reputation < WS_MIN_REP) return res.status(400).json({ error: `Need reputation ${WS_MIN_REP}+` });
        const wsCap = getCap(g);
        if (wsCap < WS_MIN_STORAGE) return res.status(400).json({ error: `Need ${WS_MIN_STORAGE}+ storage capacity` });
        g.hasWholesale = true;
        if (!g.wsClients) g.wsClients = [];
        g.log.push('Opened wholesale distribution channel!');
        break;
      }

      case 'unlockDist': {
        if (g.hasDist) return res.status(400).json({ error: 'Already unlocked' });
        const { DIST_UNLOCK_COST, DIST_MIN_REP, DIST_MIN_LOCS } = await import('../../shared/constants/distribution.js');
        if (g.reputation < DIST_MIN_REP) return res.status(400).json({ error: `Need reputation ${DIST_MIN_REP}+` });
        if ((g.locations || []).length < DIST_MIN_LOCS) return res.status(400).json({ error: `Need ${DIST_MIN_LOCS}+ locations` });
        if (!g.hasWholesale) return res.status(400).json({ error: 'Need wholesale channel first' });
        if (g.cash < DIST_UNLOCK_COST) return res.status(400).json({ error: `Need $${fmt(DIST_UNLOCK_COST)}` });
        g.cash -= DIST_UNLOCK_COST;
        g.hasDist = true;
        g.distClients = g.distClients || [];
        g.log.push(`Distribution network unlocked! (-$${DIST_UNLOCK_COST.toLocaleString()})`);
        break;
      }

      // addWsClient removed — clients are auto-generated by simDay based on reputation

      // ── FACTORY BRAND SYSTEM ──
      case 'setFactoryBrandName': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { brandName } = params;
        if (!brandName || brandName.length < 2) return res.status(400).json({ error: 'Brand name too short' });
        g.factory.brandName = brandName.slice(0, 40);
        break;
      }

      case 'hireFactoryStaff': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { role } = params;
        const factStaff = FACTORY.staff[role];
        if (!factStaff) return res.status(400).json({ error: 'Invalid factory staff role' });
        if (!g.factory.staff) g.factory.staff = { lineWorkers: 0, inspectors: 0, engineers: 0, manager: 0 };
        if (role === 'manager' && g.factory.staff.manager >= (factStaff.max || 1)) {
          return res.status(400).json({ error: 'Max 1 factory manager' });
        }
        if (g.cash < factStaff.salary) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= factStaff.salary;
        g.factory.staff[role] = (g.factory.staff[role] || 0) + 1;
        break;
      }

      case 'fireFactoryStaff': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { role } = params;
        if (!g.factory.staff || !g.factory.staff[role] || g.factory.staff[role] <= 0) {
          return res.status(400).json({ error: 'No staff to fire' });
        }
        g.factory.staff[role]--;
        break;
      }

      case 'setFactoryWholesalePrice': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { tire, price: fwPrice } = params;
        if (!FACTORY.productionCost[tire]) return res.status(400).json({ error: 'Invalid factory tire type' });
        if (!g.factory.wholesalePrices) g.factory.wholesalePrices = {};
        g.factory.wholesalePrices[tire] = Math.max(1, Math.floor(Number(fwPrice) || 0));
        break;
      }

      case 'setFactoryMinOrder': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { tire, minQty } = params;
        if (!FACTORY.productionCost[tire]) return res.status(400).json({ error: 'Invalid factory tire type' });
        if (!g.factory.minOrders) g.factory.minOrders = {};
        g.factory.minOrders[tire] = Math.max(1, Math.floor(Number(minQty) || 10));
        break;
      }

      case 'upgradeFactory': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const currentLevel = g.factory.level || 1;
        const nextLevel = FACTORY.levels.find(l => l.level === currentLevel + 1);
        if (!nextLevel) return res.status(400).json({ error: 'Already at max level' });
        if (g.cash < nextLevel.upgradeCost) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= nextLevel.upgradeCost;
        g.factory.level = nextLevel.level;
        g.factory.dailyCapacity = nextLevel.dailyCapacity;
        g.log.push(`Factory upgraded to ${nextLevel.name}!`);
        break;
      }

      case 'listFactoryForSale': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { askingPrice: factAskPrice } = params;
        g.factoryListing = {
          askingPrice: Math.max(1, Math.floor(Number(factAskPrice) || FACTORY.factoryValue[g.factory.level] || 5000000)),
          listedDay: g.day,
        };
        g.log.push(`Listed factory for sale at $${g.factoryListing.askingPrice.toLocaleString()}`);
        break;
      }

      case 'delistFactory': {
        g.factoryListing = null;
        g.log.push('Delisted factory from sale');
        break;
      }

      case 'buyFactory': {
        const { sellerId } = params;
        if (!sellerId) return res.status(400).json({ error: 'Missing seller' });
        if (g.hasFactory) return res.status(400).json({ error: 'You already own a factory' });
        const seller = await getPlayer(sellerId);
        if (!seller) return res.status(404).json({ error: 'Seller not found' });
        const sg = seller.game_state;
        if (!sg.factoryListing || !sg.hasFactory) return res.status(400).json({ error: 'Factory not for sale' });
        const price = sg.factoryListing.askingPrice;
        if (g.cash < price) return res.status(400).json({ error: `Need $${price.toLocaleString()}` });
        // Transfer factory
        g.cash -= price;
        g.hasFactory = true;
        g.factory = { ...sg.factory };
        g.factory.customerList = [];
        g.factory.orderHistory = [];
        g.factoryListing = null;
        g.log.push(`Purchased ${sg.factory.brandName || 'factory'} from ${sg.companyName} for $${price.toLocaleString()}!`);
        // Remove factory from seller
        sg.cash += price;
        sg.hasFactory = false;
        sg.factory = null;
        sg.factoryListing = null;
        sg.log = sg.log || [];
        sg.log.push(`Factory sold to ${g.companyName} for $${price.toLocaleString()}!`);
        await savePlayerState(sellerId, sg);
        break;
      }

      // ── FACTORY DISTRIBUTION ──
      case 'enableFactoryDistribution': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        if (!g.hasDist) return res.status(400).json({ error: 'Need distribution network' });
        if (g.factory.isDistributor) return res.status(400).json({ error: 'Already a distributor' });
        const distCost = 250000;
        if (g.cash < distCost) return res.status(400).json({ error: 'Not enough cash ($250K)' });
        g.cash -= distCost;
        g.factory.isDistributor = true;
        g.log = g.log || [];
        g.log.push('Factory distribution network enabled! Other players can now buy from you.');
        break;
      }

      case 'setFactoryMAP': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { tire: mapTire, price: mapPrice } = params;
        if (!FACTORY.productionCost[mapTire]) return res.status(400).json({ error: 'Invalid factory tire type' });
        const minMAP = FACTORY.productionCost[mapTire];
        if (Number(mapPrice) < minMAP) return res.status(400).json({ error: `MAP must be >= production cost ($${minMAP})` });
        if (!g.factory.mapPrices) g.factory.mapPrices = {};
        g.factory.mapPrices[mapTire] = Math.max(minMAP, Math.floor(Number(mapPrice) || 0));
        break;
      }

      case 'setFactoryDiscountTier': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { tiers } = params;
        if (!Array.isArray(tiers) || tiers.length > 5) return res.status(400).json({ error: 'Max 5 tiers' });
        for (const t of tiers) {
          if (typeof t.min !== 'number' || typeof t.disc !== 'number' || !t.label) {
            return res.status(400).json({ error: 'Each tier needs min, disc, label' });
          }
          if (t.disc > 0.25) return res.status(400).json({ error: 'Max discount is 25%' });
        }
        g.factory.discountTiers = tiers.sort((a, b) => a.min - b.min);
        break;
      }

      // ── R&D LAB ──
      case 'startRDProject': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { projectId } = params;
        const rdDef = RD_PROJECTS.find(r => r.id === projectId);
        if (!rdDef) return res.status(400).json({ error: 'Invalid R&D project' });
        const fStaff2 = g.factory.staff || {};
        if ((fStaff2.engineers || 0) < 1) return res.status(400).json({ error: 'Need at least 1 engineer' });
        if (!g.factory.rdProjects) g.factory.rdProjects = [];
        if (g.factory.rdProjects.length >= 2) return res.status(400).json({ error: 'Max 2 concurrent R&D projects' });
        if (g.factory.rdProjects.some(p => p.id === projectId)) return res.status(400).json({ error: 'Project already in progress' });
        if ((g.factory.unlockedSpecials || []).includes(rdDef.unlocksExclusive)) {
          return res.status(400).json({ error: 'Already completed this project' });
        }
        if (g.cash < rdDef.cost) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= rdDef.cost;
        g.factory.rdProjects.push({ id: projectId, startDay: g.day, completionDay: g.day + rdDef.days });
        g.log = g.log || [];
        g.log.push(`Started R&D: ${rdDef.name} (${rdDef.days} days)`);
        break;
      }

      // ── CERTIFICATIONS ──
      case 'startCertification': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { certId } = params;
        const certDef = CERTIFICATIONS.find(c => c.id === certId);
        if (!certDef) return res.status(400).json({ error: 'Invalid certification' });
        if (!g.factory.certifications) g.factory.certifications = [];
        if (g.factory.certifications.some(c => c.id === certId)) return res.status(400).json({ error: 'Certification already in progress or earned' });
        if (certDef.qualityReq && (g.factory.qualityRating || 0) < certDef.qualityReq) {
          return res.status(400).json({ error: `Quality must be ${Math.round(certDef.qualityReq * 100)}%+` });
        }
        if (g.cash < certDef.cost) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= certDef.cost;
        g.factory.certifications.push({ id: certId, startDay: g.day, completionDay: g.day + certDef.days, earned: false });
        g.log = g.log || [];
        g.log.push(`Started certification: ${certDef.name} (${certDef.days} days)`);
        break;
      }

      // ── FACTORY CFO ──
      case 'hireFactoryCFO': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        if (g.factory.hasCFO) return res.status(400).json({ error: 'Already have a CFO' });
        if (g.cash < CFO_ROLE.salary) return res.status(400).json({ error: 'Not enough cash' });
        g.cash -= CFO_ROLE.salary;
        g.factory.hasCFO = true;
        g.log = g.log || [];
        g.log.push(`Hired CFO ($${CFO_ROLE.salary}/mo) — blocks 50% of Vinnie's schemes`);
        break;
      }

      case 'fireFactoryCFO': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        if (!g.factory.hasCFO) return res.status(400).json({ error: 'No CFO to fire' });
        g.factory.hasCFO = false;
        g.log = g.log || [];
        g.log.push('Fired factory CFO');
        break;
      }

      case 'instantRetread': {
        const { MONET: monetConsts } = await import('../../shared/constants/monetization.js');
        const pending = (g.retreadQueue || []).filter(r => g.day < r.completionDay);
        if (pending.length === 0) return res.status(400).json({ error: 'No pending retreads' });
        const tcCost = pending.length * (monetConsts.instantRetreadCost || 30);
        if ((g.tireCoins || 0) < tcCost) return res.status(400).json({ error: `Need ${tcCost} TC (you have ${g.tireCoins || 0})` });
        for (const r of pending) r.completionDay = g.day;
        g.tireCoins -= tcCost;
        g.log = g.log || [];
        g.log.push({ msg: `Instant retread: ${pending.length} tire${pending.length !== 1 ? 's' : ''} completed (${tcCost} TC)`, cat: 'event' });
        break;
      }

      case 'buyMarketIntel': {
        const { MONET: monetConsts2 } = await import('../../shared/constants/monetization.js');
        const intelCost = monetConsts2.marketIntelCost || 100;
        const intelDuration = monetConsts2.marketIntelDuration || 7;
        if ((g.tireCoins || 0) < intelCost) return res.status(400).json({ error: `Need ${intelCost} TC (you have ${g.tireCoins || 0})` });
        if (g.marketIntel && g.day < g.marketIntel.expiresDay) {
          return res.status(400).json({ error: `Intel still active (${g.marketIntel.expiresDay - g.day} days remaining)` });
        }
        g.marketIntel = { purchasedDay: g.day, expiresDay: g.day + intelDuration };
        g.tireCoins -= intelCost;
        g.log = g.log || [];
        g.log.push({ msg: `Market Intel purchased: ${intelDuration}-day city demand analysis (${intelCost} TC)`, cat: 'event' });
        break;
      }

      // ── TC STORAGE UPGRADE ──
      case 'upgradeTcStorage': {
        const { MONET: monetTcStore } = await import('../../shared/constants/monetization.js');
        const tcStore = monetTcStore.tcStorage;
        const currentLevel = g.tcStorageLevel || 0;
        const nextUpgrade = tcStore.upgrades.find(u => u.level === currentLevel + 1);
        if (!nextUpgrade) return res.status(400).json({ error: 'TC storage already at max level' });
        if ((g.tireCoins || 0) < nextUpgrade.tcCost) {
          return res.status(400).json({ error: `Need ${nextUpgrade.tcCost} TC (you have ${g.tireCoins || 0})` });
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

      // ── RAW MATERIAL SUPPLY CHAIN ──
      case 'buyRubberFarm': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        if (g.factory.rubberFarm) return res.status(400).json({ error: 'Already own a rubber farm' });
        if ((g.tireCoins || 0) < RUBBER_FARM.tcCost) return res.status(400).json({ error: `Need ${RUBBER_FARM.tcCost} TC (you have ${g.tireCoins || 0})` });
        g.tireCoins -= RUBBER_FARM.tcCost;
        g.factory.rubberFarm = { level: 1, purchasedDay: g.day };
        g.log = g.log || [];
        g.log.push({ msg: `\u{1F331} Purchased Rubber Farm (Level 1) for ${RUBBER_FARM.tcCost} TC`, cat: 'event' });
        break;
      }

      case 'upgradeRubberFarm': {
        if (!g.hasFactory || !g.factory?.rubberFarm) return res.status(400).json({ error: 'No rubber farm' });
        const currentFarmLevel = g.factory.rubberFarm.level;
        const nextFarmLevel = RUBBER_FARM.levels.find(l => l.level === currentFarmLevel + 1);
        if (!nextFarmLevel) return res.status(400).json({ error: 'Already at max level' });
        if ((g.tireCoins || 0) < nextFarmLevel.upgradeTcCost) return res.status(400).json({ error: `Need ${nextFarmLevel.upgradeTcCost} TC` });
        if (g.cash < nextFarmLevel.upgradeCashCost) return res.status(400).json({ error: `Need $${nextFarmLevel.upgradeCashCost.toLocaleString()} cash` });
        g.tireCoins -= nextFarmLevel.upgradeTcCost;
        g.cash -= nextFarmLevel.upgradeCashCost;
        g.factory.rubberFarm.level = nextFarmLevel.level;
        g.log = g.log || [];
        g.log.push({ msg: `\u{1F331} Rubber Farm upgraded to Level ${nextFarmLevel.level} (${nextFarmLevel.dailyOutput}/day)`, cat: 'event' });
        break;
      }

      case 'buySyntheticLab': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        if (g.factory.syntheticLab) return res.status(400).json({ error: 'Already own a synthetic lab' });
        if ((g.tireCoins || 0) < SYNTHETIC_LAB.tcCost) return res.status(400).json({ error: `Need ${SYNTHETIC_LAB.tcCost} TC (you have ${g.tireCoins || 0})` });
        if (g.cash < SYNTHETIC_LAB.cashCost) return res.status(400).json({ error: `Need $${SYNTHETIC_LAB.cashCost.toLocaleString()} cash` });
        g.tireCoins -= SYNTHETIC_LAB.tcCost;
        g.cash -= SYNTHETIC_LAB.cashCost;
        g.factory.syntheticLab = { level: 1, purchasedDay: g.day };
        g.log = g.log || [];
        g.log.push({ msg: `\u{1F9EA} Purchased Synthetic Lab (Level 1) for ${SYNTHETIC_LAB.tcCost} TC + $${SYNTHETIC_LAB.cashCost.toLocaleString()}`, cat: 'event' });
        break;
      }

      case 'upgradeSyntheticLab': {
        if (!g.hasFactory || !g.factory?.syntheticLab) return res.status(400).json({ error: 'No synthetic lab' });
        const currentLabLevel = g.factory.syntheticLab.level;
        const nextLabLevel = SYNTHETIC_LAB.levels.find(l => l.level === currentLabLevel + 1);
        if (!nextLabLevel) return res.status(400).json({ error: 'Already at max level' });
        if ((g.tireCoins || 0) < nextLabLevel.upgradeTcCost) return res.status(400).json({ error: `Need ${nextLabLevel.upgradeTcCost} TC` });
        if (g.cash < nextLabLevel.upgradeCashCost) return res.status(400).json({ error: `Need $${nextLabLevel.upgradeCashCost.toLocaleString()} cash` });
        g.tireCoins -= nextLabLevel.upgradeTcCost;
        g.cash -= nextLabLevel.upgradeCashCost;
        g.factory.syntheticLab.level = nextLabLevel.level;
        g.log = g.log || [];
        g.log.push({ msg: `\u{1F9EA} Synthetic Lab upgraded to Level ${nextLabLevel.level} (${nextLabLevel.dailyOutput}/day)`, cat: 'event' });
        break;
      }

      case 'sellRubberSurplus': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const supply = g.factory.rubberSupply || 0;
        if (supply <= 0) return res.status(400).json({ error: 'No rubber surplus to sell' });
        const rubberIdx = g.factory.rawMaterials?.rubber || 1.0;
        const pricePerUnit = Math.round(rubberIdx * 500);
        const revenue = supply * pricePerUnit;
        g.cash += revenue;
        g.factory.rubberSupply = 0;
        g.log = g.log || [];
        g.log.push({ msg: `Sold ${supply} rubber units for $${revenue.toLocaleString()} ($${pricePerUnit}/unit)`, cat: 'sale' });
        break;
      }

      case 'devSetState': {
        if (NODE_ENV === 'production' && (!process.env.ADMIN_KEY || params.adminKey !== process.env.ADMIN_KEY)) {
          return res.status(403).json({ error: 'Not available' });
        }
        if (params.cash != null) g.cash = Number(params.cash);
        if (params.reputation != null) g.reputation = Number(params.reputation);
        if (params.day != null) g.day = Number(params.day);
        if (params.tireCoins != null) g.tireCoins = Number(params.tireCoins);
        break;
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    await savePlayerState(req.playerId, g);
    res.json({ ok: true, state: g });
  } catch (err) {
    console.error('POST /api/action error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
