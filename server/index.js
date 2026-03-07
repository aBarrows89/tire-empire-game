import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { PORT, CORS_ORIGIN, NODE_ENV, FIREBASE_PROJECT_ID, FIREBASE_API_KEY } from './config.js';
import { startTickLoop, stopTickLoop, setTickSpeed, getTickSpeed, isTickRunning, getTickStats } from './tick/tickLoop.js';
import { handleConnection, startHeartbeat } from './ws/handler.js';
import { getAllActivePlayers, addShopSaleListing, getShopSaleListings, runSchemaMigration } from './db/queries.js';
import { CITIES } from '../shared/constants/cities.js';
import { TIRES } from '../shared/constants/tires.js';
import { shopRent } from '../shared/constants/shop.js';
import { PAY } from '../shared/constants/staff.js';
import { getShopValuation } from '../shared/constants/shopSale.js';
import { uid } from '../shared/helpers/random.js';
import stateRouter from './routes/state.js';
import actionRouter from './routes/action.js';
import marketRouter from './routes/market.js';
import leaderboardRouter from './routes/leaderboard.js';
import profileRouter from './routes/profile.js';
import tradeRouter from './routes/trade.js';
import tournamentRouter from './routes/tournament.js';
import chatRouter from './routes/chat.js';
import shopMarketRouter from './routes/shopMarket.js';
import wholesaleRouter from './routes/wholesale.js';
import exchangeRouter from './routes/exchange.js';
import adminRouter from './routes/admin.js';
import franchiseRouter from './routes/franchise.js';
import analyticsRouter from './routes/analytics.js';
import iapRouter from './routes/iap.js';
import adminOperationsRouter from './routes/admin/operations.js';
import adminRetentionRouter from './routes/admin/retention.js';
import adminMarketingRouter from './routes/admin/marketing.js';
import adminEconomyToolsRouter from './routes/admin/economy.js';
import rubberMarketRouter from './routes/rubberMarket.js';
import commodityMarketRouter from './routes/commodityMarket.js';
import { startAnalytics } from './analytics/tracker.js';
import { startRedditScanner } from './services/redditScanner.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

// Trust reverse proxy (Railway, Heroku, etc.) for correct IP in rate limiter
if (NODE_ENV === 'production') app.set('trust proxy', 1);

// ── Security Middleware ──
// Open CORS — game uses Firebase token auth, not cookies, so this is safe.
// Needed for Capacitor native apps which send requests from various origins.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100kb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 200,              // 200 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
});
const actionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,  // 30 game actions per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many actions, slow down' },
});

app.use('/api/', apiLimiter);
app.use('/api/action', actionLimiter);

