import { uid } from '../../shared/helpers/random.js';
import { R, Rf, C } from '../../shared/helpers/format.js';
import {
  IPO_TOTAL_SHARES, IPO_FOUNDER_PCT, IPO_LISTING_FEE, IPO_LISTING_PCT,
  IPO_LOCKUP_DAYS, BASE_PE_RATIOS, PRICE_MAX_DAILY_MOVE,
  FUNDAMENTAL_PULL_RATE, ORDER_FLOW_IMPACT, MARKET_MAKERS,
  ETF_DEFS, CRASH_COOLDOWN_DAYS, CRASH_BUBBLE_THRESHOLD,
  CRASH_SEVERITY_RANGE, CRASH_DURATION_RANGE, BLACK_SWAN_CHANCE,
  DIVIDEND_MAX_PAYOUT, DIVIDEND_FREQUENCY, DIVIDEND_TAX, DIVIDEND_TAX_PREMIUM,
  TRADE_COMMISSION, TRADE_COMMISSION_PREMIUM, TRADE_MIN_FREE,
  MAX_ORDER_PCT_FLOAT, BROKERAGE_MONTHLY_FEE, WEALTH_TAX_TIERS,
  CAP_GAINS_SHORT, CAP_GAINS_LONG, CAP_GAINS_HOLD_THRESHOLD,
  VINNIE_TIP_COST, VINNIE_TIP_ACCURACY,
  LOTTERY_TICKET_COST, LOTTERY_PRIZES, LOTTERY_SCRATCH_CELLS, LOTTERY_WIN_MATCH,
  MARGIN_MAINTENANCE, MARGIN_CALL_DAYS, MARGIN_FORCE_LIQUIDATION_FEE,
  SHORT_MAX_DAYS, SHORT_BORROW_FEE_DAILY,
} from '../../shared/constants/exchange.js';

export function initExchange() {
  const commodities = {
    RUBR: { name: 'Rubber', price: 100, baseValue: 100 },
    STEL: { name: 'Steel', price: 100, baseValue: 100 },
    CHEM: { name: 'Chemicals', price: 100, baseValue: 100 },
  };
  const etfs = {};
  for (const def of ETF_DEFS) {
    etfs[def.ticker] = { name: def.name, price: 100, change: 0, divisor: 1, components: [], sectorFilter: def.sectorFilter };
  }
  const marketMakers = MARKET_MAKERS.map(mm => ({ ...mm, holdings: {} }));
  return {
    stocks: {}, orderBooks: {}, etfs, commodities,
    sentiment: { value: 1.0, trend: 0, crashActive: false, crashDaysLeft: 0, crashSeverity: 0, lastCrashDay: 0 },
    marketMakers, dayVolume: 0, lastDividendDay: 0, indices: { TESX: 100 },
  };
}

export function generateTicker(companyName, existingTickers) {
  const words = (companyName || 'STOCK').toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/).filter(Boolean);
  let ticker;
  if (words.length >= 3) ticker = words[0][0] + words[1][0] + words[2][0] + (words[0][1] || 'X');
  else if (words.length === 2) ticker = words[0].slice(0, 2) + words[1].slice(0, 2);
  else ticker = words[0].slice(0, 4);
  ticker = ticker.slice(0, 4);
  let candidate = ticker;
  let i = 1;
  while (existingTickers && existingTickers.has(candidate)) { candidate = ticker.slice(0, 3) + String(i); i++; }
  return candidate;
}

export function getPlayerSector(g) {
  if (g.hasFactory && g.hasWholesale) return 'manufacturing';
  if (g.hasEcom && !g.hasFactory) return 'ecommerce';
  if (g.hasWholesale && !g.hasFactory) return 'wholesale';
  if ((g.locations || []).length > 0) return 'retail';
  return 'mixed';
}

