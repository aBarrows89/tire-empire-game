import {
  initExchange, updateFundamentals, updateDailyPrice,
  matchOrders, refreshMarketMakerQuotes, recalculateETF,
  updateCommodityIndices, updateSentiment, distributeDividends,
  assessMonthlyFees, processMarginCalls, processShortPositions,
  expireOldOrders, calculateFundamentalPrice, processIPO,
} from './exchange.js';
import {
  DIVIDEND_FREQUENCY, IPO_MIN_REP, IPO_MIN_REVENUE, IPO_MIN_LOCATIONS,
  IPO_MIN_AGE, IPO_MIN_CASH, IPO_TOTAL_SHARES, COMMODITIES,
} from '../../shared/constants/exchange.js';
import { uid } from '../../shared/helpers/random.js';
import { getCalendar } from '../../shared/helpers/calendar.js';

/**
 * Generate daily market report with basic summary (all players) and premium-only analysis.
 */
function generateMarketReport(exchangeState, day) {
  const stocks = Object.values(exchangeState.stocks);
  if (stocks.length === 0) return null;

  // Basic summary: ticker, price, change for all stocks
  const basicSummary = stocks.map(s => ({
    ticker: s.ticker, companyName: s.companyName, price: s.price, change: s.change,
  }));

  // Top movers by |change|
  const topMovers = [...basicSummary].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);

  const sentiment = exchangeState.sentiment?.value || 1;
  const crashActive = exchangeState.sentiment?.crashActive || false;

  // Premium: sector analysis — avg change and EPS per sector
  const sectorMap = {};
  for (const s of stocks) {
    const sec = s.sector || 'Unknown';
    if (!sectorMap[sec]) sectorMap[sec] = { changes: [], eps: [] };
    sectorMap[sec].changes.push(s.change || 0);
    sectorMap[sec].eps.push(s.eps || 0);
  }
  const sectorAnalysis = Object.entries(sectorMap).map(([sector, data]) => ({
    sector,
    avgChange: +(data.changes.reduce((a, b) => a + b, 0) / data.changes.length).toFixed(2),
    avgEPS: +(data.eps.reduce((a, b) => a + b, 0) / data.eps.length).toFixed(2),
    count: data.changes.length,
  }));

  // Premium: price predictions based on momentum + fundamental pull + noise
  const predictions = stocks.map(s => {
    const momentum = (s.change || 0) * 0.4; // trend continuation
    const fundamentalPull = s.eps > 0 && s.price > 0
      ? ((s.eps * 7 - s.price) / s.price) * 10
      : 0;
    const noise = (Math.random() - 0.5) * 3;
    const raw = momentum + fundamentalPull + noise;
    const direction = raw > 0.5 ? 'up' : raw < -0.5 ? 'down' : 'neutral';
    const confidence = Math.min(90, Math.max(20, Math.round(50 + Math.abs(raw) * 5)));
    return { ticker: s.ticker, companyName: s.companyName, direction, confidence };
  });

  // Recent bankruptcies (last 30 days)
  const recentBankruptcies = (exchangeState.bankruptcies || []).filter(b => day - b.day <= 30);

  return { basicSummary, topMovers, sentiment, crashActive, sectorAnalysis, predictions, recentBankruptcies, day };
}

/**
 * Run one exchange tick — called from tickLoop after all simDay calls.
 * @param {object|null} exchangeState — current exchange state or null for first run
 * @param {Array} players — all active players [{id, game_state}]
 * @param {number} day — current game day
 * @returns {{ exchangeState, modifiedPlayers: [{id, game_state}] }}
 */
