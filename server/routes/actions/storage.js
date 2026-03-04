import { TIRES } from '../../../shared/constants/tires.js';
import { STORAGE } from '../../../shared/constants/storage.js';
import { TPL } from '../../../shared/constants/thirdPartyLogistics.js';
import { getCap, getInv, getLocInv, getLocCap, getStorageCap, rebuildGlobalInv } from '../../../shared/helpers/inventory.js';
import { uid } from '../../../shared/helpers/random.js';
import { getAllActivePlayers, getPlayer, savePlayerState } from '../../db/queries.js';

export async function handleStorage(action, params, g, ctx) {
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

    // ═══ 3PL STORAGE LEASING ═══

    case 'listStorage': {
      const { capacity, pricePerTire, minLease, maxTenants, autoRenew } = params;
      if (g.reputation < TPL.minRepToList) return ctx.fail(`Need reputation ${TPL.minRepToList}+ to list storage`);
      if (!g.hasWarehouse) return ctx.fail('Need a warehouse or distribution center');
      const cap = Math.max(TPL.minSlots, Math.floor(Number(capacity) || 0));
      const price = Math.max(TPL.minPrice, Math.min(TPL.maxPrice, Number(pricePerTire) || TPL.defaultPrice));
      const minL = Math.max(TPL.minSlots, Math.floor(Number(minLease) || TPL.minSlots));
      const maxT = Math.max(1, Math.min(TPL.maxTenants, Math.floor(Number(maxTenants) || TPL.maxTenants)));

      // Check available warehouse capacity
      const whUsed = Object.values(g.warehouseInventory || {}).reduce((a, b) => a + b, 0);
      const alreadyListed = (g.storageListings || []).reduce((a, l) => a + l.capacity, 0);
      const whCap = getStorageCap(g);
      if (whUsed + alreadyListed + cap > whCap) return ctx.fail('Not enough free warehouse capacity');

      if (!g.storageListings) g.storageListings = [];
      g.storageListings.push({
        id: uid(), capacity: cap, available: cap,
        pricePerTire: Math.round(price * 100) / 100,
        minLease: minL, maxTenants: maxT, autoRenew: !!autoRenew,
        tenants: [], createdDay: g.day,
      });
      g.log.push({ msg: `Listed ${cap} storage slots for lease at $${price.toFixed(2)}/tire/month`, cat: 'storage' });
      break;
    }

    case 'delistStorage': {
      const { listingId } = params;
      if (!g.storageListings) return ctx.fail('No listings');
      const listing = g.storageListings.find(l => l.id === listingId);
      if (!listing) return ctx.fail('Listing not found');
      if (listing.tenants.length > 0) return ctx.fail('Cannot delist while tenants are active — evict first');
      g.storageListings = g.storageListings.filter(l => l.id !== listingId);
      break;
    }

    case 'evictTenant': {
      const { listingId, tenantId } = params;
      if (!g.storageListings) return ctx.fail('No listings');
      const listing = g.storageListings.find(l => l.id === listingId);
      if (!listing) return ctx.fail('Listing not found');
      const tenantIdx = listing.tenants.findIndex(t => t.playerId === tenantId);
      if (tenantIdx === -1) return ctx.fail('Tenant not found');
      // Set eviction notice (30-day notice)
      listing.tenants[tenantIdx].evictionDay = g.day + TPL.evictionNoticeDays;
      g.log.push({ msg: `Eviction notice sent — tenant leaves in ${TPL.evictionNoticeDays} days`, cat: 'storage' });
      break;
    }

    case 'rentStorage': {
      const { listingId, ownerId, slots } = params;
      if (g.reputation < TPL.minRepToRent) return ctx.fail(`Need reputation ${TPL.minRepToRent}+ to rent storage`);
      const slotCount = Math.max(TPL.minSlots, Math.floor(Number(slots) || 0));

      // Look up the owner's listing
      const owner = await getPlayer(ownerId);
      if (!owner) return ctx.fail('Storage owner not found');
      const og = owner.game_state;
      if (!og.storageListings) return ctx.fail('No listings available');
      const listing = og.storageListings.find(l => l.id === listingId);
      if (!listing) return ctx.fail('Listing not found');
      if (slotCount < listing.minLease) return ctx.fail(`Minimum lease is ${listing.minLease} slots`);
      if (listing.tenants.length >= listing.maxTenants) return ctx.fail('No tenant slots available');
      if (listing.available < slotCount) return ctx.fail(`Only ${listing.available} slots available`);

      // First month's rent upfront
      const monthlyRent = Math.round(slotCount * listing.pricePerTire * 100) / 100;
      if (g.cash < monthlyRent) return ctx.fail(`Need $${monthlyRent.toFixed(2)} for first month's rent`);

      g.cash -= monthlyRent;
      og.cash += monthlyRent;
      og.tplIncome = (og.tplIncome || 0) + monthlyRent;

      const leaseId = uid();
      listing.tenants.push({ playerId: g.id, slots: slotCount, leaseId, startDay: g.day, lastPaidDay: g.day });
      listing.available -= slotCount;

      if (!g.storageLeases) g.storageLeases = [];
      g.storageLeases.push({
        id: leaseId, ownerId, ownerName: og.companyName || og.name || 'Unknown',
        listingId, slots: slotCount, pricePerTire: listing.pricePerTire,
        monthlyRent, startDay: g.day, lastPaidDay: g.day, autoRenew: listing.autoRenew,
      });
      if (!g.tplInventory) g.tplInventory = {};
      g.tplInventory[leaseId] = {};

      await savePlayerState(ownerId, og, owner.version);
      g.log.push({ msg: `Rented ${slotCount} storage slots from ${og.companyName || 'owner'} ($${monthlyRent.toFixed(2)}/month)`, cat: 'storage' });
      break;
    }

    case 'tplTransfer': {
      const { leaseId, tire, qty: rawQty, direction } = params;
      if (!TIRES[tire]) return ctx.fail('Invalid tire type');
      const qty = Math.max(1, Math.floor(Number(rawQty) || 0));
      if (!g.storageLeases) return ctx.fail('No active leases');
      const lease = g.storageLeases.find(l => l.id === leaseId);
      if (!lease) return ctx.fail('Lease not found');
      if (!g.tplInventory) g.tplInventory = {};
      if (!g.tplInventory[leaseId]) g.tplInventory[leaseId] = {};
      const tplInv = g.tplInventory[leaseId];
      const tplUsed = Object.values(tplInv).reduce((a, b) => a + b, 0);

      if (direction === 'toTpl') {
        // Move from warehouse to 3PL
        if ((g.warehouseInventory?.[tire] || 0) < qty) return ctx.fail('Not enough tires in warehouse');
        if (tplUsed + qty > lease.slots) return ctx.fail('Not enough space in leased storage');
        g.warehouseInventory[tire] -= qty;
        tplInv[tire] = (tplInv[tire] || 0) + qty;
      } else {
        // Move from 3PL to warehouse
        if ((tplInv[tire] || 0) < qty) return ctx.fail('Not enough tires in 3PL storage');
        const whUsed = Object.values(g.warehouseInventory || {}).reduce((a, b) => a + b, 0);
        const whCap = getStorageCap(g);
        if (whUsed + qty > whCap) return ctx.fail('Not enough warehouse space');
        tplInv[tire] -= qty;
        if (tplInv[tire] <= 0) delete tplInv[tire];
        g.warehouseInventory = g.warehouseInventory || {};
        g.warehouseInventory[tire] = (g.warehouseInventory[tire] || 0) + qty;
      }
      rebuildGlobalInv(g);
      break;
    }

    case 'cancelLease': {
      const { leaseId } = params;
      if (!g.storageLeases) return ctx.fail('No leases');
      const lease = g.storageLeases.find(l => l.id === leaseId);
      if (!lease) return ctx.fail('Lease not found');

      // Return tires to warehouse
      const tplInv = g.tplInventory?.[leaseId] || {};
      const totalTires = Object.values(tplInv).reduce((a, b) => a + b, 0);
      if (totalTires > 0) {
        const whUsed = Object.values(g.warehouseInventory || {}).reduce((a, b) => a + b, 0);
        const whCap = getStorageCap(g);
        let returned = 0;
        for (const [k, v] of Object.entries(tplInv)) {
          const canFit = Math.min(v, whCap - whUsed - returned);
          if (canFit > 0) {
            g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + canFit;
            returned += canFit;
          }
          // Tires that don't fit are liquidated at 50%
          const liquidated = v - Math.min(v, canFit);
          if (liquidated > 0) {
            const t = TIRES[k];
            g.cash += Math.round(liquidated * (t?.def || 50) * TPL.liquidationPct);
          }
        }
        rebuildGlobalInv(g);
      }

      // Clean up owner's listing
      try {
        const owner = await getPlayer(lease.ownerId);
        if (owner) {
          const og = owner.game_state;
          const listing = (og.storageListings || []).find(l => l.id === lease.listingId);
          if (listing) {
            listing.tenants = listing.tenants.filter(t => t.leaseId !== leaseId);
            listing.available += lease.slots;
            await savePlayerState(lease.ownerId, og, owner.version);
          }
        }
      } catch (e) { /* owner cleanup best-effort */ }

      g.storageLeases = g.storageLeases.filter(l => l.id !== leaseId);
      if (g.tplInventory) delete g.tplInventory[leaseId];
      g.log.push({ msg: `Cancelled storage lease`, cat: 'storage' });
      break;
    }

    default: return null;
  }
  return g;
}
