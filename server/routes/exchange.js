import { Router } from 'express';
import { getPlayer, savePlayerState, getGame, saveGame } from '../db/queries.js';
import { authMiddleware } from '../middleware/auth.js';
import { uid } from '../../shared/helpers/random.js';
import {
  initExchange, processIPO, calculateCommission, calculateCapGainsTax,
  getPortfolioValue, executeMarketOrder, executeLimitOrder,
  generateScratchTicket, generateVinnieTip,
} from '../engine/exchange.js';
import {
  BROKERAGE_MIN_REP, IPO_MIN_REP, IPO_MIN_REVENUE, IPO_MIN_LOCATIONS,
  IPO_MIN_AGE, IPO_MIN_CASH, MAX_OPEN_ORDERS, MAX_ORDER_PCT_FLOAT,
  TC_FEATURES, VINNIE_TIP_COST, LOTTERY_TICKET_COST,
  DIVIDEND_MAX_PAYOUT, CAP_GAINS_HOLD_THRESHOLD,
} from '../../shared/constants/exchange.js';
import { MONET } from '../../shared/constants/monetization.js';

const router = Router();

async function getExchangeState() {
  const game = await getGame();
  return game?.economy?.exchange || null;
}

async function saveExchangeState(exchangeState) {
  const game = await getGame();
  if (!game) return;
  const economy = game.economy || {};
  economy.exchange = exchangeState;
  await saveGame('default', game.day || game.week || 1, economy, game.ai_shops || [], game.liquidation || []);
}

function createDefaultExchangeState() {
  return {
    hasBrokerage: false, brokerageOpenedDay: null, portfolio: {}, openOrders: [], tradeHistory: [],
    marginEnabled: false, marginDebt: 0, marginCallDay: null, darkPoolAccess: false, advancedCharting: false,
    shortSellingEnabled: false, ipoPriority: false, realTimeAlerts: false, priceAlerts: [],
    dividendIncome: 0, capitalGains: 0, taxesPaid: 0, brokerageFeePaid: 0, wealthTaxPaid: 0,
    isPublic: false, ipoDay: null, ticker: null, dividendPayoutRatio: 0.25, founderSharesLocked: 0, shortPositions: {},
  };
}

