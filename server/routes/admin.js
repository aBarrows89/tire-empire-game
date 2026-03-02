import { Router } from 'express';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import {
  getPlayer, savePlayerState, getAllActivePlayers, getGame,
  getChatMessages, deleteChatMessage, getChatMutes, setChatMute, removeChatMute,
} from '../db/queries.js';
import { TICK_MS, NODE_ENV, STORAGE_TYPE } from '../config.js';
import { getWealth } from '../../shared/helpers/wealth.js';
import { init } from '../engine/init.js';

const router = Router();
router.use(adminAuthMiddleware);

// ═══════════════════════════════════════
// PLAYER MANAGEMENT
// ═══════════════════════════════════════

router.get('/players', async (req, res) => {
  try {
    const all = await getAllActivePlayers();
    const search = (req.query.search || '').toLowerCase().trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));

    let filtered = all.map(p => {
      const g = p.game_state || {};
      return {
        id: p.id,
        companyName: g.companyName || '(unnamed)',
        cash: Math.round(g.cash || 0),
        tireCoins: g.tireCoins || 0,
        reputation: Math.round((g.reputation || 0) * 10) / 10,
        locations: (g.locations || []).length,
        isPremium: !!g.isPremium,
        isBanned: !!g.isBanned,
        isAI: !!g.isAI,
        day: g.day || 0,
        wealth: Math.round(getWealth(g)),
      };
    });

    if (search) {
      filtered = filtered.filter(p =>
        p.companyName.toLowerCase().includes(search) ||
        p.id.toLowerCase().includes(search)
      );
    }

    // Sort by wealth descending
    filtered.sort((a, b) => b.wealth - a.wealth);

    const total = filtered.length;
    const start = (page - 1) * limit;
    const players = filtered.slice(start, start + limit);

    res.json({ players, total, page, limit });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/players/:id', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json(player);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/players/:id/edit', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;

    const { cash, tireCoins, reputation } = req.body;
    if (cash !== undefined) g.cash = Number(cash);
    if (tireCoins !== undefined) g.tireCoins = Number(tireCoins);
    if (reputation !== undefined) g.reputation = Number(reputation);

    g.log = g.log || [];
    g.log.push(`[ADMIN] State edited by admin ${req.adminId}`);

    await savePlayerState(req.params.id, g);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/players/:id/ban', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;

    const banned = req.body.banned !== false;
    g.isBanned = banned;
    g.log = g.log || [];
    g.log.push(`[ADMIN] ${banned ? 'Banned' : 'Unbanned'} by admin ${req.adminId}`);

    await savePlayerState(req.params.id, g);

    // Disconnect their WebSocket if banning
    if (banned) {
      const clients = req.app.locals.wsClients || new Set();
      for (const client of clients) {
        if (client.playerId === req.params.id && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'error', message: 'Your account has been banned' }));
          client.close();
        }
      }
    }

    res.json({ ok: true, banned });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/players/:id/reset', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const freshState = init(req.params.id, player.name || 'Unknown');
    freshState.companyName = player.game_state?.companyName || 'Reset Company';
    freshState.log = [`[ADMIN] Progress reset by admin ${req.adminId}`];

    await savePlayerState(req.params.id, freshState);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/players/:id/set-premium', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state;

    const isPremium = req.body.isPremium !== false;
    g.isPremium = isPremium;
    if (isPremium) {
      g.premiumSince = g.premiumSince || g.day;
      if (!g.cosmetics) g.cosmetics = [];
      if (!g.cosmetics.includes('gold_name')) g.cosmetics.push('gold_name');
    }
    g.log = g.log || [];
    g.log.push(`[ADMIN] Premium ${isPremium ? 'granted' : 'revoked'} by admin ${req.adminId}`);

    await savePlayerState(req.params.id, g);
    res.json({ ok: true, isPremium });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// CHAT MODERATION
// ═══════════════════════════════════════

router.get('/chat/messages', async (req, res) => {
  try {
    const limit = Math.min(500, parseInt(req.query.limit) || 500);
    const messages = await getChatMessages(limit);
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/chat/messages/:id', async (req, res) => {
  try {
    const deleted = await deleteChatMessage(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Message not found' });

    // Broadcast deletion to all connected clients
    const clients = req.app.locals.wsClients || new Set();
    const payload = JSON.stringify({ type: 'chatDelete', messageId: req.params.id });
    for (const client of clients) {
      if (client.readyState === 1) client.send(payload);
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/chat/mutes', async (req, res) => {
  try {
    const mutes = await getChatMutes();
    res.json({ mutes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/chat/mute', async (req, res) => {
  try {
    const { playerId, duration, reason } = req.body;
    if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

    const expiresAt = duration ? Date.now() + Number(duration) * 60 * 1000 : null;
    await setChatMute(playerId, {
      mutedBy: req.adminId,
      mutedAt: Date.now(),
      expiresAt,
      reason: reason || '',
    });

    res.json({ ok: true, expiresAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/chat/unmute', async (req, res) => {
  try {
    const { playerId } = req.body;
    if (!playerId) return res.status(400).json({ error: 'Missing playerId' });
    await removeChatMute(playerId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// ECONOMY DASHBOARD
// ═══════════════════════════════════════

router.get('/economy', async (req, res) => {
  try {
    const all = await getAllActivePlayers();
    const real = all.filter(p => !p.game_state?.isAI && p.game_state?.companyName);

    let totalCash = 0, totalTC = 0, totalRep = 0;
    const withWealth = [];

    for (const p of real) {
      const g = p.game_state;
      totalCash += g.cash || 0;
      totalTC += g.tireCoins || 0;
      totalRep += g.reputation || 0;
      withWealth.push({
        id: p.id,
        companyName: g.companyName,
        wealth: Math.round(getWealth(g)),
        cash: Math.round(g.cash || 0),
        reputation: Math.round((g.reputation || 0) * 10) / 10,
        locations: (g.locations || []).length,
      });
    }

    withWealth.sort((a, b) => b.wealth - a.wealth);

    res.json({
      totalCash: Math.round(totalCash),
      totalTC: Math.round(totalTC),
      avgReputation: real.length > 0 ? Math.round((totalRep / real.length) * 10) / 10 : 0,
      playerCount: all.length,
      activePlayerCount: real.length,
      top10: withWealth.slice(0, 10),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SERVER STATS
// ═══════════════════════════════════════

router.get('/server-stats', async (req, res) => {
  try {
    const game = await getGame('default');
    const clients = req.app.locals.wsClients || new Set();

    res.json({
      uptime: Math.round(process.uptime()),
      currentDay: game?.day || 0,
      tickMs: TICK_MS,
      wsConnections: clients.size,
      storageType: STORAGE_TYPE,
      nodeEnv: NODE_ENV,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
