import { Router } from 'express';
import { getPlayer, savePlayerState } from '../db/queries.js';
import { authMiddleware } from '../middleware/auth.js';
import { uid } from '../../shared/helpers/random.js';
import { getCap, getInv, getLocInv, getLocCap, getStorageCap, rebuildGlobalInv, addA } from '../../shared/helpers/inventory.js';
import { canOpenInCity } from '../../shared/helpers/market.js';
import { TIRES } from '../../shared/constants/tires.js';
import { STORAGE } from '../../shared/constants/storage.js';
import { SOURCES } from '../../shared/constants/sources.js';
import { SUPPLIERS } from '../../shared/constants/suppliers.js';
import { LOANS } from '../../shared/constants/loans.js';
import { SHOP_BASE, shopCost } from '../../shared/constants/shop.js';
import { CITIES } from '../../shared/constants/cities.js';
import { SERVICES } from '../../shared/constants/services.js';
import { R } from '../../shared/helpers/format.js';

const router = Router();

// POST /api/action — player actions
router.post('/', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    let g = { ...player.game_state };
    const { action, ...params } = req.body;

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

      case 'openShop': {
        const { cityId } = params;
        const city = CITIES.find(c => c.id === cityId);
        if (!city) return res.status(400).json({ error: 'Invalid city' });
        const cost = shopCost(city);
        if (g.cash < cost) return res.status(400).json({ error: 'Not enough cash' });
        const check = canOpenInCity(g, cityId);
        if (!check.ok) return res.status(400).json({ error: check.reason });
        g.cash -= cost;
        g.locations.push({ cityId, id: uid(), locStorage: 0, inventory: {} });
        break;
      }

      case 'hireStaff': {
        const { role } = params;
        if (g.staff[role] === undefined) return res.status(400).json({ error: 'Invalid role' });
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
        g.unlockedSuppliers = addA(g.unlockedSuppliers, index);
        break;
      }

      case 'orderTires': {
        const { tire, qty, supplierIndex } = params;
        const t = TIRES[tire];
        if (!t) return res.status(400).json({ error: 'Invalid tire type' });
        const sup = SUPPLIERS[supplierIndex];
        if (!sup) return res.status(400).json({ error: 'Invalid supplier' });
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
        const { init: initFn } = await import('../engine/init.js');
        const fresh = initFn(g.name || 'Player');
        fresh.id = g.id || req.playerId;
        // Preserve identity but reset everything else
        g = fresh;
        break;
      }

      case 'setAutoSource': {
        const { sourceId } = params;
        if (sourceId && !SOURCES[sourceId]) return res.status(400).json({ error: 'Invalid source' });
        g.autoSource = sourceId || null;
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