router.post('/open-account', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (g.stockExchange?.hasBrokerage) return res.status(400).json({ error: 'Already have a brokerage account' });
    if ((g.reputation || 0) < BROKERAGE_MIN_REP) return res.status(400).json({ error: 'Need reputation ' + BROKERAGE_MIN_REP + '+' });
    if ((g.locations || []).length < 1) return res.status(400).json({ error: 'Need at least 1 location' });
    if (!g.stockExchange) g.stockExchange = createDefaultExchangeState();
    g.stockExchange.hasBrokerage = true;
    g.stockExchange.brokerageOpenedDay = g.day;
    g.log = g.log || [];
    g.log.push({ msg: 'Opened brokerage account at TESX', cat: 'exchange' });
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, state: g });
  } catch (err) { console.error('Exchange open-account error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/overview', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const exchangeState = await getExchangeState();
    if (!exchangeState) return res.json({ stocks: [], etfs: {}, commodities: {}, sentiment: 1, indices: {}, portfolio: null });
    const stocks = Object.values(exchangeState.stocks).map(s => ({
      ticker: s.ticker, companyName: s.companyName, price: s.price, change: s.change,
      sector: s.sector, eps: s.eps, totalShares: s.totalShares,
    }));
    const sorted = [...stocks].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    let portfolio = null;
    if (g.stockExchange?.hasBrokerage) {
      const portValue = getPortfolioValue(g, exchangeState.stocks);
      portfolio = {
        totalValue: portValue,
        positions: Object.entries(g.stockExchange.portfolio || {}).filter(([, h]) => h.qty > 0).map(([ticker, h]) => {
          const stock = exchangeState.stocks[ticker];
          return {
            ticker, qty: h.qty, avgCost: h.avgCost,
            currentPrice: stock?.price || 0,
            pnl: stock ? +((stock.price - h.avgCost) * h.qty).toFixed(2) : 0,
            dayChange: stock?.change || 0,
            companyName: stock?.companyName || ticker,
            priceHistory: stock?.priceHistory || [],
          };
        }),
        dividendIncome: g.stockExchange.dividendIncome || 0,
        taxesPaid: g.stockExchange.taxesPaid || 0,
      };
    }
    res.json({
      stocks, topMovers: sorted.slice(0, 5), etfs: exchangeState.etfs,
      commodities: exchangeState.commodities, sentiment: exchangeState.sentiment.value,
      crashActive: exchangeState.sentiment.crashActive, indices: exchangeState.indices,
      dayVolume: exchangeState.dayVolume, portfolio,
      marketReport: exchangeState.marketReport || null,
    });
  } catch (err) { console.error('Exchange overview error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/stocks', authMiddleware, async (req, res) => {
  try {
    const exchangeState = await getExchangeState();
    if (!exchangeState) return res.json({ stocks: [] });
    const stocks = Object.values(exchangeState.stocks).map(s => ({
      ticker: s.ticker, companyName: s.companyName, price: s.price, change: s.change,
      sector: s.sector, eps: s.eps, totalShares: s.totalShares, floatShares: s.floatShares,
      revenue: s.revenue, profit: s.profit, locations: s.locations, reputation: s.reputation,
      riskRating: s.riskRating || 'Unknown', dividendYield: s.dividendYield || 0,
      weeklyGrowth: s.weeklyGrowth || 0, companyAge: s.companyAge || 0,
    }));
    res.json({ stocks });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/stock/:ticker', authMiddleware, async (req, res) => {
  try {
    const exchangeState = await getExchangeState();
    if (!exchangeState) return res.status(404).json({ error: 'Exchange not initialized' });
    const stock = exchangeState.stocks[req.params.ticker];
    if (!stock) return res.status(404).json({ error: 'Stock not found' });
    const orderBook = exchangeState.orderBooks[req.params.ticker] || { bids: [], asks: [] };

    // Build investor prospectus from stock fundamentals
    const prospectus = {
      revenueBySegment: stock.revenueBySegment || {},
      revenueHistory: stock.revenueHistory || [],
      profitMargin: stock.profitMargin || 0,
      weeklyGrowth: stock.weeklyGrowth || 0,
      riskRating: stock.riskRating || 'Unknown',
      dividendYield: stock.dividendYield || 0,
      dividendPayoutRatio: stock.dividendPayoutRatio || 0,
      companyAge: stock.companyAge || 0,
      totalRevenue: stock.totalRevenue || 0,
      totalSold: stock.totalSold || 0,
      hasFactory: stock.hasFactory || false,
      hasEcom: stock.hasEcom || false,
      hasWholesale: stock.hasWholesale || false,
      staffCount: stock.staffCount || 0,
      bookValue: stock.bookValue || 0,
      bookValuePerShare: stock.totalShares > 0 ? (stock.bookValue || 0) / stock.totalShares : 0,
      peRatio: stock.eps > 0 ? +(stock.price / stock.eps).toFixed(2) : null,
    };

    res.json({
      stock: { ...stock },
      orderBook: {
        bids: (orderBook.bids || []).filter(o => !o.isNPC).slice(0, 10).map(o => ({ price: o.price, qty: o.qty })),
        asks: (orderBook.asks || []).filter(o => !o.isNPC).slice(0, 10).map(o => ({ price: o.price, qty: o.qty })),
        npcBids: (orderBook.bids || []).filter(o => o.isNPC).slice(0, 5).map(o => ({ price: o.price, qty: o.qty })),
        npcAsks: (orderBook.asks || []).filter(o => o.isNPC).slice(0, 5).map(o => ({ price: o.price, qty: o.qty })),
        lastTradePrice: orderBook.lastTradePrice,
      },
      priceHistory: stock.priceHistory || [],
      prospectus,
      tradeLogs: (exchangeState.stockTradeLogs?.[req.params.ticker] || []).slice(0, 30),
    });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/etfs', authMiddleware, async (req, res) => {
  try { const ex = await getExchangeState(); res.json({ etfs: ex?.etfs || {} }); }
  catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/commodities', authMiddleware, async (req, res) => {
  try { const ex = await getExchangeState(); res.json({ commodities: ex?.commodities || {} }); }
  catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/order', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.stockExchange?.hasBrokerage) return res.status(400).json({ error: 'Open a brokerage account first' });
    const { ticker, side, type, qty, limitPrice } = req.body;
    if (!ticker || !side || !qty) return res.status(400).json({ error: 'Missing required fields' });
    if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'Side must be buy or sell' });
    if (qty <= 0 || !Number.isInteger(qty)) return res.status(400).json({ error: 'Qty must be positive integer' });
    const exchangeState = await getExchangeState();
    if (!exchangeState) return res.status(400).json({ error: 'Exchange not initialized' });
    const stock = exchangeState.stocks[ticker];
    if (!stock) return res.status(400).json({ error: 'Stock not found' });
    const orderBook = exchangeState.orderBooks[ticker];
    if (!orderBook) return res.status(400).json({ error: 'Order book not found' });
    // Founders can sell up to their full holding; others limited to 10% of float
    const isFounder = g.stockExchange?.ticker === ticker;
    const maxQty = isFounder
      ? (g.stockExchange.portfolio?.[ticker]?.qty || Math.floor(stock.floatShares * MAX_ORDER_PCT_FLOAT))
      : Math.floor(stock.floatShares * MAX_ORDER_PCT_FLOAT);
    if (qty > maxQty) return res.status(400).json({ error: 'Max order size is ' + maxQty + ' shares' });
    if ((g.stockExchange.openOrders || []).length >= MAX_OPEN_ORDERS) return res.status(400).json({ error: 'Max ' + MAX_OPEN_ORDERS + ' open orders' });
    const game = await getGame();
    const day = game?.day || 1;
    const estimatedPrice = limitPrice || stock.price;
    const totalValue = estimatedPrice * qty;
    const commission = calculateCommission(totalValue, g.isPremium);
    if (side === 'buy' && g.cash < totalValue + commission) return res.status(400).json({ error: 'Not enough cash' });
    if (side === 'sell') {
      const holding = g.stockExchange.portfolio?.[ticker];
      if (!holding || holding.qty < qty) return res.status(400).json({ error: 'Not enough shares' });
    }
    let fills;
    if (type === 'limit' && limitPrice) {
      fills = executeLimitOrder(orderBook, side, limitPrice, qty, req.playerId, day);
      const filledQty = fills.reduce((a, f) => a + f.qty, 0);
      if (qty > filledQty) {
        g.stockExchange.openOrders = g.stockExchange.openOrders || [];
        g.stockExchange.openOrders.push({ id: uid(), ticker, side, type: 'limit', price: limitPrice, qty: qty - filledQty, day });
      }
    } else {
      fills = executeMarketOrder(orderBook, side, qty, req.playerId, day);
    }
    let totalFilled = 0, totalCost = 0;
    for (const fill of fills) { totalFilled += fill.qty; totalCost += fill.price * fill.qty; }
    // Market orders with no fills = no liquidity
    if (totalFilled === 0 && type !== 'limit') {
      return res.status(400).json({ error: `No ${side === 'buy' ? 'sellers' : 'buyers'} available for $${ticker}. Try a limit order instead.` });
    }
    if (totalFilled > 0) {
      const filledCommission = calculateCommission(totalCost, g.isPremium);
      if (side === 'buy') {
        g.cash -= totalCost + filledCommission;
        if (!g.stockExchange.portfolio) g.stockExchange.portfolio = {};
        if (!g.stockExchange.portfolio[ticker]) g.stockExchange.portfolio[ticker] = { qty: 0, avgCost: 0, acquiredDay: day };
        const prev = g.stockExchange.portfolio[ticker];
        const prevTotal = prev.qty * prev.avgCost;
        prev.qty += totalFilled;
        prev.avgCost = prev.qty > 0 ? (prevTotal + totalCost) / prev.qty : 0;
      } else {
        const holding = g.stockExchange.portfolio[ticker];
        const profit = (totalCost / totalFilled - holding.avgCost) * totalFilled;
        const holdDays = day - (holding.acquiredDay || 0);
        const capGainsTax = calculateCapGainsTax(profit, holdDays);
        g.cash += totalCost - filledCommission - capGainsTax;
        holding.qty -= totalFilled;
        if (holding.qty <= 0) delete g.stockExchange.portfolio[ticker];
        g.stockExchange.capitalGains = (g.stockExchange.capitalGains || 0) + profit;
        g.stockExchange.taxesPaid = (g.stockExchange.taxesPaid || 0) + capGainsTax + filledCommission;
      }
      g.stockExchange.tradeHistory = g.stockExchange.tradeHistory || [];
      g.stockExchange.tradeHistory.unshift({
        id: uid(), ticker, side, qty: totalFilled,
        avgPrice: +(totalCost / totalFilled).toFixed(2),
        commission: calculateCommission(totalCost, g.isPremium), day,
      });
      if (g.stockExchange.tradeHistory.length > 50) g.stockExchange.tradeHistory.pop();
      g.log = g.log || [];
      g.log.push({ msg: (side === 'buy' ? 'Bought' : 'Sold') + ' ' + totalFilled + ' $' + ticker + ' @ $' + (totalCost / totalFilled).toFixed(2), cat: 'exchange' });
    }
    await savePlayerState(req.playerId, g);
    await saveExchangeState(exchangeState);
    res.json({ ok: true, filled: totalFilled, fills, state: g });
  } catch (err) { console.error('Exchange order error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/cancel-order', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const { orderId } = req.body;
    if (!g.stockExchange?.openOrders) return res.status(400).json({ error: 'No open orders' });
    const idx = g.stockExchange.openOrders.findIndex(o => o.id === orderId);
    if (idx === -1) return res.status(400).json({ error: 'Order not found' });
    const order = g.stockExchange.openOrders[idx];
    const exchangeState = await getExchangeState();
    if (exchangeState) {
      const book = exchangeState.orderBooks[order.ticker];
      if (book) {
        const bookSide = order.side === 'buy' ? 'bids' : 'asks';
        book[bookSide] = (book[bookSide] || []).filter(o => o.id !== orderId);
        await saveExchangeState(exchangeState);
      }
    }
    g.stockExchange.openOrders.splice(idx, 1);
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    res.json({ openOrders: g.stockExchange?.openOrders || [], tradeHistory: g.stockExchange?.tradeHistory || [] });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/portfolio', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const exchangeState = await getExchangeState();
    const stocks = exchangeState?.stocks || {};
    const positions = Object.entries(g.stockExchange?.portfolio || {}).filter(([, h]) => h.qty > 0).map(([ticker, h]) => {
      const stock = stocks[ticker];
      return { ticker, qty: h.qty, avgCost: h.avgCost, acquiredDay: h.acquiredDay, currentPrice: stock?.price || 0,
        pnl: stock ? +((stock.price - h.avgCost) * h.qty).toFixed(2) : 0, dayChange: stock?.change || 0,
        priceHistory: stock?.priceHistory?.slice(-30).map(h2 => h2.close) || [] };
    });
    res.json({
      positions, totalValue: positions.reduce((a, p) => a + p.currentPrice * p.qty, 0),
      totalPnl: positions.reduce((a, p) => a + p.pnl, 0),
      dividendIncome: g.stockExchange?.dividendIncome || 0, capitalGains: g.stockExchange?.capitalGains || 0,
      taxesPaid: g.stockExchange?.taxesPaid || 0, wealthTaxPaid: g.stockExchange?.wealthTaxPaid || 0,
      brokerageFeePaid: g.stockExchange?.brokerageFeePaid || 0, openOrders: g.stockExchange?.openOrders || [],
      shortPositions: g.stockExchange?.shortPositions || {}, marginDebt: g.stockExchange?.marginDebt || 0,
    });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json({ trades: player.game_state.stockExchange?.tradeHistory || [] });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/ipo/apply', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.stockExchange?.hasBrokerage) return res.status(400).json({ error: 'Need brokerage account' });
    if (g.stockExchange.isPublic) return res.status(400).json({ error: 'Already public' });
    if ((g.reputation || 0) < IPO_MIN_REP) return res.status(400).json({ error: 'Need reputation ' + IPO_MIN_REP + '+' });
    if ((g.totalRev || 0) < IPO_MIN_REVENUE) return res.status(400).json({ error: 'Need $' + IPO_MIN_REVENUE + ' total revenue' });
    if ((g.locations || []).length < IPO_MIN_LOCATIONS) return res.status(400).json({ error: 'Need ' + IPO_MIN_LOCATIONS + '+ locations' });
    if ((g.day || 0) < IPO_MIN_AGE) return res.status(400).json({ error: 'Company must be at least ' + IPO_MIN_AGE + ' days old' });
    if ((g.cash || 0) < IPO_MIN_CASH) return res.status(400).json({ error: 'Need $' + IPO_MIN_CASH + '+ cash' });
    const { dividendPayoutRatio } = req.body;
    g.stockExchange.dividendPayoutRatio = Math.max(0, Math.min(DIVIDEND_MAX_PAYOUT, Number(dividendPayoutRatio) || 0.25));
    let exchangeState = await getExchangeState();
    if (!exchangeState) exchangeState = initExchange();
    const game = await getGame();
    const day = game?.day || 1;
    const result = processIPO(g, exchangeState, day);
    g.log = g.log || [];
    g.log.push({ msg: 'IPO! $' + result.ticker + ' listed at $' + result.initialPrice + '/share. Fee: $' + result.listingFee, cat: 'exchange' });
    await savePlayerState(req.playerId, g);
    await saveExchangeState(exchangeState);
    res.json({ ok: true, ...result, state: g });
  } catch (err) { console.error('Exchange IPO error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/ipo/status', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const se = player.game_state.stockExchange || {};
    res.json({ isPublic: se.isPublic || false, ticker: se.ticker, ipoDay: se.ipoDay, founderSharesLocked: se.founderSharesLocked || 0, dividendPayoutRatio: se.dividendPayoutRatio || 0.25 });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/ipo/set-dividend-ratio', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.stockExchange?.isPublic) return res.status(400).json({ error: 'Not a public company' });
    const { ratio } = req.body;
    g.stockExchange.dividendPayoutRatio = Math.max(0, Math.min(DIVIDEND_MAX_PAYOUT, Number(ratio) || 0.25));
    const exchangeState = await getExchangeState();
    if (exchangeState && g.stockExchange.ticker) {
      const stock = exchangeState.stocks[g.stockExchange.ticker];
      if (stock) stock.dividendPayoutRatio = g.stockExchange.dividendPayoutRatio;
      await saveExchangeState(exchangeState);
    }
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/unlock', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.stockExchange?.hasBrokerage) return res.status(400).json({ error: 'Need brokerage account' });
    const { feature } = req.body;
    const feat = TC_FEATURES[feature];
    if (!feat) return res.status(400).json({ error: 'Invalid feature' });
    if ((g.tireCoins || 0) < feat.cost) return res.status(400).json({ error: 'Need ' + feat.cost + ' TC' });
    const featureMap = { margin: 'marginEnabled', darkPool: 'darkPoolAccess', shortSelling: 'shortSellingEnabled', charting: 'advancedCharting', alerts: 'realTimeAlerts', ipoPriority: 'ipoPriority' };
    const stateKey = featureMap[feature];
    if (!stateKey) return res.status(400).json({ error: 'Unknown feature' });
    if (g.stockExchange[stateKey]) return res.status(400).json({ error: 'Already unlocked' });
    g.tireCoins -= feat.cost;
    g.stockExchange[stateKey] = true;
    g.log = g.log || [];
    g.log.push({ msg: 'Unlocked ' + feat.label + ' for ' + feat.cost + ' TC', cat: 'exchange' });
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/dark-pool-order', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.stockExchange?.darkPoolAccess) return res.status(400).json({ error: 'Unlock dark pool access first' });
    const { ticker, side, qty } = req.body;
    const exchangeState = await getExchangeState();
    if (!exchangeState) return res.status(400).json({ error: 'Exchange not initialized' });
    const stock = exchangeState.stocks[ticker];
    if (!stock) return res.status(400).json({ error: 'Stock not found' });
    const price = stock.price;
    const totalValue = price * qty;
    const commission = calculateCommission(totalValue, g.isPremium);
    if (side === 'buy') {
      if (g.cash < totalValue + commission) return res.status(400).json({ error: 'Not enough cash' });
      g.cash -= totalValue + commission;
      if (!g.stockExchange.portfolio[ticker]) g.stockExchange.portfolio[ticker] = { qty: 0, avgCost: 0, acquiredDay: g.day };
      const prev = g.stockExchange.portfolio[ticker];
      const prevTotal = prev.qty * prev.avgCost;
      prev.qty += qty; prev.avgCost = (prevTotal + totalValue) / prev.qty;
    } else {
      const holding = g.stockExchange.portfolio?.[ticker];
      if (!holding || holding.qty < qty) return res.status(400).json({ error: 'Not enough shares' });
      g.cash += totalValue - commission;
      holding.qty -= qty; if (holding.qty <= 0) delete g.stockExchange.portfolio[ticker];
    }
    g.log = g.log || [];
    g.log.push({ msg: 'Dark pool: ' + side + ' ' + qty + ' $' + ticker + ' @ $' + price.toFixed(2), cat: 'exchange' });
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, price, qty, commission, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/set-alert', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.stockExchange?.realTimeAlerts) return res.status(400).json({ error: 'Unlock price alerts first' });
    const { ticker, targetPrice, direction } = req.body;
    if (!g.stockExchange.priceAlerts) g.stockExchange.priceAlerts = [];
    if (g.stockExchange.priceAlerts.length >= 10) return res.status(400).json({ error: 'Max 10 alerts' });
    g.stockExchange.priceAlerts.push({ id: uid(), ticker, targetPrice, direction, active: true });
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/vinnie-tip', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if ((g.tireCoins || 0) < VINNIE_TIP_COST) return res.status(400).json({ error: 'Need ' + VINNIE_TIP_COST + ' TC' });
    const exchangeState = await getExchangeState();
    if (!exchangeState || Object.keys(exchangeState.stocks).length === 0) return res.status(400).json({ error: 'No stocks listed yet' });
    g.tireCoins -= VINNIE_TIP_COST;
    const tip = generateVinnieTip(exchangeState.stocks);
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, tip, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/short-sell', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if (!g.stockExchange?.shortSellingEnabled) return res.status(400).json({ error: 'Unlock short selling first' });
    const { ticker, qty } = req.body;
    const exchangeState = await getExchangeState();
    if (!exchangeState) return res.status(400).json({ error: 'Exchange not initialized' });
    const stock = exchangeState.stocks[ticker];
    if (!stock) return res.status(400).json({ error: 'Stock not found' });
    const collateral = stock.price * qty * 1.5;
    if (g.cash < collateral) return res.status(400).json({ error: 'Need $' + Math.round(collateral) + ' collateral' });
    if (!g.stockExchange.shortPositions) g.stockExchange.shortPositions = {};
    if (g.stockExchange.shortPositions[ticker]) return res.status(400).json({ error: 'Already have a short position' });
    g.cash += stock.price * qty;
    g.stockExchange.shortPositions[ticker] = { qty, openPrice: stock.price, openDay: g.day };
    g.log = g.log || [];
    g.log.push({ msg: 'Short sold ' + qty + ' $' + ticker + ' @ $' + stock.price.toFixed(2), cat: 'exchange' });
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/cover-short', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const { ticker } = req.body;
    const pos = g.stockExchange?.shortPositions?.[ticker];
    if (!pos) return res.status(400).json({ error: 'No short position' });
    const exchangeState = await getExchangeState();
    const stock = exchangeState?.stocks[ticker];
    if (!stock) return res.status(400).json({ error: 'Stock not found' });
    const coverCost = stock.price * pos.qty;
    g.cash -= coverCost;
    const pnl = (pos.openPrice - stock.price) * pos.qty;
    if (pnl > 0) { const tax = calculateCapGainsTax(pnl, 0); g.cash -= tax; g.stockExchange.taxesPaid = (g.stockExchange.taxesPaid || 0) + tax; }
    delete g.stockExchange.shortPositions[ticker];
    g.log = g.log || [];
    g.log.push({ msg: 'Covered short on $' + ticker + ': ' + (pnl >= 0 ? '+' : '') + '$' + Math.round(pnl), cat: 'exchange' });
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, pnl, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/scratch-ticket', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    if ((g.tireCoins || 0) < LOTTERY_TICKET_COST) return res.status(400).json({ error: 'Need ' + LOTTERY_TICKET_COST + ' TC' });
    g.tireCoins -= LOTTERY_TICKET_COST;
    const ticket = generateScratchTicket();
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, ticket, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/scratch-ticket/claim', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const { prize } = req.body;
    if (!prize || prize <= 0) return res.status(400).json({ error: 'Invalid prize' });
    const clampedPrize = Math.min(prize, 5000000);
    g.cash += clampedPrize;
    g.log = g.log || [];
    g.log.push({ msg: 'Scratch ticket winner! +$' + clampedPrize.toLocaleString(), cat: 'exchange' });
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, prize: clampedPrize, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// ── TC Marketplace (Section 14e) ──

// Get TC marketplace listings + trade history
router.get('/tc-market', authMiddleware, async (req, res) => {
  try {
    const game = await getGame();
    const mkt = game?.economy?.tcMarketplace || { listings: [], tradeHistory: [] };
    const fairValue = game?.economy?.tcValue || 50000;
    const activeListings = (mkt.listings || []).filter(l => l.status === 'active');
    const sellOrders = activeListings.filter(l => l.type === 'tc_sell').sort((a, b) => a.pricePerTc - b.pricePerTc);
    const buyOrders = activeListings.filter(l => l.type === 'tc_buy').sort((a, b) => b.pricePerTc - a.pricePerTc);
    res.json({
      sellOrders, buyOrders, fairValue,
      tradeHistory: (mkt.tradeHistory || []).slice(0, 50),
      reserve: {
        cashBalance: Math.round(game?.economy?.tcReserve?.cashBalance || 0),
        tcHoldings: game?.economy?.tcReserve?.tcHoldings || 0,
      },
    });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// List TC for sale
router.post('/tc-market/sell', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const { tcAmount, askingPrice } = req.body;
    const mkt = MONET.tcMarketplace;
    const game = await getGame();
    const day = game?.day || 1;
    const fairValue = game?.economy?.tcValue || 50000;
    const tcMkt = game?.economy?.tcMarketplace || { listings: [], tradeHistory: [] };

    // Validation
    if (!tcAmount || tcAmount < mkt.minListing) return res.status(400).json({ error: `Minimum listing: ${mkt.minListing} TC` });
    if ((g.tireCoins || 0) < tcAmount) return res.status(400).json({ error: 'Not enough TC' });
    if (tcAmount > Math.floor((g.tireCoins || 0) * mkt.maxListingPct)) return res.status(400).json({ error: `Max ${Math.round(mkt.maxListingPct * 100)}% of your TC balance per listing` });
    const pricePerTc = askingPrice / tcAmount;
    if (pricePerTc < fairValue * (1 - mkt.priceRangeLimit) || pricePerTc > fairValue * (1 + mkt.priceRangeLimit)) {
      return res.status(400).json({ error: `Price must be within ±${Math.round(mkt.priceRangeLimit * 100)}% of fair value ($${fairValue})` });
    }
    // Cooldown check
    const recentListing = tcMkt.listings.find(l => l.sellerId === req.playerId && l.listedDay === day);
    if (recentListing) return res.status(400).json({ error: 'Only 1 TC listing per day' });

    // Deduct TC and create listing
    g.tireCoins -= tcAmount;
    const listing = {
      id: uid(), type: 'tc_sell', sellerId: req.playerId,
      sellerName: g.companyName || g.name || 'Unknown',
      tcAmount, askingPrice: Math.round(askingPrice),
      pricePerTc: Math.round(pricePerTc),
      listedDay: day, expiresDay: day + mkt.listingDurationDays,
      status: 'active', offers: [],
    };
    tcMkt.listings.push(listing);

    // Check for matching buy orders
    const matchedBuys = tcMkt.listings
      .filter(l => l.type === 'tc_buy' && l.status === 'active' && l.pricePerTc >= pricePerTc)
      .sort((a, b) => b.pricePerTc - a.pricePerTc);

    let remainingTC = tcAmount;
    for (const buy of matchedBuys) {
      if (remainingTC <= 0) break;
      const fillQty = Math.min(remainingTC, buy.tcAmount);
      const fillPrice = buy.pricePerTc * fillQty;
      const fee = Math.round(fillPrice * (g.isPremium ? mkt.sellerFeePremium : mkt.sellerFee));
      g.cash += fillPrice - fee;

      // Credit buyer
      const buyer = await getPlayer(buy.buyerId);
      if (buyer) {
        buyer.game_state.tireCoins = (buyer.game_state.tireCoins || 0) + fillQty;
        buyer.game_state.log = buyer.game_state.log || [];
        buyer.game_state.log.push({ msg: `TC Market: Bought ${fillQty} TC for $${fillPrice.toLocaleString()}`, cat: 'exchange' });
        await savePlayerState(buy.buyerId, buyer.game_state);
      }

      // Fee goes to reserve
      if (game.economy.tcReserve) game.economy.tcReserve.cashBalance += fee;

      // Record trade
      tcMkt.tradeHistory.unshift({ day, qty: fillQty, pricePerTc: buy.pricePerTc, buyerId: buy.buyerId, sellerId: req.playerId });
      if (tcMkt.tradeHistory.length > 100) tcMkt.tradeHistory.pop();

      buy.tcAmount -= fillQty;
      if (buy.tcAmount <= 0) buy.status = 'filled';
      remainingTC -= fillQty;

      g.log = g.log || [];
      g.log.push({ msg: `TC Market: Sold ${fillQty} TC for $${fillPrice.toLocaleString()} (-$${fee} fee)`, cat: 'exchange' });
    }

    // Update listing with remaining
    if (remainingTC <= 0) {
      listing.status = 'filled';
    } else {
      listing.tcAmount = remainingTC;
      listing.askingPrice = Math.round(remainingTC * pricePerTc);
    }

    game.economy.tcMarketplace = tcMkt;
    await saveGame('default', day, game.economy, game.ai_shops || [], game.liquidation || []);
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, listing, state: g });
  } catch (err) { console.error('TC sell error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// Post TC buy order
router.post('/tc-market/buy', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const { tcAmount, bidPrice } = req.body;
    const mkt = MONET.tcMarketplace;
    const game = await getGame();
    const day = game?.day || 1;
    const fairValue = game?.economy?.tcValue || 50000;
    const tcMkt = game?.economy?.tcMarketplace || { listings: [], tradeHistory: [] };

    if (!tcAmount || tcAmount < mkt.minListing) return res.status(400).json({ error: `Minimum order: ${mkt.minListing} TC` });
    if ((g.cash || 0) < bidPrice) return res.status(400).json({ error: 'Not enough cash' });
    const pricePerTc = bidPrice / tcAmount;
    if (pricePerTc < fairValue * (1 - mkt.priceRangeLimit) || pricePerTc > fairValue * (1 + mkt.priceRangeLimit)) {
      return res.status(400).json({ error: `Price must be within ±${Math.round(mkt.priceRangeLimit * 100)}% of fair value ($${fairValue})` });
    }
    const recentListing = tcMkt.listings.find(l => l.buyerId === req.playerId && l.listedDay === day);
    if (recentListing) return res.status(400).json({ error: 'Only 1 TC listing per day' });

    g.cash -= Math.round(bidPrice);
    const listing = {
      id: uid(), type: 'tc_buy', buyerId: req.playerId,
      buyerName: g.companyName || g.name || 'Unknown',
      tcAmount, bidPrice: Math.round(bidPrice),
      pricePerTc: Math.round(pricePerTc),
      listedDay: day, expiresDay: day + mkt.listingDurationDays,
      status: 'active', offers: [],
    };
    tcMkt.listings.push(listing);

    // Check for matching sell orders
    const matchedSells = tcMkt.listings
      .filter(l => l.type === 'tc_sell' && l.status === 'active' && l.pricePerTc <= pricePerTc)
      .sort((a, b) => a.pricePerTc - b.pricePerTc);

    let remainingTC = tcAmount;
    let totalSpent = 0;
    for (const sell of matchedSells) {
      if (remainingTC <= 0) break;
      const fillQty = Math.min(remainingTC, sell.tcAmount);
      const fillPrice = sell.pricePerTc * fillQty;
      totalSpent += fillPrice;

      // Credit seller (minus fee)
      const seller = await getPlayer(sell.sellerId);
      if (seller) {
        const sellerFee = Math.round(fillPrice * (seller.game_state.isPremium ? mkt.sellerFeePremium : mkt.sellerFee));
        seller.game_state.cash += fillPrice - sellerFee;
        seller.game_state.log = seller.game_state.log || [];
        seller.game_state.log.push({ msg: `TC Market: Sold ${fillQty} TC for $${fillPrice.toLocaleString()} (-$${sellerFee} fee)`, cat: 'exchange' });
        await savePlayerState(sell.sellerId, seller.game_state);
        if (game.economy.tcReserve) game.economy.tcReserve.cashBalance += sellerFee;
      }

      g.tireCoins = (g.tireCoins || 0) + fillQty;

      tcMkt.tradeHistory.unshift({ day, qty: fillQty, pricePerTc: sell.pricePerTc, buyerId: req.playerId, sellerId: sell.sellerId });
      if (tcMkt.tradeHistory.length > 100) tcMkt.tradeHistory.pop();

      sell.tcAmount -= fillQty;
      if (sell.tcAmount <= 0) sell.status = 'filled';
      remainingTC -= fillQty;

      g.log = g.log || [];
      g.log.push({ msg: `TC Market: Bought ${fillQty} TC for $${Math.round(fillPrice).toLocaleString()}`, cat: 'exchange' });
    }

    // Refund unspent cash if partially filled but listing stays open
    if (remainingTC < tcAmount && remainingTC > 0) {
      listing.tcAmount = remainingTC;
      listing.bidPrice = Math.round(remainingTC * pricePerTc);
    } else if (remainingTC <= 0) {
      listing.status = 'filled';
      // Refund excess (bid was at higher price than fills)
      const refund = Math.round(bidPrice) - Math.round(totalSpent);
      if (refund > 0) g.cash += refund;
    }

    game.economy.tcMarketplace = tcMkt;
    await saveGame('default', day, game.economy, game.ai_shops || [], game.liquidation || []);
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, listing, state: g });
  } catch (err) { console.error('TC buy error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// Accept an existing TC listing (one-click match)
router.post('/tc-market/accept', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const { listingId } = req.body;
    const game = await getGame();
    const day = game?.day || 1;
    const tcMkt = game?.economy?.tcMarketplace || { listings: [], tradeHistory: [] };
    const mkt = MONET.tcMarketplace;

    const listing = tcMkt.listings.find(l => l.id === listingId && l.status === 'active');
    if (!listing) return res.status(400).json({ error: 'Listing not found or no longer active' });

    if (listing.type === 'tc_sell') {
      // Buyer accepts a sell listing
      if (listing.sellerId === req.playerId) return res.status(400).json({ error: 'Cannot buy your own listing' });
      if ((g.cash || 0) < listing.askingPrice) return res.status(400).json({ error: 'Not enough cash' });

      g.cash -= listing.askingPrice;
      g.tireCoins = (g.tireCoins || 0) + listing.tcAmount;

      // Pay seller minus fee
      const seller = await getPlayer(listing.sellerId);
      if (seller) {
        const fee = Math.round(listing.askingPrice * (seller.game_state.isPremium ? mkt.sellerFeePremium : mkt.sellerFee));
        seller.game_state.cash += listing.askingPrice - fee;
        seller.game_state.log = seller.game_state.log || [];
        seller.game_state.log.push({ msg: `TC Market: Sold ${listing.tcAmount} TC for $${listing.askingPrice.toLocaleString()} (-$${fee} fee)`, cat: 'exchange' });
        await savePlayerState(listing.sellerId, seller.game_state);
        if (game.economy.tcReserve) game.economy.tcReserve.cashBalance += fee;
      }

      g.log = g.log || [];
      g.log.push({ msg: `TC Market: Bought ${listing.tcAmount} TC for $${listing.askingPrice.toLocaleString()}`, cat: 'exchange' });
      listing.status = 'filled';
      tcMkt.tradeHistory.unshift({ day, qty: listing.tcAmount, pricePerTc: listing.pricePerTc, buyerId: req.playerId, sellerId: listing.sellerId });

    } else if (listing.type === 'tc_buy') {
      // Seller accepts a buy listing
      if (listing.buyerId === req.playerId) return res.status(400).json({ error: 'Cannot sell to your own listing' });
      if ((g.tireCoins || 0) < listing.tcAmount) return res.status(400).json({ error: 'Not enough TC' });

      const fee = Math.round(listing.bidPrice * (g.isPremium ? mkt.sellerFeePremium : mkt.sellerFee));
      g.tireCoins -= listing.tcAmount;
      g.cash += listing.bidPrice - fee;

      // Credit buyer with TC
      const buyer = await getPlayer(listing.buyerId);
      if (buyer) {
        buyer.game_state.tireCoins = (buyer.game_state.tireCoins || 0) + listing.tcAmount;
        buyer.game_state.log = buyer.game_state.log || [];
        buyer.game_state.log.push({ msg: `TC Market: Bought ${listing.tcAmount} TC for $${listing.bidPrice.toLocaleString()}`, cat: 'exchange' });
        await savePlayerState(listing.buyerId, buyer.game_state);
      }
      if (game.economy.tcReserve) game.economy.tcReserve.cashBalance += fee;

      g.log = g.log || [];
      g.log.push({ msg: `TC Market: Sold ${listing.tcAmount} TC for $${listing.bidPrice.toLocaleString()} (-$${fee} fee)`, cat: 'exchange' });
      listing.status = 'filled';
      tcMkt.tradeHistory.unshift({ day, qty: listing.tcAmount, pricePerTc: listing.pricePerTc, buyerId: listing.buyerId, sellerId: req.playerId });
    }

    if (tcMkt.tradeHistory.length > 100) tcMkt.tradeHistory.pop();
    game.economy.tcMarketplace = tcMkt;
    await saveGame('default', day, game.economy, game.ai_shops || [], game.liquidation || []);
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, state: g });
  } catch (err) { console.error('TC accept error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// Cancel own TC listing
router.post('/tc-market/cancel', authMiddleware, async (req, res) => {
  try {
    const player = await getPlayer(req.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;
    const { listingId } = req.body;
    const game = await getGame();
    const day = game?.day || 1;
    const tcMkt = game?.economy?.tcMarketplace || { listings: [], tradeHistory: [] };

    const listing = tcMkt.listings.find(l => l.id === listingId && l.status === 'active');
    if (!listing) return res.status(400).json({ error: 'Listing not found' });

    // Verify ownership
    if (listing.type === 'tc_sell' && listing.sellerId !== req.playerId) return res.status(403).json({ error: 'Not your listing' });
    if (listing.type === 'tc_buy' && listing.buyerId !== req.playerId) return res.status(403).json({ error: 'Not your listing' });

    // Refund
    if (listing.type === 'tc_sell') {
      g.tireCoins = (g.tireCoins || 0) + listing.tcAmount;
    } else {
      g.cash += listing.bidPrice;
    }

    listing.status = 'cancelled';
    game.economy.tcMarketplace = tcMkt;
    await saveGame('default', day, game.economy, game.ai_shops || [], game.liquidation || []);
    await savePlayerState(req.playerId, g);
    res.json({ ok: true, state: g });
  } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