export function updateFundamentals(stock, playerState) {
  const g = playerState;
  const annualizedRev = (g.dayRev || 0) * 360;
  const annualizedProfit = (g.dayProfit || 0) * 360;
  stock.revenue = annualizedRev;
  stock.profit = annualizedProfit;
  stock.eps = stock.totalShares > 0 ? annualizedProfit / stock.totalShares : 0;
  stock.bookValue = (g.cash || 0) + (g.bankBalance || 0);
  stock.locations = (g.locations || []).length;
  stock.reputation = g.reputation || 0;
  stock.sector = getPlayerSector(g);
  stock.dailyProfit = g.dayProfit || 0;

  // Revenue by segment (from simDay channel tracking)
  const ch = g.dayRevByChannel || {};
  stock.revenueBySegment = {
    retail: (ch.shops || 0) + (ch.van || 0) + (ch.flea || 0) + (ch.carMeets || 0),
    ecommerce: ch.ecom || 0,
    wholesale: ch.wholesale || 0,
    manufacturing: ch.factoryWholesale || 0,
    services: ch.services || 0,
    government: ch.gov || 0,
  };

  // Revenue history (last 30 days from player history)
  stock.revenueHistory = (g.history || []).map(h => ({ day: h.day, rev: h.rev, profit: h.profit }));

  // Profit margin
  stock.profitMargin = (g.dayRev || 0) > 0 ? (g.dayProfit || 0) / (g.dayRev || 0) : 0;

  // Growth metrics
  const hist = g.history || [];
  if (hist.length >= 7) {
    const recent7 = hist.slice(-7).reduce((a, h) => a + h.rev, 0);
    const prior7 = hist.slice(-14, -7);
    const prev7 = prior7.length > 0 ? prior7.reduce((a, h) => a + h.rev, 0) : recent7;
    stock.weeklyGrowth = prev7 > 0 ? (recent7 - prev7) / prev7 : 0;
  } else {
    stock.weeklyGrowth = 0;
  }

  // Risk rating
  stock.riskRating = calculateRiskRating(stock, g);

  // Dividend yield (annualized)
  const weeklyDiv = stock.dailyProfit > 0
    ? stock.dailyProfit * 7 * Math.min(stock.dividendPayoutRatio || 0.25, 0.75) / stock.totalShares
    : 0;
  stock.dividendYield = stock.price > 0 ? (weeklyDiv * 52) / stock.price : 0;

  // Company age in days
  stock.companyAge = g.day || 0;
  stock.totalRevenue = g.totalRev || 0;
  stock.totalSold = g.totalSold || 0;
  stock.hasFactory = g.hasFactory || false;
  stock.hasEcom = g.hasEcom || false;
  stock.hasWholesale = g.hasWholesale || false;
  stock.staffCount = (g.staff?.techs || 0) + (g.staff?.sales || 0) + (g.staff?.managers || 0) + (g.staff?.drivers || 0);
}

export function calculateRiskRating(stock, g) {
  let riskScore = 0;
  // Age factor: newer = riskier
  if ((g.day || 0) < 30) riskScore += 3;
  else if ((g.day || 0) < 60) riskScore += 2;
  else if ((g.day || 0) < 120) riskScore += 1;
  // Revenue consistency: check for negative profit days in history
  const hist = g.history || [];
  if (hist.length >= 7) {
    const negDays = hist.slice(-7).filter(h => h.profit <= 0).length;
    if (negDays >= 4) riskScore += 3;
    else if (negDays >= 2) riskScore += 2;
    else if (negDays >= 1) riskScore += 1;
  } else {
    riskScore += 2; // insufficient data
  }
  // Diversification: more segments = more stable
  const segments = [
    (g.locations || []).length > 0,
    g.hasFactory,
    g.hasEcom,
    g.hasWholesale,
  ].filter(Boolean).length;
  if (segments <= 1) riskScore += 2;
  else if (segments <= 2) riskScore += 1;
  // Location count
  if ((g.locations || []).length < 2) riskScore += 1;
  // Profit margin
  if ((g.dayRev || 0) > 0 && (g.dayProfit || 0) / (g.dayRev || 0) < 0.1) riskScore += 1;

  if (riskScore >= 7) return 'Very High';
  if (riskScore >= 5) return 'High';
  if (riskScore >= 3) return 'Moderate';
  if (riskScore >= 1) return 'Low';
  return 'Very Low';
}

export function calculateFundamentalPrice(stock, sentiment) {
  const pe = BASE_PE_RATIOS[stock.sector] || 7;
  const adjustedPE = pe * (sentiment || 1.0);
  const epsPrice = Math.max(0, stock.eps * adjustedPE);
  const bvPerShare = stock.totalShares > 0 ? Math.max(0, stock.bookValue / stock.totalShares) : 0;
  return Math.max(epsPrice, bvPerShare * 0.5, 0.01);
}

