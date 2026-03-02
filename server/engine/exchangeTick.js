import {
  initExchange, updateFundamentals, updateDailyPrice,
  matchOrders, refreshMarketMakerQuotes, recalculateETF,
  updateCommodityIndices, updateSentiment, distributeDividends,
  assessMonthlyFees, processMarginCalls, processShortPositions,
  expireOldOrders, calculateFundamentalPrice, processIPO,
} from './exchange.js';
import {
  DIVIDEND_FREQUENCY, IPO_MIN_REP, IPO_MIN_REVENUE, IPO_MIN_LOCATIONS,
  IPO_MIN_AGE, IPO_MIN_CASH, IPO_TOTAL_SHARES,
} from '../../shared/constants/exchange.js';
import { uid } from '../../shared/helpers/random.js';

/**
 * Run one exchange tick — called from tickLoop after all simDay calls.
 * @param {object|null} exchangeState — current exchange state or null for first run
 * @param {Array} players — all active players [{id, game_state}]
 * @param {number} day — current game day
 * @returns {{ exchangeState, modifiedPlayers: [{id, game_state}] }}
 */
export function runExchangeTick(exchangeState, players, day) {
  // Initialize on first run
  if (!exchangeState) {
    exchangeState = initExchange();
  }

  const modifiedPlayers = [];

  // 1. Update fundamentals for all listed stocks
  for (const [ticker, stock] of Object.entries(exchangeState.stocks)) {
    const owner = players.find(p => p.id === stock.playerId);
    if (owner) {
      updateFundamentals(stock, owner.game_state);
    }
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

  // 2b. AI IPOs — eligible AI companies go public
  for (const p of players) {
    const g = p.game_state;
    if (!g.isAI || !g.stockExchange || g.stockExchange.isPublic) continue;
    if ((g.reputation || 0) >= IPO_MIN_REP &&
        (g.totalRev || 0) >= IPO_MIN_REVENUE &&
        (g.locations || []).length >= IPO_MIN_LOCATIONS &&
        (g.day || 0) >= IPO_MIN_AGE &&
        (g.cash || 0) >= IPO_MIN_CASH) {
      try {
        processIPO(g, exchangeState, day);
        if (!modifiedPlayers.includes(p)) modifiedPlayers.push(p);
      } catch (e) { /* skip failed IPO */ }
    }
  }

  // 2c. AI trading — place buy/sell orders
  const tickers = Object.keys(exchangeState.stocks);
  for (const p of players) {
    const g = p.game_state;
    if (!g.isAI || !g._aiTradeIntent || tickers.length === 0) continue;
    const intent = g._aiTradeIntent;
    delete g._aiTradeIntent;

    // Pick a random stock to trade
    const ticker = tickers[Math.floor(Math.random() * tickers.length)];
    const stock = exchangeState.stocks[ticker];
    const orderBook = exchangeState.orderBooks[ticker];
    if (!stock || !orderBook || stock.playerId === p.id) continue;

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
        const port = sg.stockExchange.portfolio;
        if (port[ticker]) {
          port[ticker].qty -= fill.qty;
          if (port[ticker].qty <= 0) delete port[ticker];
        }
        if (!modifiedPlayers.includes(seller)) modifiedPlayers.push(seller);
      }
    }
  }

  // 4. Update daily prices + OHLCV
  for (const [ticker, stock] of Object.entries(exchangeState.stocks)) {
    const orderBook = exchangeState.orderBooks[ticker];
    updateDailyPrice(stock, orderBook, exchangeState.sentiment.value);
  }

  // 5. Recalculate ETFs
  for (const [ticker, etf] of Object.entries(exchangeState.etfs)) {
    recalculateETF(etf, exchangeState.stocks);
  }

  // 6. Update commodity indices
  updateCommodityIndices(exchangeState.commodities);

  // 7. Update sentiment, detect/apply crashes
  updateSentiment(exchangeState.sentiment, exchangeState.stocks, day);

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

  return { exchangeState, modifiedPlayers };
}