export function runExchangeTick(exchangeState, players, day, economy) {
  // Initialize on first run
  if (!exchangeState) {
    exchangeState = initExchange();
  }

  const modifiedPlayers = [];

  // One-time dedup scan: for any playerId with multiple stocks, keep highest listedDay
  if (!exchangeState._dedupDone) {
    const playerStocks = {};
    for (const [ticker, stock] of Object.entries(exchangeState.stocks)) {
      const pid = stock.playerId;
      if (!playerStocks[pid]) playerStocks[pid] = [];
      playerStocks[pid].push({ ticker, ipoDay: stock.ipoDay || 0 });
    }
    for (const entries of Object.values(playerStocks)) {
      if (entries.length <= 1) continue;
      entries.sort((a, b) => b.ipoDay - a.ipoDay);
      // Keep first (highest ipoDay), delete rest
      for (let i = 1; i < entries.length; i++) {
        delete exchangeState.stocks[entries[i].ticker];
        delete exchangeState.orderBooks[entries[i].ticker];
      }
    }
    exchangeState._dedupDone = true;
  }

  // 1. Update fundamentals for all listed stocks (remove orphaned stocks)
  for (const [ticker, stock] of Object.entries(exchangeState.stocks)) {
    const owner = players.find(p => p.id === stock.playerId);
    if (!owner) {
      // Player was deleted — delist their stock
      delete exchangeState.stocks[ticker];
      delete exchangeState.orderBooks[ticker];
      continue;
    }
    // Bankrupted stocks: freeze fundamentals at zero, auto-delist after 30 days
    if (stock.bankrupted) {
      if (day - (stock.bankruptDay || 0) > 30) {
        delete exchangeState.stocks[ticker];
        delete exchangeState.orderBooks[ticker];
        continue;
      }
      // Don't update fundamentals from fresh character — stock is dead
      stock._currentDay = day;
      continue;
    }
    updateFundamentals(stock, owner.game_state);
    stock._currentDay = day;
  }

  // 2. Refresh NPC market maker quotes
  for (const mm of exchangeState.marketMakers) {
    for (const [ticker, stock] of Object.entries(exchangeState.stocks)) {
      const orderBook = exchangeState.orderBooks[ticker];
      if (orderBook) {
        refreshMarketMakerQuotes(mm, stock, orderBook);
      }
    }
  }

  // 2b. Bot IPOs — eligible bot companies go public
  // Count current NPC stocks (cap at 10)
  const npcStockCount = Object.values(exchangeState.stocks).filter(s => s.isNPC).length;
  let npcIPOsThisTick = 0;

  for (const p of players) {
    const g = p.game_state;
    const isBot = g.isAI || g._botConfig;
    if (!isBot || !g.stockExchange) continue;
    if (g.stockExchange.isPublic) continue; // Already listed

    // Pre-check: if stock already exists for this player, restore and skip
    const existingStock = Object.values(exchangeState.stocks).find(s => s.playerId === g.id);
    if (existingStock) {
      g.stockExchange.isPublic = true;
      g.stockExchange.ticker = existingStock.ticker;
      delete g.stockExchange._pendingIPO;
      if (!modifiedPlayers.includes(p)) modifiedPlayers.push(p);
      continue;
    }

    // Cap NPC stocks at 10
    if (npcStockCount + npcIPOsThisTick >= 10) continue;

    // Check for pending IPO flag (set by botDecision.js) OR meet requirements directly
    const wantsIPO = g.stockExchange._pendingIPO;
    const meetsReqs = (g.reputation || 0) >= IPO_MIN_REP &&
        (g.totalRev || 0) >= IPO_MIN_REVENUE &&
        (g.locations || []).length >= IPO_MIN_LOCATIONS &&
        (g.day || 0) >= IPO_MIN_AGE &&
        (g.cash || 0) >= IPO_MIN_CASH;

    if (wantsIPO || meetsReqs) {
      try {
        const result = processIPO(g, exchangeState, day);
        if (!result.restored) {
          // Mark new NPC stock
          exchangeState.stocks[result.ticker].isNPC = true;
          npcIPOsThisTick++;
        }
        delete g.stockExchange._pendingIPO;
        if (!modifiedPlayers.includes(p)) modifiedPlayers.push(p);
      } catch (e) { /* skip failed IPO */ }
    }
  }

  // 2c. AI trading — place buy/sell orders
  const tickers = Object.keys(exchangeState.stocks);
  for (const p of players) {
    const g = p.game_state;
    if (!(g.isAI || g._botConfig) || !g._aiTradeIntent || tickers.length === 0) continue;
    const intent = g._aiTradeIntent;
    delete g._aiTradeIntent;

    // Pick a stock to trade — bias heavily toward player-issued stocks so real players get activity
    const playerTickers = tickers.filter(t => {
      const s = exchangeState.stocks[t];
      return s && s.playerId && s.playerId !== p.id; // Player-issued, not their own
    });
    const npcTickers = tickers.filter(t => !exchangeState.stocks[t]?.playerId);
    // 70% chance to trade a player stock if any exist, otherwise NPC stock
    const poolToUse = (playerTickers.length > 0 && Math.random() < 0.70) ? playerTickers : (npcTickers.length > 0 ? npcTickers : tickers.filter(t => exchangeState.stocks[t]?.playerId !== p.id));
    if (poolToUse.length === 0) continue;
    const ticker = poolToUse[Math.floor(Math.random() * poolToUse.length)];
    const stock = exchangeState.stocks[ticker];
    const orderBook = exchangeState.orderBooks[ticker];
    if (!stock || !orderBook || stock.playerId === p.id) continue;
    if (!orderBook.bids) orderBook.bids = [];
    if (!orderBook.asks) orderBook.asks = [];

    if (intent.action === 'buy' && intent.budget > 0 && stock.price > 0) {
      const qty = Math.max(1, Math.floor(intent.budget / stock.price));
      const maxQty = Math.floor(stock.floatShares * 0.05);
      const orderQty = Math.min(qty, maxQty);
      if (orderQty > 0 && g.cash >= orderQty * stock.price) {
        g.cash -= orderQty * stock.price;
        orderBook.bids.push({
          id: uid(), playerId: p.id, price: +(stock.price * (0.98 + Math.random() * 0.04)).toFixed(2),
          qty: orderQty, side: 'buy', placedDay: day, isNPC: false,
        });
        if (!modifiedPlayers.includes(p)) modifiedPlayers.push(p);
      }
    } else if (intent.action === 'sell') {
      const port = g.stockExchange?.portfolio || {};
      const holding = port[ticker];
      if (holding && holding.qty > 0) {
        const sellQty = Math.max(1, Math.floor(holding.qty * (0.1 + Math.random() * 0.2)));
        orderBook.asks.push({
          id: uid(), playerId: p.id, price: +(stock.price * (0.96 + Math.random() * 0.08)).toFixed(2),
          qty: sellQty, side: 'sell', placedDay: day, isNPC: false,
        });
        if (!modifiedPlayers.includes(p)) modifiedPlayers.push(p);
      }
    }
  }

  // 3. Match all pending orders
  for (const [ticker, stock] of Object.entries(exchangeState.stocks)) {
    const orderBook = exchangeState.orderBooks[ticker];
    if (!orderBook) continue;
    const fills = matchOrders(orderBook, stock, day);

    // Process fills — update player portfolios
    for (const fill of fills) {
      // Update buyer
      const buyer = players.find(p => p.id === fill.buyerId);
      if (buyer && buyer.game_state.stockExchange) {
        const bg = buyer.game_state;
        if (!bg.stockExchange.portfolio) bg.stockExchange.portfolio = {};
        const port = bg.stockExchange.portfolio;
        if (!port[ticker]) port[ticker] = { qty: 0, avgCost: 0, acquiredDay: day };
        const prev = port[ticker];
        const totalCost = prev.qty * prev.avgCost + fill.qty * fill.price;
        prev.qty += fill.qty;
        prev.avgCost = prev.qty > 0 ? totalCost / prev.qty : 0;
        if (!modifiedPlayers.includes(buyer)) modifiedPlayers.push(buyer);
      }

      // Update seller
      const seller = players.find(p => p.id === fill.sellerId);
      if (seller && seller.game_state.stockExchange) {
        const sg = seller.game_state;
        if (!sg.stockExchange.portfolio) sg.stockExchange.portfolio = {};
        const port = sg.stockExchange.portfolio;
        if (port[ticker]) {
          port[ticker].qty -= fill.qty;
          if (port[ticker].qty <= 0) delete port[ticker];
        }
        if (!modifiedPlayers.includes(seller)) modifiedPlayers.push(seller);
      }

      // Persist trade to stock trade log
      if (!exchangeState.stockTradeLogs) exchangeState.stockTradeLogs = {};
      if (!exchangeState.stockTradeLogs[ticker]) exchangeState.stockTradeLogs[ticker] = [];
      const buyerName = players.find(p => p.id === fill.buyerId)?.game_state?.companyName || 'Unknown';
      const sellerName = players.find(p => p.id === fill.sellerId)?.game_state?.companyName || 'Unknown';
      exchangeState.stockTradeLogs[ticker].unshift({
        day, buyerId: fill.buyerId, buyerName, sellerId: fill.sellerId, sellerName,
        qty: fill.qty, price: fill.price,
      });
      if (exchangeState.stockTradeLogs[ticker].length > 50) {
        exchangeState.stockTradeLogs[ticker] = exchangeState.stockTradeLogs[ticker].slice(0, 50);
      }

      // Notify the stock OWNER when their shares are traded
      const stockOwnerPlayer = players.find(p => p.id === stock.playerId);
      if (stockOwnerPlayer && !stockOwnerPlayer.game_state.isAI && !stockOwnerPlayer.game_state._botConfig) {
        const ownerState = stockOwnerPlayer.game_state;
        if (!ownerState._notifications) ownerState._notifications = [];
        const totalValue = fill.qty * fill.price;
        ownerState._notifications.push({
          id: `stk_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
          type: 'stock_trade',
          icon: '📈',
          title: `$${ticker} Trade`,
          message: `${buyerName} bought ${fill.qty} shares @ $${fill.price.toFixed(2)} ($${Math.round(totalValue).toLocaleString()})`,
          day,
          ts: Date.now(),
        });
        if (ownerState._notifications.length > 50) ownerState._notifications = ownerState._notifications.slice(-50);
        if (!modifiedPlayers.includes(stockOwnerPlayer)) modifiedPlayers.push(stockOwnerPlayer);
      }
    }
  }

  // 4. Update daily prices + OHLCV
  for (const [ticker, stock] of Object.entries(exchangeState.stocks)) {
    const orderBook = exchangeState.orderBooks[ticker];
    if (!exchangeState.sentiment) exchangeState.sentiment = { value: 1, trend: 0 };
    updateDailyPrice(stock, orderBook, exchangeState.sentiment.value);
  }

  // 4b. Update lastPrice on all player holdings so getWealth uses market price
  for (const p of players) {
    const port = p.game_state.stockExchange?.portfolio;
    if (!port) continue;
    let touched = false;
    for (const [ticker, holding] of Object.entries(port)) {
      if (!holding || holding.qty <= 0) continue;
      const stock = exchangeState.stocks[ticker];
      if (stock) {
        holding.lastPrice = stock.price;
        touched = true;
      }
    }
    if (touched && !modifiedPlayers.includes(p)) modifiedPlayers.push(p);
  }

  // 5. Recalculate ETFs
  for (const [ticker, etf] of Object.entries(exchangeState.etfs)) {
    recalculateETF(etf, exchangeState.stocks);
  }

  // 6. Update commodity indices — real supply/demand simulation
  // Migrate legacy commodities (RUBR/STEL/CHEM) to new format if needed
  if (exchangeState.commodities.RUBR && !exchangeState.commodities.rubber) {
    const newComm = {};
    for (const [id, def] of Object.entries(COMMODITIES)) {
      newComm[id] = {
        name: def.name, ticker: def.ticker, icon: def.icon, unit: def.unit,
        price: def.basePrice, basePrice: def.basePrice, change: 0,
        priceHistory: [], dailyVolume: 0,
        worldSupply: def.worldProductionPerDay,
        worldSupplyTarget: def.worldProductionPerDay,
        playerSupply: 0, totalDemand: 0,
        shortage: false, shortageDay: 0,
      };
    }
    exchangeState.commodities = newComm;
  }
  const factoryDemand = economy?.factoryDemand || { rubber: 0, steel: 0, chemicals: 0 };
  const aiSupplierDemand = economy?.aiSupplierDemand || { rubber: 50, steel: 80, chemicals: 60 };
  const activeGlobalEvents = economy?.activeGlobalEvents || [];
  const calendar = getCalendar(day);
  updateCommodityIndices(exchangeState.commodities, day, factoryDemand, aiSupplierDemand, activeGlobalEvents, calendar);

  // 7. Update sentiment, detect/apply crashes (bankruptcies factor into stability)
  if (!exchangeState.sentiment) exchangeState.sentiment = { value: 1, trend: 0 };
  updateSentiment(exchangeState.sentiment, exchangeState.stocks, day, exchangeState.bankruptcies);

  // 8. Weekly: distribute dividends
  if (day % DIVIDEND_FREQUENCY === 0 && day !== exchangeState.lastDividendDay) {
    distributeDividends(exchangeState.stocks, players, day);
    exchangeState.lastDividendDay = day;
    for (const p of players) {
      if (p.game_state.stockExchange?.hasBrokerage && !modifiedPlayers.includes(p)) {
        modifiedPlayers.push(p);
      }
    }
  }

  // 9. Monthly: assess brokerage fees, wealth tax
  if (day % 30 === 0) {
    assessMonthlyFees(players, exchangeState.stocks, day);
    for (const p of players) {
      if (p.game_state.stockExchange?.hasBrokerage && !modifiedPlayers.includes(p)) {
        modifiedPlayers.push(p);
      }
    }
  }

  // 10. Daily: check margin calls
  processMarginCalls(players, exchangeState.stocks, day);

  // 11. Daily: process short positions
  processShortPositions(players, exchangeState.stocks, day);

  // 12. Daily: expire old limit orders
  expireOldOrders(exchangeState.orderBooks, players, day);

  // 13. Calculate main index
  const stockValues = Object.values(exchangeState.stocks);
  if (stockValues.length > 0) {
    const totalMcap = stockValues.reduce((a, s) => a + s.price * s.totalShares, 0);
    exchangeState.indices.TESX = +(totalMcap / Math.max(1, stockValues.length) / 1000).toFixed(2);
  }

  // 14. Reset daily volume
  exchangeState.dayVolume = Object.values(exchangeState.orderBooks).reduce((a, ob) => a + (ob.dayVolume || 0), 0);
  for (const ob of Object.values(exchangeState.orderBooks)) {
    ob.dayVolume = 0;
  }

  // 15. Generate daily market report
  exchangeState.marketReport = generateMarketReport(exchangeState, day);

  return { exchangeState, modifiedPlayers };
}