// ── Routes ──
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ONE-SHOT: trim bloated games row — no auth needed, secret key only. Remove after use.
// Debug: inspect + patch any player's staff state by firebase UID
app.get('/api/debug-staff/:secret/:uid', async (req, res) => {
  if (req.params.secret !== 'stafffix2026') return res.status(403).json({ error: 'nope' });
  try {
    const { pool } = await import('./db/pool.js');
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        'SELECT id, firebase_uid, game_state FROM players WHERE firebase_uid = $1',
        [req.params.uid]
      );
      if (!rows[0]) return res.json({ error: 'player not found' });
      const g = rows[0].game_state;
      const before = { staff: g.staff, companyName: g.companyName, cash: g.cash };
      // Patch: ensure staff exists
      if (!g.staff) {
        g.staff = { techs: 0, sales: 0, managers: 0, drivers: 0, pricingAnalyst: 0 };
        await client.query(
          'UPDATE players SET game_state = $1 WHERE firebase_uid = $2',
          [JSON.stringify(g), req.params.uid]
        );
      }
      res.json({ ok: true, playerId: rows[0].id, before, after: { staff: g.staff }, patched: !before.staff });
    } finally { client.release(); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/emergency-trim/:secret', async (req, res) => {
  if (req.params.secret !== 'trimgames2026') return res.status(403).json({ error: 'nope' });
  try {
    const { pool } = await import('./db/pool.js');
    const client = await pool.connect();
    try {
      await client.query('SET statement_timeout = 60000');
      const { rows } = await client.query("SELECT economy FROM games WHERE id = 'default'");
      if (!rows[0]) return res.json({ error: 'no games row' });
      let econ = rows[0].economy;
      if (typeof econ === 'string') econ = JSON.parse(econ);
      const beforeKB = Math.round(JSON.stringify(econ).length / 1024);
      for (const s of Object.values(econ?.exchange?.stocks || {})) {
        delete s.revenueHistory; delete s.revenueBySegment; delete s.riskRating;
        delete s.weeklyGrowth; delete s.profitMargin; delete s.dividendYield;
        if (s.priceHistory?.length > 30) s.priceHistory = s.priceHistory.slice(-30);
      }
      for (const ob of Object.values(econ?.exchange?.orderBooks || {})) {
        if (ob.bids?.length > 20) ob.bids = ob.bids.slice(-20);
        if (ob.asks?.length > 20) ob.asks = ob.asks.slice(-20);
        delete ob.fills;
      }
      if (econ?.tcMarketplace?.tradeHistory?.length > 50)
        econ.tcMarketplace.tradeHistory = econ.tcMarketplace.tradeHistory.slice(0, 50);
      const afterStr = JSON.stringify(econ);
      const afterKB = Math.round(afterStr.length / 1024);
      await client.query("UPDATE games SET economy = $1::jsonb WHERE id = 'default'", [afterStr]);
      res.json({ ok: true, beforeKB, afterKB, savedKB: beforeKB - afterKB });
    } finally { client.release(); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
app.use('/api/state', stateRouter);
app.use('/api/action', actionRouter);
app.use('/api/market', marketRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/profile', profileRouter);
app.use('/api/trade', tradeRouter);
app.use('/api/tournament', tournamentRouter);
app.use('/api/chat', chatRouter);
app.use('/api/shop-market', shopMarketRouter);
app.use('/api/wholesale', wholesaleRouter);
app.use('/api/exchange', exchangeRouter);
app.use('/api/admin', adminRouter);
app.use('/api/franchise', franchiseRouter);
app.use('/api/admin/analytics', analyticsRouter);
app.use('/api/iap', iapRouter);
app.use('/api/admin/operations', adminOperationsRouter);
app.use('/api/admin/retention', adminRetentionRouter);
app.use('/api/admin/marketing', adminMarketingRouter);
app.use('/api/admin/economy', adminEconomyToolsRouter);
app.use('/api/rubber-market', rubberMarketRouter);
app.use('/api/commodity-market', commodityMarketRouter);

// ── Admin Dashboard (static HTML) ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Firebase web config endpoint (public keys only — safe to expose)
app.get('/admin/firebase-config', (req, res) => {
  if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID) {
    return res.json(null);
  }
  res.json({
    apiKey: FIREBASE_API_KEY,
    authDomain: `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId: FIREBASE_PROJECT_ID,
  });
});

app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Public APK download (no auth required)
app.get('/download/apk', async (req, res) => {
  try {
    const { getFile } = await import('./db/queries.js');
    const file = await getFile('latest-apk');
    if (!file) return res.status(404).send('No APK available');
    res.set('Content-Type', file.content_type);
    res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.set('Content-Length', file.data.length);
    res.send(file.data);
  } catch (e) { res.status(500).send('Error'); }
});

// ── Legal Pages (Terms of Service, Privacy Policy) ──
app.use('/legal', express.static(path.join(__dirname, 'legal')));

// ── Serve client build in production (Section 13b) ──
if (NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  // SPA fallback — serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/admin') && !req.path.startsWith('/legal')) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
      next();
    }
  });
}

// ── Global Error Handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── HTTP + WebSocket Server ──
const server = createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();
app.locals.wsClients = clients;
app.locals.tickLoop = { setTickSpeed, stopTickLoop, startTickLoop, getTickSpeed, isTickRunning, getTickStats };
app.locals.tickStats = null; // Lazy — populated by getter
Object.defineProperty(app.locals, 'tickStats', { get: () => getTickStats() });

wss.on('connection', (ws) => handleConnection(ws, clients));
startHeartbeat(clients);

// ── Start ──
// Railway requires binding to 0.0.0.0 (not localhost) and process.env.PORT
// Without '0.0.0.0', Railway's health-check probe cannot reach the container.
const BIND_HOST = '0.0.0.0';
server.listen(process.env.PORT || PORT, BIND_HOST, () => {
  const boundPort = process.env.PORT || PORT;
  console.log(`Tire Empire server running on ${BIND_HOST}:${boundPort} (${NODE_ENV})`);
  console.log(`  REST API: http://localhost:${PORT}/api/health`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);

  // Rebuild shared shop sale listings from player game states
  syncShopListings().then(n => {
    if (n > 0) console.log(`  Synced ${n} shop sale listings to shared store`);
  }).catch(err => console.error('Shop listing sync error:', err));

  // Start analytics event flush timer
  startAnalytics();

  // Start the game tick loop
  startTickLoop(clients);

  // Start Reddit scanner (21c — polls every 15 min if REDDIT_USER_AGENT set)
  startRedditScanner();

  // Run DB schema migration after port is bound so healthcheck passes immediately
  runSchemaMigration().catch(err => console.error('[startup] Schema migration error:', err));
});

async function syncShopListings() {
  const existing = await getShopSaleListings({});
  if (existing.length > 0) return 0;
  const players = await getAllActivePlayers();
  let count = 0;
  for (const p of players) {
    const g = p.game_state;
    if (!g || !g.shopListings || g.shopListings.length === 0) continue;
    for (const sl of g.shopListings) {
      const loc = (g.locations || []).find(l => l.id === sl.locationId);
      if (!loc) continue;
      const city = CITIES.find(c => c.id === loc.cityId);
      const val = getShopValuation(loc, city);
      const invEntries = Object.entries(loc.inventory || {}).filter(([, q]) => q > 0);
      const monthlyRent = shopRent(city) * 4;
      const locStaff = loc.staff || g.staff || {};
      const monthlyStaffCost = Object.entries(locStaff).reduce((a, [k, v]) => a + (PAY[k] || 0) * v, 0);
      const monthlyExpenses = monthlyRent + monthlyStaffCost;
      const monthlyRevenue = Math.round((loc.dailyStats?.rev || 0) * 30);
      await addShopSaleListing({
        id: uid(), sellerId: p.id,
        sellerName: g.companyName || g.name || 'Unknown',
        cityId: loc.cityId, cityName: city?.name || 'Unknown',
        state: city?.state || '', askingPrice: sl.askingPrice,
        valuation: val,
        inventorySummary: { totalTires: invEntries.reduce((a, [, q]) => a + q, 0), tireTypes: invEntries.map(([k, q]) => `${TIRES[k]?.n || k} x${q}`) },
        loyalty: loc.loyalty || 0, dayRevenue: (loc.dailyStats?.rev) || 0,
        monthlyRevenue, monthlyRent, monthlyStaffCost, monthlyExpenses,
        listedDay: sl.listedDay || g.day, status: 'active', locationId: sl.locationId,
        offers: [], messages: [],
      });
      count++;
    }
  }
  return count;
}