export function updateDailyPrice(stock, orderBook, sentiment) {
  const currentPrice = stock.price;
  if (currentPrice <= 0) { stock.price = 0.01; return; }
  const totalBids = (orderBook.bids || []).reduce((a, o) => a + o.qty, 0);
  const totalAsks = (orderBook.asks || []).reduce((a, o) => a + o.qty, 0);
  const totalVol = totalBids + totalAsks;
  const orderFlowSignal = totalVol > 0 ? (totalBids - totalAsks) / totalVol : 0;
  const fundamentalPrice = calculateFundamentalPrice(stock, sentiment);
  const fundamentalPull = currentPrice > 0 ? (fundamentalPrice - currentPrice) / currentPrice * FUNDAMENTAL_PULL_RATE : 0;
  const noise = (Math.random() - 0.5) * 0.04;
  const priceChange = orderFlowSignal * ORDER_FLOW_IMPACT + fundamentalPull + noise;
  const clampedChange = C(priceChange, -PRICE_MAX_DAILY_MOVE, PRICE_MAX_DAILY_MOVE);
  stock.price = Math.max(0.01, +(currentPrice * (1 + clampedChange)).toFixed(2));
  if (!stock.priceHistory) stock.priceHistory = [];
  stock.priceHistory.push({
    day: stock._currentDay || 0, open: stock._dayOpen || stock.price,
    high: Math.max(stock._dayOpen || stock.price, stock.price),
    low: Math.min(stock._dayOpen || stock.price, stock.price),
    close: stock.price, volume: orderBook.dayVolume || 0,
  });
  if (stock.priceHistory.length > 90) stock.priceHistory.shift();
  stock._dayOpen = stock.price;
  stock.change = currentPrice > 0 ? +((stock.price - currentPrice) / currentPrice * 100).toFixed(2) : 0;
}

export function matchOrders(orderBook, stock, day) {
  const fills = [];
  if (!orderBook.bids || !orderBook.asks) return fills;
  orderBook.bids.sort((a, b) => b.price - a.price || a.placedDay - b.placedDay);
  orderBook.asks.sort((a, b) => a.price - b.price || a.placedDay - b.placedDay);
  while (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
    const bestBid = orderBook.bids[0];
    const bestAsk = orderBook.asks[0];
    if (bestBid.price < bestAsk.price) break;
    const fillPrice = bestAsk.placedDay <= bestBid.placedDay ? bestAsk.price : bestBid.price;
    const fillQty = Math.min(bestBid.qty, bestAsk.qty);
    fills.push({ buyerId: bestBid.playerId, sellerId: bestAsk.playerId, ticker: stock.ticker, price: fillPrice, qty: fillQty, day });
    bestBid.qty -= fillQty; bestAsk.qty -= fillQty;
    if (bestBid.qty <= 0) orderBook.bids.shift();
    if (bestAsk.qty <= 0) orderBook.asks.shift();
    stock.price = fillPrice;
    orderBook.lastTradePrice = fillPrice;
    orderBook.dayVolume = (orderBook.dayVolume || 0) + fillQty;
  }
  return fills;
}

export function executeMarketOrder(orderBook, side, qty, playerId, day) {
  const fills = [];
  const book = side === 'buy' ? orderBook.asks : orderBook.bids;
  if (!book) return fills;
  book.sort(side === 'buy' ? (a, b) => a.price - b.price : (a, b) => b.price - a.price);
  let remaining = qty;
  while (remaining > 0 && book.length > 0) {
    const top = book[0];
    const fillQty = Math.min(remaining, top.qty);
    fills.push({ buyerId: side === 'buy' ? playerId : top.playerId, sellerId: side === 'sell' ? playerId : top.playerId, price: top.price, qty: fillQty, day });
    top.qty -= fillQty; remaining -= fillQty;
    if (top.qty <= 0) book.shift();
    orderBook.lastTradePrice = top.price;
    orderBook.dayVolume = (orderBook.dayVolume || 0) + fillQty;
  }
  return fills;
}

