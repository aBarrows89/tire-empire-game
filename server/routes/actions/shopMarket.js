import { CITIES } from '../../../shared/constants/cities.js';
import { TIRES } from '../../../shared/constants/tires.js';
import { shopRent } from '../../../shared/constants/shop.js';
import { PAY } from '../../../shared/constants/staff.js';
import { uid } from '../../../shared/helpers/random.js';
import { getShopValuation, SHOP_BID } from '../../../shared/constants/shopSale.js';
import { rebuildGlobalInv } from '../../../shared/helpers/inventory.js';

export async function handleShopMarket(action, params, g, ctx) {
  switch (action) {
    case 'listShopForSale': {
      const { locationId, askingPrice } = params;
      const loc = g.locations.find(l => l.id === locationId);
      if (!loc) return ctx.fail('Invalid location');
      if (!g.shopListings) g.shopListings = [];
      if (g.shopListings.some(l => l.locationId === locationId)) return ctx.fail('Shop already listed');
      const ownedDays = g.day - (loc.openedDay || 0);
      if (ownedDays < SHOP_BID.minOwnershipDays) {
        return ctx.fail(`Must own shop at least ${SHOP_BID.minOwnershipDays} days before listing (${SHOP_BID.minOwnershipDays - ownedDays} days left)`);
      }
      const city = CITIES.find(c => c.id === loc.cityId);
      const val = getShopValuation(loc, city);
      const price = Math.max(1, Math.floor(Number(askingPrice) || val.totalValue));
      g.shopListings.push({ locationId, askingPrice: price, listedDay: g.day });
      const invEntries = Object.entries(loc.inventory || {}).filter(([, q]) => q > 0);
      const monthlyRent = shopRent(city) * 4;
      const locStaff = loc.staff || g.staff || {};
      const monthlyStaffCost = Object.entries(locStaff).reduce((a, [k, v]) => a + (PAY[k] || 0) * v, 0);
      const monthlyExpenses = monthlyRent + monthlyStaffCost;
      const monthlyRevenue = Math.round((loc.dailyStats?.rev || 0) * 30);
      await ctx.addShopSaleListing({
        id: uid(), sellerId: ctx.playerId,
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
      if (!g.shopListings.some(l => l.locationId === locationId)) return ctx.fail('Shop not listed');
      g.shopListings = g.shopListings.filter(l => l.locationId !== locationId);
      if (!g.shopBids) g.shopBids = [];
      g.shopBids = g.shopBids.filter(b => b.locationId !== locationId);
      const sharedListings = await ctx.getShopSaleListings({ sellerId: ctx.playerId });
      const sharedListing = sharedListings.find(l => l.locationId === locationId);
      if (sharedListing) await ctx.removeShopSaleListing(sharedListing.id);
      g.log.push('Delisted shop from marketplace');
      break;
    }

    case 'acceptShopBid': {
      const { bidId } = params;
      if (!g.shopBids) g.shopBids = [];
      const bid = g.shopBids.find(b => b.id === bidId);
      if (!bid) return ctx.fail('Bid not found');
      const locIdx = g.locations.findIndex(l => l.id === bid.locationId);
      if (locIdx === -1) return ctx.fail('Location not found');
      const loc = g.locations[locIdx];
      const city = CITIES.find(c => c.id === loc.cityId);

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

      g.locations.splice(locIdx, 1);
      rebuildGlobalInv(g);
      if (!g.shopListings) g.shopListings = [];
      g.shopListings = g.shopListings.filter(l => l.locationId !== bid.locationId);
      g.shopBids = g.shopBids.filter(b => b.locationId !== bid.locationId);

      const payDesc = bid.paymentType === 'cash' ? `$${bid.bidPrice.toLocaleString()} cash`
        : bid.paymentType === 'installment' ? `installment (${Math.round(bid.downPct * 100)}% down)`
        : `revenue share (${Math.round(bid.revSharePct * 100)}% for ${bid.revShareMonths}mo)`;
      g.log.push(`Sold shop in ${city?.name || 'unknown'} to ${bid.bidderName} \u2014 ${payDesc}`);
      break;
    }

    case 'rejectShopBid': {
      const { bidId } = params;
      if (!g.shopBids) g.shopBids = [];
      g.shopBids = g.shopBids.filter(b => b.id !== bidId);
      break;
    }

    default: return null;
  }
  return g;
}
