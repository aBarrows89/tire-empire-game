import { TIRES } from '../constants/tires.js';
import { CITIES } from '../constants/cities.js';
import { shopCost } from '../constants/shop.js';
import { FACTORY } from '../constants/factory.js';

export function getWealth(g) {
  const debt = (g.loans || []).reduce((a, l) => a + (l.remaining || 0), 0);

  // Inventory value: count all tires across warehouse + locations, value at sell price
  let invValue = 0;
  const wh = g.warehouseInventory || {};
  for (const [k, qty] of Object.entries(wh)) {
    const t = TIRES[k];
    if (t && qty > 0) {
      const sellPrice = (g.prices && g.prices[k]) || t.def;
      invValue += qty * sellPrice;
    }
  }
  for (const loc of (g.locations || [])) {
    for (const [k, qty] of Object.entries(loc.inventory || {})) {
      const t = TIRES[k];
      if (t && qty > 0) {
        const sellPrice = (g.prices && g.prices[k]) || t.def;
        invValue += qty * sellPrice;
      }
    }
  }

  // Location value: actual shopCost per city
  let locValue = 0;
  for (const loc of (g.locations || [])) {
    const city = CITIES.find(c => c.id === loc.cityId);
    locValue += city ? shopCost(city) : 120000;
  }

  // Pending installment payments
  const installmentValue = (g.shopInstallments || []).reduce(
    (a, i) => a + (i.monthlyPayment || 0) * (i.remaining || 0), 0
  );

  // Pending revenue share payments (estimated)
  const revShareValue = (g.shopRevenueShares || []).reduce(
    (a, r) => a + ((r.monthlyEstimate || 0) * (r.revSharePct || 0)) * (r.remaining || 0), 0
  );

  // Factory asset value
  const factoryValue = g.hasFactory && g.factory
    ? (FACTORY.factoryValue[g.factory.level] || 0)
    : 0;

  // Stock Exchange portfolio value (estimated from stored prices)
  let portfolioValue = 0;
  let marginDebt = 0;
  let shortLiability = 0;
  if (g.stockExchange) {
    // Portfolio: qty * avgCost as estimate (actual prices updated by exchange tick)
    for (const [, holding] of Object.entries(g.stockExchange.portfolio || {})) {
      if (holding && holding.qty > 0) {
        portfolioValue += holding.qty * (holding.avgCost || 0);
      }
    }
    marginDebt = g.stockExchange.marginDebt || 0;
    // Short liability estimate
    for (const [, pos] of Object.entries(g.stockExchange.shortPositions || {})) {
      if (pos && pos.qty > 0) {
        shortLiability += pos.qty * (pos.openPrice || 0);
      }
    }
  }

  return Math.floor(
    g.cash
    + (g.bankBalance || 0)
    + invValue
    + locValue
    + installmentValue
    + revShareValue
    + factoryValue
    + portfolioValue
    - marginDebt
    - shortLiability
    - debt
  );
}
