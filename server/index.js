import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { PORT, CORS_ORIGIN, NODE_ENV } from './config.js';
import { startTickLoop } from './tick/tickLoop.js';
import { handleConnection } from './ws/handler.js';
import stateRouter from './routes/state.js';
import actionRouter from './routes/action.js';
import marketRouter from './routes/market.js';
import leaderboardRouter from './routes/leaderboard.js';
import profileRouter from './routes/profile.js';
import tradeRouter from './routes/trade.js';
import tournamentRouter from './routes/tournament.js';
import chatRouter from './routes/chat.js';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

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

// ── HTTP + WebSocket Server ──
const server = createServer(app);
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => handleConnection(ws, clients));

// ── Start ──
server.listen(PORT, () => {
  console.log(`Tire Empire server running on :${PORT} (${NODE_ENV})`);
  console.log(`  REST API: http://localhost:${PORT}/api/health`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);

  // Start the game tick loop
  startTickLoop(clients);
});