export function executeLimitOrder(orderBook, side, price, qty, playerId, day) {
  const fills = [];
  const oppositeBook = side === 'buy' ? orderBook.asks : orderBook.bids;
  if (oppositeBook && oppositeBook.length > 0) {
    oppositeBook.sort(side === 'buy' ? (a, b) => a.price - b.price : (a, b) => b.price - a.price);
    let remaining = qty;
    while (remaining > 0 && oppositeBook.length > 0) {
      const top = oppositeBook[0];
      const canFill = side === 'buy' ? top.price <= price : top.price >= price;
      if (!canFill) break;
      const fillQty = Math.min(remaining, top.qty);
      fills.push({ buyerId: side === 'buy' ? playerId : top.playerId, sellerId: side === 'sell' ? playerId : top.playerId, price: top.price, qty: fillQty, day });
      top.qty -= fillQty; remaining -= fillQty;
      if (top.qty <= 0) oppositeBook.shift();
      orderBook.lastTradePrice = top.price;
      orderBook.dayVolume = (orderBook.dayVolume || 0) + fillQty;
    }
    qty = remaining;
  }
  if (qty > 0) {
    const book = side === 'buy' ? orderBook.bids : orderBook.asks;
    book.push({ id: uid(), playerId, price, qty, side, placedDay: day });
  }
  return fills;
}

export function refreshMarketMakerQuotes(mm, stock, orderBook) {
  const mmId = mm.id;
  orderBook.bids = (orderBook.bids || []).filter(o => o.playerId !== mmId);
  orderBook.asks = (orderBook.asks || []).filter(o => o.playerId !== mmId);
  const spread = stock.price * (mm.spreadBps / 10000);
  const bidPrice = +(stock.price - spread / 2).toFixed(2);
  const askPrice = +(stock.price + spread / 2).toFixed(2);
  const qty = Math.max(10, Math.floor(mm.cash / stock.price * 0.01));
  if (bidPrice > 0) orderBook.bids.push({ id: uid(), playerId: mmId, price: bidPrice, qty, side: 'buy', placedDay: stock._currentDay || 0, isNPC: true });
  if (askPrice > 0) orderBook.asks.push({ id: uid(), playerId: mmId, price: askPrice, qty, side: 'sell', placedDay: stock._currentDay || 0, isNPC: true });
}

export function processIPO(playerState, exchangeState, day) {
  const g = playerState;
  const ticker = generateTicker(g.companyName, new Set(Object.keys(exchangeState.stocks)));
  const sector = getPlayerSector(g);
  const totalShares = IPO_TOTAL_SHARES;
  const founderShares = Math.floor(totalShares * IPO_FOUNDER_PCT);
  const publicShares = totalShares - founderShares;
  const annualizedProfit = (g.dayProfit || 0) * 360;
  const eps = annualizedProfit / totalShares;
  const pe = BASE_PE_RATIOS[sector] || 7;
  const initialPrice = Math.max(1, +(eps * pe).toFixed(2));
  const proceeds = publicShares * initialPrice;
  const listingFee = IPO_LISTING_FEE + Math.floor(proceeds * IPO_LISTING_PCT);
  g.cash -= listingFee;
  const stock = {
    ticker, companyName: g.companyName, playerId: g.id, sector, price: initialPrice, change: 0,
    totalShares, floatShares: publicShares, founderShares, eps,
    revenue: (g.dayRev || 0) * 360, profit: annualizedProfit,
    bookValue: (g.cash || 0) + (g.bankBalance || 0),
    locations: (g.locations || []).length, reputation: g.reputation || 0,
    dailyProfit: g.dayProfit || 0,
    dividendPayoutRatio: g.stockExchange?.dividendPayoutRatio || 0.25,
    ipoDay: day,
    priceHistory: [{ day, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 }],
    _dayOpen: initialPrice, _currentDay: day,
  };
  const orderBook = { bids: [], asks: [], lastTradePrice: initialPrice, dayVolume: 0 };
  for (const mm of exchangeState.marketMakers) refreshMarketMakerQuotes(mm, stock, orderBook);
  exchangeState.stocks[ticker] = stock;
  exchangeState.orderBooks[ticker] = orderBook;
  g.stockExchange.isPublic = true;
  g.stockExchange.ipoDay = day;
  g.stockExchange.ticker = ticker;
  g.stockExchange.founderSharesLocked = founderShares;
  g.stockExchange.portfolio[ticker] = { qty: founderShares, avgCost: initialPrice, acquiredDay: day };
  return { ticker, initialPrice, proceeds, listingFee, publicShares };
}

export function calculateCommission(totalValue, isPremium) {
  if (totalValue < TRADE_MIN_FREE) return 0;
  return Math.floor(totalValue * (isPremium ? TRADE_COMMISSION_PREMIUM : TRADE_COMMISSION));
}

