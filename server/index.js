import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { PORT, CORS_ORIGIN, NODE_ENV } from './config.js';
import { startTickLoop } from './tick/tickLoop.js';
import { handleConnection } from './ws/handler.js';
import { getAllActivePlayers, addShopSaleListing, getShopSaleListings } from './db/queries.js';
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

const app = express();

// ── Security Middleware ──
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : (
    NODE_ENV === 'production'
      ? ['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost']
      : CORS_ORIGIN
  ),
  credentials: true,
}));
app.use(express.json({ limit: '100kb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 60,               // 60 requests per minute per IP
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

wss.on('connection', (ws) => handleConnection(ws, clients));

// ── Start ──
server.listen(PORT, () => {
  console.log(`Tire Empire server running on :${PORT} (${NODE_ENV})`);
  console.log(`  REST API: http://localhost:${PORT}/api/health`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);

  // Rebuild shared shop sale listings from player game states
  syncShopListings().then(n => {
    if (n > 0) console.log(`  Synced ${n} shop sale listings to shared store`);
  }).catch(err => console.error('Shop listing sync error:', err));

  // Start the game tick loop
  startTickLoop(clients);
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
