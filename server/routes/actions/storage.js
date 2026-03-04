import { TIRES } from '../../../shared/constants/tires.js';
import { STORAGE } from '../../../shared/constants/storage.js';
import { getCap, getInv, getLocInv, getLocCap, getStorageCap, rebuildGlobalInv } from '../../../shared/helpers/inventory.js';
import { uid } from '../../../shared/helpers/random.js';

export function handleStorage(action, params, g, ctx) {
  switch (action) {
    case 'buyStorage': {
      const { type } = params;
      const st = STORAGE[type];
      if (!st) return ctx.fail('Invalid storage type');
      if (g.cash < st.c) return ctx.fail('Not enough cash');
      g.cash -= st.c;
      g.storage.push({ type, id: uid() });
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
      if (purchases >= TC_STORAGE_MAX) return ctx.fail(`Max ${TC_STORAGE_MAX} storage upgrades purchased`);
      if ((g.tireCoins || 0) < TC_STORAGE_COST) return ctx.fail(`Need ${TC_STORAGE_COST} TC (you have ${g.tireCoins || 0})`);
      g.tireCoins -= TC_STORAGE_COST;
      g.bonusStorage = currentBonus + TC_STORAGE_BONUS;
      g.log = g.log || [];
      g.log.push(`Purchased +${TC_STORAGE_BONUS} warehouse capacity for ${TC_STORAGE_COST} TC`);
      break;
    }

    case 'sellStorage': {
      const { storageId } = params;
      const idx = g.storage.findIndex(s => s.id === storageId);
      if (idx === -1) return ctx.fail('Storage unit not found');
      const unit = g.storage[idx];
      const st = STORAGE[unit.type];
      if (!st) return ctx.fail('Invalid storage type');
      const whInv = Object.values(g.warehouseInventory || {}).reduce((a, b) => a + b, 0);
      const remainingCap = getStorageCap(g) - st.cap;
      if (whInv > remainingCap) return ctx.fail(`Cannot sell: ${whInv} tires in warehouse but only ${remainingCap} capacity would remain. Move tires first.`);
      const sellPrice = Math.round(st.c * 0.5);
      g.cash += sellPrice;
      g.storage.splice(idx, 1);
      g.log.push(`Sold ${st.n} for $${sellPrice.toLocaleString()} (50% of cost)`);
      break;
    }

    case 'transferTires': {
      const { from, to, tire, qty: txQty } = params;
      if (!TIRES[tire]) return ctx.fail('Invalid tire type');
      const transferQty = Math.floor(Number(txQty));
      if (!transferQty || transferQty <= 0) return ctx.fail('Invalid quantity');
      if (!g.warehouseInventory) g.warehouseInventory = {};
      let srcInv;
      if (from === 'warehouse') { srcInv = g.warehouseInventory; }
      else { const srcLoc = g.locations.find(l => l.id === from); if (!srcLoc) return ctx.fail('Invalid source location'); if (!srcLoc.inventory) srcLoc.inventory = {}; srcInv = srcLoc.inventory; }
      if ((srcInv[tire] || 0) < transferQty) return ctx.fail('Not enough tires at source');
      let dstInv, dstCap, dstUsed;
      if (to === 'warehouse') { dstInv = g.warehouseInventory; dstCap = getStorageCap(g); dstUsed = Object.values(g.warehouseInventory).reduce((a, b) => a + b, 0); }
      else { const dstLoc = g.locations.find(l => l.id === to); if (!dstLoc) return ctx.fail('Invalid destination location'); if (!dstLoc.inventory) dstLoc.inventory = {}; dstInv = dstLoc.inventory; dstCap = getLocCap(dstLoc); dstUsed = getLocInv(dstLoc); }
      if (dstUsed + transferQty > dstCap) return ctx.fail('Not enough space at destination');
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

    default: return null;
  }
  return g;
}