export function calculateCapGainsTax(profit, holdDays) {
  if (profit <= 0) return 0;
  return Math.floor(profit * (holdDays >= CAP_GAINS_HOLD_THRESHOLD ? CAP_GAINS_LONG : CAP_GAINS_SHORT));
}

export function calculateWealthTax(portfolioValue) {
  let tax = 0;
  for (const tier of WEALTH_TAX_TIERS) {
    if (portfolioValue <= tier.min) continue;
    tax += (Math.min(portfolioValue, tier.max) - tier.min) * tier.rate;
  }
  return Math.floor(tax);
}

export function recalculateETF(etf, stocks) {
  const components = [];
  for (const [ticker, stock] of Object.entries(stocks)) {
    if (!etf.sectorFilter || stock.sector === etf.sectorFilter) components.push(ticker);
  }
  etf.components = components;
  if (components.length === 0) { etf.price = 0; etf.change = 0; return; }
  let totalMcap = 0;
  for (const t of components) totalMcap += stocks[t].price * stocks[t].totalShares;
  const prevPrice = etf.price || 100;
  etf.price = etf.divisor > 0 ? +(totalMcap / etf.divisor).toFixed(2) : 100;
  if (etf.price === 0 && components.length > 0) { etf.divisor = totalMcap / 100; etf.price = 100; }
  etf.change = prevPrice > 0 ? +((etf.price - prevPrice) / prevPrice * 100).toFixed(2) : 0;
}

export function updateCommodityIndices(commodities) {
  for (const [key, comm] of Object.entries(commodities)) {
    const drift = (Math.random() - 0.48) * 0.03;
    const pull = (comm.baseValue - comm.price) / comm.baseValue * 0.02;
    comm.price = Math.max(10, +(comm.price * (1 + drift + pull)).toFixed(2));
  }
}

export function updateSentiment(sentiment, stocks, day, bankruptcies) {
  if (sentiment.crashActive) {
    sentiment.crashDaysLeft--;
    if (sentiment.crashDaysLeft <= 0) { sentiment.crashActive = false; sentiment.crashSeverity = 0; }
    sentiment.value = C(sentiment.value + 0.02, 0.3, 0.7);
    return;
  }
  if (day - sentiment.lastCrashDay < CRASH_COOLDOWN_DAYS && sentiment.value < 1.0) {
    sentiment.value = C(sentiment.value + 0.02, 0.4, 1.2);
    return;
  }
  // Recent bankruptcies drag sentiment down and increase crash probability
  const recentBankruptcies = (bankruptcies || []).filter(b => day - b.day <= 30).length;
  const bankruptcyDrag = recentBankruptcies * 0.03; // each recent bankruptcy pulls sentiment -3%
  sentiment.value = C(sentiment.value + (Math.random() - 0.48) * 0.05 - bankruptcyDrag, 0.6, 1.4);
  let crashTriggered = false;
  if (Math.random() < BLACK_SWAN_CHANCE) crashTriggered = true;
  // Bankruptcies increase crash probability
  if (!crashTriggered && recentBankruptcies >= 2 && Math.random() < recentBankruptcies * 0.01) {
    crashTriggered = true;
  }
  if (!crashTriggered) {
    const stockList = Object.values(stocks);
    if (stockList.length > 0) {
      let aboveMaCount = 0;
      for (const s of stockList) {
        if (!s.priceHistory || s.priceHistory.length < 30) continue;
        const ma30 = s.priceHistory.slice(-30).reduce((a, h) => a + h.close, 0) / 30;
        if (s.price > ma30 * (1 + CRASH_BUBBLE_THRESHOLD)) aboveMaCount++;
      }
      if (aboveMaCount > stockList.length * 0.5 && Math.random() < 0.02) crashTriggered = true;
    }
  }
  if (crashTriggered && day - sentiment.lastCrashDay >= CRASH_COOLDOWN_DAYS) {
    const severity = Rf(CRASH_SEVERITY_RANGE[0], CRASH_SEVERITY_RANGE[1]);
    const duration = R(CRASH_DURATION_RANGE[0], CRASH_DURATION_RANGE[1]);
    sentiment.crashActive = true; sentiment.crashDaysLeft = duration;
    sentiment.crashSeverity = severity; sentiment.lastCrashDay = day;
    sentiment.value = Rf(0.4, 0.6);
    for (const stock of Object.values(stocks)) {
      stock.price = Math.max(0.01, +(stock.price * (1 - severity / duration)).toFixed(2));
    }
  }
}

