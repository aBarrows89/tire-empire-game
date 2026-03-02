import { Router } from 'express';
import { getPlayer, savePlayerState, getGame, addShopSaleListing, removeShopSaleListing, getShopSaleListings } from '../db/queries.js';
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
            // Overflow to first location with space
            const loc = g.locations.find(l => getLocInv(l) < getLocCap(l)) || g.locations[0];
            if (!loc.inventory) loc.inventory = {};
            loc.inventory[k] = (loc.inventory[k] || 0) + 1;
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
          const loc = g.locations.find(l => getLocInv(l) < getLocCap(l)) || g.locations[0];
          if (!loc.inventory) loc.inventory = {};
          loc.inventory[tire] = (loc.inventory[tire] || 0) + overflow;
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
        if (NODE_ENV === 'production') return res.status(403).json({ error: 'Not available' });
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
        if (NODE_ENV === 'production') return res.status(403).json({ error: 'Game reset not available in production' });
        const { init: initFn } = await import('../engine/init.js');
        const game = await getGame();
        const globalDay = game?.day || game?.week || 1;
        const fresh = initFn(g.name || 'Player', globalDay);
        fresh.id = g.id || req.playerId;
        fresh.companyName = g.companyName || '';
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
          level: 1, brandName: (g.companyName || 'My') + ' Tires',
          productionQueue: [], dailyCapacity: 50, qualityRating: 0.80, brandReputation: 0,
        };
        break;
      }

      case 'produceFactoryTires': {
        if (!g.hasFactory || !g.factory) return res.status(400).json({ error: 'No factory' });
        const { tire, qty: rawQty2 } = params;
        if (!FACTORY.productionCost[tire]) return res.status(400).json({ error: 'Cannot manufacture this tire type' });
        const prodQty = Math.max(1, Math.floor(Number(rawQty2) || 0));
        const cost = prodQty * FACTORY.productionCost[tire];
        if (g.cash < cost) return res.status(400).json({ error: 'Not enough cash' });
        const currentQueue = (g.factory.productionQueue || []).reduce((a, q) => a + q.qty, 0);
        if (currentQueue + prodQty > g.factory.dailyCapacity * 7) {
          return res.status(400).json({ error: 'Production queue full' });
        }
        g.cash -= cost;
        if (!g.factory.productionQueue) g.factory.productionQueue = [];
        g.factory.productionQueue.push({
          tire, qty: prodQty, startDay: g.day,
          completionDay: g.day + Math.ceil(prodQty / g.factory.dailyCapacity),
        });
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
        if (g.cash < FLEA_STAND_COST) return res.status(400).json({ error: `Need $${FLEA_STAND_COST}` });
        if (!g.fleaMarketStands) g.fleaMarketStands = [];
        if (g.fleaMarketStands.some(s => s.marketId === marketId)) {
          return res.status(400).json({ error: 'Already have a stand there' });
        }
        const transportCost = FLEA_TRANSPORT[market.transport] || 50;
        g.cash -= FLEA_STAND_COST + transportCost;
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

      case 'activateAutoRestock': {
        // One-time $0.99 IAP — unlocks auto-supplier system. Resets on game restart.
        g.hasAutoRestock = true;
        g.log.push('Auto-Restock unlocked! Set up automatic supplier orders.');
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

      case 'addWsClient': {
        if (!g.hasWholesale) return res.status(400).json({ error: 'Wholesale not unlocked' });
        const { name, preferredTire, minOrder, maxOrder } = params;
        if (!name) return res.status(400).json({ error: 'Client name required' });
        if (!TIRES[preferredTire]) return res.status(400).json({ error: 'Invalid tire type' });
        if (!g.wsClients) g.wsClients = [];
        g.wsClients.push({
          id: uid(),
          name,
          preferredTire,
          minOrder: Math.max(5, Math.floor(Number(minOrder) || 5)),
          maxOrder: Math.max(10, Math.floor(Number(maxOrder) || 20)),
          joinedDay: g.day,
        });
        break;
      }

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
        g.log.push(`Listed factory for sale at $${fmt(g.factoryListing.askingPrice)}`);
        break;
      }

      case 'delistFactory': {
        g.factoryListing = null;
        g.log.push('Delisted factory from sale');
        break;
      }

      case 'devSetState': {
        if (NODE_ENV === 'production') return res.status(403).json({ error: 'Not available' });
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
