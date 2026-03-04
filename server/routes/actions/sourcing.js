import { TIRES } from '../../../shared/constants/tires.js';
import { SOURCES } from '../../../shared/constants/sources.js';
import { SUPPLIERS } from '../../../shared/constants/suppliers.js';
import { RETREADING } from '../../../shared/constants/retreading.js';
import { INSPECTION } from '../../../shared/constants/inspection.js';
import { MANUFACTURERS } from '../../../shared/constants/manufacturers.js';
import { CONTRACT_TYPES } from '../../../shared/constants/contracts.js';
import { getCap, getInv, getLocInv, getLocCap, getStorageCap, rebuildGlobalInv, addA } from '../../../shared/helpers/inventory.js';
import { R } from '../../../shared/helpers/format.js';
import { getCalendar } from '../../../shared/helpers/calendar.js';
import { getSupplierRelTier } from '../../../shared/constants/supplierRelations.js';
import { uid } from '../../../shared/helpers/random.js';

export async function handleSourcing(action, params, g, ctx) {
  switch (action) {
    case 'buySource': {
      const { sourceId } = params;
      const src = SOURCES[sourceId];
      if (!src) return ctx.fail('Invalid source');
      if (src.days) {
        const cal = getCalendar(g.day || g.week || 1);
        if (!src.days.includes(cal.dayOfWeek)) return ctx.fail(`${src.n} is only open on certain days`);
      }
      if (g.cash < src.c) return ctx.fail('Not enough cash');
      if (src.rr && g.reputation < src.rr) return ctx.fail('Not enough reputation');
      const freeSpace = getCap(g) - getInv(g);
      if (freeSpace <= 0) return ctx.fail('No storage space');
      g.cash -= src.c;
      const rawQty = R(src.min, src.max);
      const qty = Math.min(rawQty, freeSpace);
      if (!g.warehouseInventory) g.warehouseInventory = {};
      const whFree = getStorageCap(g) - Object.values(g.warehouseInventory).reduce((a, b) => a + b, 0);
      const usedTypes = Object.keys(TIRES).filter(k => TIRES[k].used);
      let added = 0;
      for (let i = 0; i < qty; i++) {
        const k = usedTypes[R(0, usedTypes.length - 1)];
        if (added < whFree) {
          g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + 1;
        } else if (g.locations.length > 0) {
          const loc = g.locations.find(l => getLocInv(l) < getLocCap(l));
          if (loc) {
            if (!loc.inventory) loc.inventory = {};
            loc.inventory[k] = (loc.inventory[k] || 0) + 1;
          }
        } else {
          g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + 1;
        }
        added++;
      }
      rebuildGlobalInv(g);
      g.log.push(`Sourced ${qty} tires from ${src.n}${qty < rawQty ? ` (${rawQty - qty} didn't fit)` : ''}`);
      break;
    }

    case 'buySupplier': {
      const { index } = params;
      const sup = SUPPLIERS[index];
      if (!sup) return ctx.fail('Invalid supplier');
      if (g.cash < sup.c) return ctx.fail('Not enough cash');
      if (sup.rr && g.reputation < sup.rr) return ctx.fail('Not enough reputation');
      g.cash -= sup.c;
      g.unlockedSuppliers = addA(g.unlockedSuppliers || [], index);
      break;
    }

    case 'orderTires': {
      const { tire, qty, supplierIndex } = params;
      const t = TIRES[tire];
      if (!t) return ctx.fail('Invalid tire type');
      const sup = SUPPLIERS[supplierIndex];
      if (!sup) return ctx.fail('Invalid supplier');
      if (qty < sup.min) return ctx.fail(`Minimum order is ${sup.min} tires`);
      const contract = (g.supplierContracts || []).find(c => c.supplierIndex === supplierIndex && c.tire === tire && c.expiresDay > (g.day || 0));
      let priceMult = 1.0;
      if (contract) {
        priceMult = contract.lockedMult;
      } else {
        const gameData = await ctx.getGame();
        // Use per-supplier pricing if available, fall back to per-tire
        priceMult = gameData?.economy?.supplierPrices?.[supplierIndex]?.[tire]
          || gameData?.economy?.supplierPricing?.[tire] || 1.0;
      }
      const orderCost = Math.round(qty * t.bMin * priceMult * (1 - sup.disc));
      if (g.cash < orderCost) return ctx.fail('Not enough cash');
      if (getInv(g) + qty > getCap(g)) return ctx.fail('Not enough storage');
      g.cash -= orderCost;
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
      if (!g.supplierRelationships) g.supplierRelationships = {};
      const supKey = String(supplierIndex);
      if (!g.supplierRelationships[supKey]) g.supplierRelationships[supKey] = { totalPurchased: 0, level: 0 };
      g.supplierRelationships[supKey].totalPurchased += qty;
      const relTier = getSupplierRelTier(g.supplierRelationships[supKey].totalPurchased);
      g.supplierRelationships[supKey].level = relTier.level;
      if (relTier.discBonus > 0) {
        const refund = Math.floor(qty * TIRES[tire].bMin * relTier.discBonus);
        g.cash += refund;
      }
      break;
    }

    case 'signSupplierContract': {
      const { supplierIndex: scIdx, tire: scTire } = params;
      const scSup = SUPPLIERS[scIdx];
      if (!scSup) return ctx.fail('Invalid supplier');
      if (!TIRES[scTire]) return ctx.fail('Invalid tire type');
      const scRel = (g.supplierRelationships || {})[String(scIdx)];
      if (!scRel || scRel.level < 3) return ctx.fail('Requires Key Account status (level 3+) with this supplier');
      if (!g.supplierContracts) g.supplierContracts = [];
      const existing = g.supplierContracts.find(c => c.supplierIndex === scIdx && c.tire === scTire && c.expiresDay > (g.day || 0));
      if (existing) return ctx.fail('Contract already active for this tire with this supplier');
      const fee = Math.round(TIRES[scTire].bMin * 500 * 0.05);
      if (g.cash < fee) return ctx.fail(`Need ${R(fee)} to sign contract`);
      const gameData = await ctx.getGame();
      const currentMult = gameData?.economy?.supplierPricing?.[scTire] || 1.0;
      g.cash -= fee;
      g.supplierContracts.push({
        id: uid(), supplierIndex: scIdx, supplierName: scSup.n, tire: scTire,
        tireName: TIRES[scTire].n, lockedMult: currentMult,
        signedDay: g.day || 0, expiresDay: (g.day || 0) + 90, fee,
      });
      g.log.push({ msg: `Signed 90-day pricing contract with ${scSup.n} for ${TIRES[scTire].n} (locked at ${Math.round(currentMult * 100)}% market rate)`, cat: 'supplier' });
      break;
    }

    case 'setAutoSource': {
      const { sourceId } = params;
      if (sourceId && !SOURCES[sourceId]) return ctx.fail('Invalid source');
      g.autoSource = sourceId || null;
      break;
    }

    case 'inspectSource': {
      const { sourceId } = params;
      const src = SOURCES[sourceId];
      if (!src) return ctx.fail('Invalid source');
      if (g.cash < src.c) return ctx.fail('Not enough cash');
      if (src.rr && g.reputation < src.rr) return ctx.fail('Not enough reputation');
      if (sourceId === 'fleaMarket') {
        const cal = getCalendar(g.day || 1);
        if (cal.dayOfWeek !== 0 && cal.dayOfWeek !== 5 && cal.dayOfWeek !== 6)
          return ctx.fail('Flea market is closed today');
      }
      const rawQty = R(src.min, src.max);
      const weights = (INSPECTION.sourceGradeWeights && INSPECTION.sourceGradeWeights[sourceId]) || { used_junk: .25, used_poor: .25, used_good: .25, used_premium: .25 };
      const tires = [];
      for (let i = 0; i < rawQty; i++) {
        const r = Math.random();
        let cum = 0;
        let grade = 'used_junk';
        for (const [g2, w] of Object.entries(weights)) { cum += w; if (r <= cum) { grade = g2; break; } }
        const conditions = (INSPECTION.conditions && INSPECTION.conditions[grade]) || [{ label: 'Standard', valueMult: 1.0 }];
        const cond = conditions[Math.floor(Math.random() * conditions.length)];
        tires.push({ grade, condition: cond.label, valueMult: cond.valueMult });
      }
      g.pendingLot = { sourceId, tires, cost: src.c };
      break;
    }

    case 'buyFromLot': {
      if (!g.pendingLot) return ctx.fail('No lot to buy from');
      const { indices } = params;
      const lot = g.pendingLot;
      const selected = indices === 'all' ? lot.tires : (indices || []).map(i => lot.tires[i]).filter(Boolean);
      if (selected.length === 0) return ctx.fail('Select at least one tire');
      if (g.cash < lot.cost) return ctx.fail('Not enough cash');
      const freeSpace = getCap(g) - getInv(g);
      if (freeSpace < selected.length) return ctx.fail('Not enough space');
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

    case 'importOrder': {
      const { mfgId: rawMfgId, tire: rawTire, type: rawType, qty: rawQty } = params;
      const tire = rawTire || rawType;
      let mfgId = rawMfgId;
      if (!mfgId) {
        const unlocked = (g.unlockedMfgs || []);
        if (unlocked.length > 0) {
          const cheapest = unlocked.map(id => MANUFACTURERS.find(m => m.id === id)).filter(Boolean).sort((a, b) => (a.freight || 0) - (b.freight || 0));
          mfgId = cheapest.length > 0 ? cheapest[0].id : 'apex_domestic';
        } else { mfgId = 'apex_domestic'; }
      }
      const mfg = MANUFACTURERS.find(m => m.id === mfgId);
      if (!mfg) return ctx.fail('Invalid manufacturer');
      if (!(g.unlockedMfgs || []).includes(mfgId)) return ctx.fail('Manufacturer not unlocked');
      const t = TIRES[tire];
      if (!t) return ctx.fail('Invalid tire');
      const orderQty = Math.min(Math.max(1, Math.floor(Number(rawQty) || 0)), mfg.containerQty || 500);
      const tireCost = orderQty * t.bMin * (1 - (mfg.disc || 0));
      const freight = mfg.freight || 0;
      const totalCost = tireCost + freight;
      if (g.cash < totalCost) return ctx.fail('Not enough cash');
      g.cash -= totalCost;
      const leadDays = (mfg.leadWeeks || 4) * 7;
      if (!g.pendingImports) g.pendingImports = [];
      g.pendingImports.push({ mfgId, tire, qty: orderQty, orderDay: g.day, arrivalDay: g.day + leadDays, cost: totalCost });
      break;
    }

    case 'exportTires': {
      const { tire, qty: rawQty } = params;
      const t = TIRES[tire];
      if (!t) return ctx.fail('Invalid tire');
      const exportQty = Math.max(1, Math.floor(Number(rawQty) || 0));
      const totalStock = (g.warehouseInventory?.[tire] || 0) + (g.locations || []).reduce((a, l) => a + (l.inventory?.[tire] || 0), 0);
      if (totalStock < exportQty) return ctx.fail('Not enough tires');
      let rem = exportQty;
      g.warehouseInventory = g.warehouseInventory || {};
      if ((g.warehouseInventory[tire] || 0) > 0) { const take = Math.min(g.warehouseInventory[tire], rem); g.warehouseInventory[tire] -= take; rem -= take; }
      for (const loc of (g.locations || [])) { if (rem <= 0) break; if (!loc.inventory?.[tire]) continue; const take = Math.min(loc.inventory[tire], rem); loc.inventory[tire] -= take; rem -= take; }
      rebuildGlobalInv(g);
      const revenue = exportQty * Math.round(t.def * 0.85);
      g.cash += revenue;
      break;
    }

    case 'retreadTires': {
      const { tire, qty } = params;
      if (!RETREADING.costPerTire[tire]) return ctx.fail('Can only retread used_junk or used_poor');
      if (g.reputation < RETREADING.minRep) return ctx.fail(`Need reputation ${RETREADING.minRep}+`);
      if ((g.staff?.techs || 0) < RETREADING.minTechs) return ctx.fail('Need at least 1 tech');
      const retreadQty = Math.max(1, Math.floor(Number(qty) || 0));
      const currentQueue = (g.retreadQueue || []).length;
      if (currentQueue + retreadQty > RETREADING.maxQueueSize) return ctx.fail(`Max ${RETREADING.maxQueueSize} in queue (${currentQueue} already)`);
      const totalStock = (g.warehouseInventory?.[tire] || 0) + (g.locations || []).reduce((a, l) => a + (l.inventory?.[tire] || 0), 0);
      if (totalStock < retreadQty) return ctx.fail('Not enough tires');
      const cost = retreadQty * RETREADING.costPerTire[tire];
      if (g.cash < cost) return ctx.fail('Not enough cash');
      g.cash -= cost;
      let remaining = retreadQty;
      g.warehouseInventory = g.warehouseInventory || {};
      if ((g.warehouseInventory[tire] || 0) > 0) { const take = Math.min(g.warehouseInventory[tire], remaining); g.warehouseInventory[tire] -= take; remaining -= take; }
      for (const loc of (g.locations || [])) { if (remaining <= 0) break; if (!loc.inventory?.[tire]) continue; const take = Math.min(loc.inventory[tire], remaining); loc.inventory[tire] -= take; remaining -= take; }
      rebuildGlobalInv(g);
      if (!g.retreadQueue) g.retreadQueue = [];
      for (let i = 0; i < retreadQty; i++) g.retreadQueue.push({ tire, startDay: g.day, completionDay: g.day + RETREADING.processDays });
      break;
    }

    case 'addAutoSupplier': {
      const { supplierIndex, tire, qty, threshold } = params;
      const sup = SUPPLIERS[supplierIndex];
      if (!sup) return ctx.fail('Invalid supplier');
      if (!(g.unlockedSuppliers || []).includes(supplierIndex)) return ctx.fail('Supplier not unlocked');
      const t = TIRES[tire];
      if (!t) return ctx.fail('Invalid tire type');
      if (sup.ag && !t.ag) return ctx.fail('This supplier only sells agricultural tires');
      if (!sup.ag && t.ag) return ctx.fail('This supplier does not sell agricultural tires');
      if (t.used) return ctx.fail('Cannot auto-order used tires from supplier');
      const orderQty = Math.max(sup.min, Math.floor(Number(qty) || sup.min));
      const orderThreshold = Math.max(1, Math.floor(Number(threshold) || 50));
      if (!g.autoSuppliers) g.autoSuppliers = [];
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

    case 'acceptContract': {
      const { offerId } = params;
      if (!g.contractOffers) g.contractOffers = [];
      const offerIdx = g.contractOffers.findIndex(o => o.id === offerId);
      if (offerIdx === -1) return ctx.fail('Contract offer not found or expired');
      const offer = g.contractOffers[offerIdx];
      if (g.day >= offer.expiresDay) return ctx.fail('This offer has expired');
      if (g.cash < offer.upfrontCost) return ctx.fail(`Need $${offer.upfrontCost.toLocaleString()} to sign this contract`);

      g.cash -= offer.upfrontCost;
      if (!g.contracts) g.contracts = [];

      const contract = {
        id: uid(),
        type: offer.type,
        label: offer.label,
        supplierIndex: offer.supplierIndex,
        supplierName: offer.supplierName,
        tireType: offer.tireType,
        tireName: offer.tireName,
        pricePerTire: offer.pricePerTire,
        totalQuantity: offer.totalQuantity,
        deliveredQuantity: 0,
        deliveryMode: offer.deliveryMode,
        dailyAllotment: offer.dailyAllotment,
        startDay: g.day,
        expirationDay: g.day + offer.durationDays,
        deliveryStartDay: offer.deliveryLeadDays ? g.day + offer.deliveryLeadDays : g.day,
        status: 'active',
        upfrontCost: offer.upfrontCost,
        penaltyForDefault: offer.penaltyForDefault,
      };

      // Bulk delivery: deliver immediately
      if (offer.deliveryMode === 'bulk') {
        const space = Math.max(0, getCap(g) - getInv(g));
        const delivered = Math.min(offer.totalQuantity, space);
        if (delivered > 0) {
          g.warehouseInventory = g.warehouseInventory || {};
          g.warehouseInventory[offer.tireType] = (g.warehouseInventory[offer.tireType] || 0) + delivered;
          rebuildGlobalInv(g);
        }
        contract.deliveredQuantity = offer.totalQuantity;
        contract.status = 'completed';
        const lost = offer.totalQuantity - delivered;
        g.log.push({ msg: `📦 Contract fulfilled: ${delivered} ${offer.tireName}${lost > 0 ? ` (${lost} didn't fit — lost!)` : ''} from ${offer.supplierName}`, cat: 'supplier' });
      } else {
        g.log.push({ msg: `📋 Signed ${offer.label} with ${offer.supplierName}: ${offer.totalQuantity} ${offer.tireName} at $${offer.pricePerTire}/tire`, cat: 'supplier' });
      }

      g.contracts.push(contract);
      g.contractOffers.splice(offerIdx, 1);
      break;
    }

    case 'cancelContract': {
      const { contractId } = params;
      if (!g.contracts) return ctx.fail('No contracts');
      const ct = g.contracts.find(c => c.id === contractId && c.status === 'active');
      if (!ct) return ctx.fail('Active contract not found');

      // Calculate penalty
      const penalty = Math.round(ct.upfrontCost * (ct.penaltyForDefault || 0.15));
      if (g.cash < penalty) return ctx.fail(`Need $${penalty.toLocaleString()} to pay cancellation penalty`);

      g.cash -= penalty;
      ct.status = 'defaulted';

      // Damage supplier relationship by 1 tier worth of purchases
      const supKey = String(ct.supplierIndex);
      if (g.supplierRelationships?.[supKey]) {
        g.supplierRelationships[supKey].totalPurchased = Math.max(0, g.supplierRelationships[supKey].totalPurchased - 2000);
        const tier = getSupplierRelTier(g.supplierRelationships[supKey].totalPurchased);
        g.supplierRelationships[supKey].level = tier.level;
      }

      g.log.push({ msg: `❌ Cancelled contract with ${ct.supplierName} — $${penalty.toLocaleString()} penalty, reputation damaged`, cat: 'supplier' });
      break;
    }

    default: return null;
  }
  return g;
}