export function distributeDividends(stocks, players, day) {
  const results = [];
  for (const [ticker, stock] of Object.entries(stocks)) {
    if (stock.dailyProfit <= 0 || !stock.dividendPayoutRatio) continue;
    const weeklyProfit = stock.dailyProfit * DIVIDEND_FREQUENCY;
    const totalDividend = weeklyProfit * Math.min(stock.dividendPayoutRatio, DIVIDEND_MAX_PAYOUT);
    if (totalDividend <= 0) continue;
    const dividendPerShare = totalDividend / stock.totalShares;
    for (const player of players) {
      const g = player.game_state;
      if (!g.stockExchange?.portfolio?.[ticker]) continue;
      const holding = g.stockExchange.portfolio[ticker];
      if (holding.qty <= 0) continue;
      const grossDiv = +(holding.qty * dividendPerShare).toFixed(2);
      const taxRate = g.isPremium ? DIVIDEND_TAX_PREMIUM : DIVIDEND_TAX;
      const tax = Math.floor(grossDiv * taxRate);
      const netDiv = grossDiv - tax;
      g.cash += netDiv;
      g.stockExchange.dividendIncome = (g.stockExchange.dividendIncome || 0) + netDiv;
      g.stockExchange.taxesPaid = (g.stockExchange.taxesPaid || 0) + tax;
      g.log = g.log || [];
      g.log.push({ msg: 'Dividend: $' + Math.round(netDiv) + ' from $' + ticker + ' (tax: $' + tax + ')', cat: 'exchange' });
      results.push({ playerId: player.id, ticker, gross: grossDiv, tax, net: netDiv });
    }
  }
  return results;
}

export function assessMonthlyFees(players, stocks) {
  for (const player of players) {
    const g = player.game_state;
    if (!g.stockExchange?.hasBrokerage) continue;
    g.cash -= BROKERAGE_MONTHLY_FEE;
    g.stockExchange.brokerageFeePaid = (g.stockExchange.brokerageFeePaid || 0) + BROKERAGE_MONTHLY_FEE;
    let portfolioValue = 0;
    for (const [ticker, holding] of Object.entries(g.stockExchange.portfolio || {})) {
      const stock = stocks[ticker];
      if (stock && holding.qty > 0) portfolioValue += stock.price * holding.qty;
    }
    const wealthTax = calculateWealthTax(portfolioValue);
    if (wealthTax > 0) {
      g.cash -= wealthTax;
      g.stockExchange.wealthTaxPaid = (g.stockExchange.wealthTaxPaid || 0) + wealthTax;
      g.log = g.log || [];
      g.log.push({ msg: 'Monthly wealth tax: $' + wealthTax + ' on $' + Math.round(portfolioValue) + ' portfolio', cat: 'exchange' });
    }
  }
}

export function processMarginCalls(players, stocks, day) {
  for (const player of players) {
    const g = player.game_state;
    if (!g.stockExchange?.marginEnabled || !g.stockExchange.marginDebt) continue;
    let portfolioValue = 0;
    for (const [ticker, holding] of Object.entries(g.stockExchange.portfolio || {})) {
      const stock = stocks[ticker];
      if (stock) portfolioValue += stock.price * holding.qty;
    }
    const equity = portfolioValue - g.stockExchange.marginDebt;
    if (equity < portfolioValue * MARGIN_MAINTENANCE) {
      if (!g.stockExchange.marginCallDay) {
        g.stockExchange.marginCallDay = day;
        g.log = g.log || [];
        g.log.push({ msg: 'MARGIN CALL! Deposit funds or sell positions within ' + MARGIN_CALL_DAYS + ' days.', cat: 'exchange' });
      } else if (day - g.stockExchange.marginCallDay >= MARGIN_CALL_DAYS) {
        const penalty = Math.floor(g.stockExchange.marginDebt * MARGIN_FORCE_LIQUIDATION_FEE);
        g.cash -= penalty;
        g.stockExchange.marginDebt = 0; g.stockExchange.marginCallDay = null;
        for (const [ticker, holding] of Object.entries(g.stockExchange.portfolio || {})) {
          const stock = stocks[ticker];
          if (stock && holding.qty > 0) { g.cash += stock.price * holding.qty; holding.qty = 0; }
        }
        g.log = g.log || [];
        g.log.push({ msg: 'Margin call failed! All positions liquidated. Penalty: $' + penalty, cat: 'exchange' });
      }
    } else { g.stockExchange.marginCallDay = null; }
  }
}

