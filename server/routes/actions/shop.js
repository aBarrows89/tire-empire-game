import { CITIES } from '../../../shared/constants/cities.js';
import { shopCost } from '../../../shared/constants/shop.js';
import { canOpenInCity } from '../../../shared/helpers/market.js';
import { uid } from '../../../shared/helpers/random.js';
import { PAY } from '../../../shared/constants/staff.js';
import { MARKETING } from '../../../shared/constants/marketing.js';
import { INSURANCE } from '../../../shared/constants/insurance.js';
import { getNextUpgrade } from '../../../shared/constants/shopStorage.js';
import { rebuildGlobalInv, getLocCap } from '../../../shared/helpers/inventory.js';

export async function handleShop(action, params, g, ctx) {
  switch (action) {
    case 'openShop': {
      const { cityId } = params;
      const city = CITIES.find(c => c.id === cityId);
      if (!city) return ctx.fail('Invalid city');
      const cost = shopCost(city);
      if (g.cash < cost) return ctx.fail('Not enough cash');
      const check = canOpenInCity(g, cityId);
      if (!check.ok) return ctx.fail(check.reason);
      g.cash -= cost;
      const newLoc = { cityId, id: uid(), locStorage: 0, inventory: {}, loyalty: 0, openedDay: g.day };

      // Auto-seed new store with up to 50 tires from warehouse (or from store #1 if no warehouse)
      const seedInventory = {};
      const seedSource = (g.hasWarehouse && g.warehouseInventory) ? g.warehouseInventory
        : (g.locations[0]?.inventory || null);
      if (seedSource) {
        const locCap = getLocCap(newLoc) || 100;
        const seedTarget = Math.min(50, Math.floor(locCap * 0.4)); // seed up to 40% capacity
        let seeded = 0;
        // Sort by qty descending — transfer most plentiful tires first
        const sorted = Object.entries(seedSource)
          .filter(([, q]) => q > 0)
          .sort((a, b) => b[1] - a[1]);
        for (const [k, qty] of sorted) {
          if (seeded >= seedTarget) break;
          const take = Math.min(qty, Math.ceil(seedTarget / Math.max(1, sorted.length)), seedTarget - seeded);
          if (take <= 0) continue;
          seedInventory[k] = take;
          seedSource[k] = qty - take;
          if (seedSource[k] <= 0) delete seedSource[k];
          seeded += take;
        }
      }
      newLoc.inventory = seedInventory;
      g.locations.push(newLoc);
      g.log?.push({ msg: `🏪 New store opened in ${city.name}${Object.keys(seedInventory).length ? ` with ${Object.values(seedInventory).reduce((a,b)=>a+b,0)} tires transferred` : ' (stock it up!)'}`, cat: 'expand' });
      break;
    }

    case 'hireStaff': {
      const { role } = params;
      if (!g.staff) g.staff = { techs: 0, sales: 0, managers: 0, drivers: 0, pricingAnalyst: 0 };
      if (g.staff[role] === undefined) return ctx.fail('Invalid role');
      const hireCost = PAY[role] || 0;
      if (g.cash < hireCost) return ctx.fail(`Not enough cash (need $${hireCost} for first month salary)`);
      g.cash -= hireCost;
      g.staff[role]++;
      break;
    }

    case 'fireStaff': {
      const { role } = params;
      if (!g.staff) g.staff = { techs: 0, sales: 0, managers: 0, drivers: 0, pricingAnalyst: 0 };
      if (!g.staff[role] || g.staff[role] <= 0) return ctx.fail('No staff to fire');
      g.staff[role]--;
      break;
    }

    case 'upgradeShopStorage': {
      const { locationId } = params;
      const loc = g.locations.find(l => l.id === locationId);
      if (!loc) return ctx.fail('Invalid location');
      const upgrade = getNextUpgrade(loc);
      if (!upgrade) return ctx.fail('Storage already at max');
      if (g.cash < upgrade.cost) return ctx.fail('Not enough cash');
      g.cash -= upgrade.cost;
      loc.locStorage = upgrade.cumCap;
      g.log.push(`Upgraded storage: ${upgrade.ic} ${upgrade.n} (+${upgrade.add} capacity)`);
      break;
    }

    case 'setMarketing': {
      const { locationId, tier } = params;
      const loc = g.locations.find(l => l.id === locationId);
      if (!loc) return ctx.fail('Invalid location');
      if (tier && !MARKETING[tier]) return ctx.fail('Invalid marketing tier');
      loc.marketing = tier || null;
      break;
    }

    case 'setInsurance': {
      const { tier } = params;
      if (tier && !INSURANCE[tier]) return ctx.fail('Invalid insurance tier');
      g.insurance = tier || null;
      break;
    }

    case 'financeShop': {
      const { cityId } = params;
      const city = CITIES.find(c => c.id === cityId);
      if (!city) return ctx.fail('Invalid city');
      const cost = shopCost(city);
      const downPayment = Math.ceil(cost * 0.20);
      if (g.cash < downPayment) return ctx.fail(`Need at least $${downPayment} (20% down)`);
      const check = canOpenInCity(g, cityId);
      if (!check.ok) return ctx.fail(check.reason);
      g.cash -= downPayment;
      // Auto-seed financed store same as cash purchase
      const finLoc = { cityId, id: uid(), locStorage: 0, inventory: {}, loyalty: 0, openedDay: g.day };
      const finSeedSource = (g.hasWarehouse && g.warehouseInventory) ? g.warehouseInventory : (g.locations[0]?.inventory || null);
      if (finSeedSource) {
        const finCap = getLocCap(finLoc) || 100;
        const finTarget = Math.min(50, Math.floor(finCap * 0.4));
        let finSeeded = 0;
        const finSorted = Object.entries(finSeedSource).filter(([,q]) => q > 0).sort((a,b) => b[1]-a[1]);
        for (const [k, qty] of finSorted) {
          if (finSeeded >= finTarget) break;
          const take = Math.min(qty, Math.ceil(finTarget / Math.max(1, finSorted.length)), finTarget - finSeeded);
          if (take <= 0) continue;
          finLoc.inventory[k] = take;
          finSeedSource[k] = qty - take;
          if (finSeedSource[k] <= 0) delete finSeedSource[k];
          finSeeded += take;
        }
      }
      g.locations.push(finLoc);
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
        weeklyPayment: totalOwed / (12 * 4),
      });
      g.log.push(`Financed shop in ${city.name}: $${downPayment.toLocaleString()} down, $${financed.toLocaleString()} loan`);
      break;
    }

    case 'setStockingPrefs': {
      const { locationId, mode, tireTypes } = params;
      const loc = g.locations.find(l => l.id === locationId);
      if (!loc) return ctx.fail('Invalid location');
      if (!['all', 'whitelist', 'blacklist', 'vinnie'].includes(mode)) return ctx.fail('Mode must be all, whitelist, blacklist, or vinnie');
      loc.stockingPrefs = {
        mode,
        tireTypes: Array.isArray(tireTypes) ? tireTypes : [],
      };
      const label = mode === 'vinnie' ? "Vinnie's recommendations" : mode === 'all' ? 'all tire types' : mode === 'whitelist' ? `only ${tireTypes.length} selected types` : `excluding ${tireTypes.length} types`;
      g.log.push({ msg: `Updated stocking prefs: ${label}`, cat: 'source' });
      break;
    }

    case 'setUsedTirePolicy': {
      const { locationId, policy } = params;
      const policyLoc = g.locations.find(l => l.id === locationId);
      if (!policyLoc) return ctx.fail('Invalid location');
      if (!['auto', 'new_only', 'return_used'].includes(policy)) return ctx.fail('Policy must be auto, new_only, or return_used');
      policyLoc.usedTirePolicy = policy;
      const labels = { auto: 'Auto (balanced)', new_only: 'New only', return_used: 'Return used' };
      g.log.push({ msg: `Set used tire policy to "${labels[policy]}" for this location`, cat: 'source' });
      break;
    }

    case 'sellShop': {
      const { locationId } = params;
      const locIdx = g.locations.findIndex(l => l.id === locationId);
      if (locIdx === -1) return ctx.fail('Invalid location');
      const loc = g.locations[locIdx];
      const city = CITIES.find(c => c.id === loc.cityId);
      const sellPrice = Math.round((city ? shopCost(city) : 120000) * 0.50);
      if (!g.warehouseInventory) g.warehouseInventory = {};
      for (const [k, qty] of Object.entries(loc.inventory || {})) {
        if (qty > 0) g.warehouseInventory[k] = (g.warehouseInventory[k] || 0) + qty;
      }
      g.locations.splice(locIdx, 1);
      g.cash += sellPrice;
      rebuildGlobalInv(g);
      if (g.shopListings) g.shopListings = g.shopListings.filter(l => l.locationId !== locationId);
      if (g.shopBids) g.shopBids = g.shopBids.filter(b => b.locationId !== locationId);
      const sellSharedListings = await ctx.getShopSaleListings({ sellerId: ctx.playerId });
      const sellSharedListing = sellSharedListings.find(l => l.locationId === locationId);
      if (sellSharedListing) await ctx.removeShopSaleListing(sellSharedListing.id);
      g.log.push(`Sold shop in ${city?.name || 'unknown'} for $${sellPrice.toLocaleString()}`);
      break;
    }

    default: return null;
  }
  return g;
}