export function processShortPositions(players, stocks, day) {
  for (const player of players) {
    const g = player.game_state;
    if (!g.stockExchange?.shortPositions) continue;
    for (const [ticker, pos] of Object.entries(g.stockExchange.shortPositions)) {
      if (!pos || pos.qty <= 0) continue;
      const stock = stocks[ticker];
      if (!stock) continue;
      g.cash -= Math.floor(stock.price * pos.qty * SHORT_BORROW_FEE_DAILY);
      if (day - pos.openDay >= SHORT_MAX_DAYS) {
        const coverCost = stock.price * pos.qty;
        g.cash -= coverCost;
        const pnl = pos.openPrice * pos.qty - coverCost;
        g.log = g.log || [];
        g.log.push({ msg: 'Short expired on $' + ticker + ': ' + (pnl >= 0 ? '+' : '') + '$' + Math.round(pnl), cat: 'exchange' });
        delete g.stockExchange.shortPositions[ticker];
      }
    }
  }
}

export function expireOldOrders(orderBooks, players, day) {
  for (const [ticker, book] of Object.entries(orderBooks)) {
    for (const side of ['bids', 'asks']) {
      if (!book[side]) continue;
      book[side] = book[side].filter(o => o.isNPC || day - o.placedDay <= 7);
    }
  }
}

export function getPortfolioValue(g, stocks) {
  let value = 0;
  for (const [ticker, holding] of Object.entries(g.stockExchange?.portfolio || {})) {
    const stock = stocks[ticker];
    if (stock && holding.qty > 0) value += stock.price * holding.qty;
  }
  return value;
}

export function getShortLiability(g, stocks) {
  let liability = 0;
  for (const [ticker, pos] of Object.entries(g.stockExchange?.shortPositions || {})) {
    const stock = stocks[ticker];
    if (stock && pos && pos.qty > 0) liability += stock.price * pos.qty;
  }
  return liability;
}

export function generateScratchTicket() {
  const totalWeight = LOTTERY_PRIZES.reduce((a, p) => a + p.weight, 0);
  let roll = Math.random() * totalWeight;
  let prize = LOTTERY_PRIZES[0];
  for (const p of LOTTERY_PRIZES) { roll -= p.weight; if (roll <= 0) { prize = p; break; } }
  const symbols = LOTTERY_PRIZES.map(p => p.label);
  const winSymbol = prize.label;
  const cells = [];
  const winPositions = new Set();
  while (winPositions.size < LOTTERY_WIN_MATCH) winPositions.add(Math.floor(Math.random() * LOTTERY_SCRATCH_CELLS));
  for (let i = 0; i < LOTTERY_SCRATCH_CELLS; i++) {
    if (winPositions.has(i)) { cells.push(winSymbol); }
    else {
      let sym = symbols[Math.floor(Math.random() * symbols.length)];
      cells.push(sym === winSymbol ? symbols[(symbols.indexOf(sym) + 1) % symbols.length] : sym);
    }
  }
  return { cells, prize: prize.prize, prizeLabel: prize.label };
}

export function generateVinnieTip(stocks) {
  const tickers = Object.keys(stocks);
  if (tickers.length === 0) return null;
  const ticker = tickers[Math.floor(Math.random() * tickers.length)];
  const stock = stocks[ticker];
  const isAccurate = Math.random() < VINNIE_TIP_ACCURACY;
  const fundamentalPrice = stock.eps * (BASE_PE_RATIOS[stock.sector] || 7);
  const actualDirection = fundamentalPrice > stock.price ? 'up' : 'down';
  const tipDirection = isAccurate ? actualDirection : (actualDirection === 'up' ? 'down' : 'up');
  return {
    ticker, companyName: stock.companyName, direction: tipDirection,
    confidence: isAccurate ? R(70, 95) : R(40, 65),
    message: tipDirection === 'up'
      ? 'I got a hot tip... $' + ticker + ' is about to moon. Buy now!'
      : 'Between you and me, $' + ticker + ' is gonna tank. Sell while you can.',
  };
}
