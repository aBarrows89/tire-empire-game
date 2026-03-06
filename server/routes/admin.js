import { Router } from 'express';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import {
  getPlayer, createPlayer, savePlayerState, getAllActivePlayers, getGame, saveGame,
  getChatMessages, deleteChatMessage, getChatMutes, setChatMute, removeChatMute,
  removePlayer, saveFile, getFile, getChatReports, updateChatReport,
  addChatMessage, addDM, getDMs, trimExchange,
} from '../db/queries.js';
import { NODE_ENV, STORAGE_TYPE, ADMIN_UIDS } from '../config.js';
import { getWealth } from '../../shared/helpers/wealth.js';
import { init } from '../engine/init.js';
import { GLOBAL_EVENTS } from '../../shared/constants/globalEvents.js';
import { createStealthPlayer, isBotPlayer } from '../engine/aiPlayers.js';
import { CITIES } from '../../shared/constants/cities.js';

const router = Router();

// Allow SSE tick-stream to authenticate via query param (EventSource doesn't support headers)
router.use('/tick-stream', (req, res, next) => {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  if (req.query.devId && !req.headers['x-player-id']) {
    req.headers['x-player-id'] = req.query.devId;
  }
  next();
});

router.use(adminAuthMiddleware);

// ── Helper: push to audit log ──
async function auditLog(req, action, targetId, details) {
  try {
    const game = await getGame('default');
    if (!game) return;
    if (!game.economy) game.economy = {};
    if (!game.economy.adminLog) game.economy.adminLog = [];
    game.economy.adminLog.push({
      timestamp: Date.now(),
      adminId: req.adminId,
      action,
      targetId: targetId || null,
      details: details || {},
    });
    // Keep last 500 entries
    if (game.economy.adminLog.length > 500) {
      game.economy.adminLog = game.economy.adminLog.slice(-500);
    }
    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

// ═══════════════════════════════════════
// TICK STREAM (SSE)
// ═══════════════════════════════════════

import { tickEmitter } from '../tick/tickEmitter.js';

router.get('/tick-stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('data: {"type":"connected"}\n\n');

  const onTick = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  tickEmitter.on('tick', onTick);

  req.on('close', () => {
    tickEmitter.off('tick', onTick);
  });
});

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
        isBot: !!g._botConfig,
        botIntensity: g._botConfig?.intensity || null,
        day: g.day || 0,
        wealth: Math.round(getWealth(g)),
        factoryBrand: g.factory?.brandName || null,
        hasFactory: !!g.hasFactory,
      };
    });

    if (search) {
      filtered = filtered.filter(p =>
        p.companyName.toLowerCase().includes(search) ||
        p.id.toLowerCase().includes(search)
      );
    }

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
    const changes = {};

    const { cash, tireCoins, reputation, day, hasFactory, factoryLevel, tcStorageLevel, cosmetics, inventory, companyName, name, isAI, botIntensity } = req.body;
    if (companyName !== undefined) { g.companyName = String(companyName); changes.companyName = g.companyName; }
    if (name !== undefined) { g.name = String(name); changes.name = g.name; }
    if (isAI !== undefined) { g.isAI = !!isAI; changes.isAI = g.isAI; }
    if (botIntensity !== undefined && g._botConfig) {
      g._botConfig.intensity = Math.max(1, Math.min(10, Number(botIntensity)));
      changes.botIntensity = g._botConfig.intensity;
    }
    if (cash !== undefined) { g.cash = Number(cash); changes.cash = g.cash; }
    if (tireCoins !== undefined) { g.tireCoins = Number(tireCoins); changes.tireCoins = g.tireCoins; }
    if (reputation !== undefined) { g.reputation = Number(reputation); changes.reputation = g.reputation; }
    if (day !== undefined) { g.day = Number(day); changes.day = g.day; }
    if (tcStorageLevel !== undefined) { g.tcStorageLevel = Number(tcStorageLevel); changes.tcStorageLevel = g.tcStorageLevel; }

    // Factory grant/revoke
    if (hasFactory !== undefined) {
      if (hasFactory && !g.factory) {
        g.factory = {
          level: 1, brandName: g.companyName || 'Brand', qualityRating: 0.82,
          brandReputation: 0, totalProduced: 0, dailyCapacity: 50, overhead: 50000,
          completedResearch: [], earnedCerts: [], factoryStaff: {},
          rubberFarm: null, syntheticLab: null, rubberSupply: 0,
        };
        g.hasFactory = true;
        changes.hasFactory = true;
      } else if (!hasFactory) {
        g.factory = null;
        g.hasFactory = false;
        changes.hasFactory = false;
      }
    }

    // Factory level
    if (factoryLevel !== undefined && g.factory) {
      const lvl = Math.max(1, Math.min(3, Number(factoryLevel)));
      g.factory.level = lvl;
      const caps = { 1: 50, 2: 150, 3: 500 };
      const quals = { 1: 0.85, 2: 0.92, 3: 1.0 };
      g.factory.dailyCapacity = caps[lvl] || 50;
      if (g.factory.qualityRating > quals[lvl]) g.factory.qualityRating = quals[lvl];
      changes.factoryLevel = lvl;
    }

    // Cosmetics
    if (cosmetics && Array.isArray(cosmetics)) {
      if (!g.cosmetics) g.cosmetics = [];
      for (const c of cosmetics) {
        if (!g.cosmetics.includes(c)) g.cosmetics.push(c);
      }
      changes.cosmetics = cosmetics;
    }

    // Inventory
    if (inventory && typeof inventory === 'object') {
      if (!g.inventory) g.inventory = {};
      for (const [type, qty] of Object.entries(inventory)) {
        g.inventory[type] = (g.inventory[type] || 0) + Number(qty);
      }
      changes.inventory = inventory;
    }

    g.log = g.log || [];
    g.log.push(`[ADMIN] State edited by admin ${req.adminId}`);

    await savePlayerState(req.params.id, g);
    await auditLog(req, 'editPlayer', req.params.id, changes);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Transfer account: copy full game_state from one player to another ──
router.post('/players/:id/transfer-from/:sourceId', async (req, res) => {
  try {
    const source = await getPlayer(req.params.sourceId);
    if (!source) return res.status(404).json({ error: 'Source player not found' });
    const target = await getPlayer(req.params.id);
    if (!target) return res.status(404).json({ error: 'Target player not found' });

    // Copy source game_state but update the id to the target's id
    const newState = { ...source.game_state, id: req.params.id };
    await savePlayerState(req.params.id, newState);
    await auditLog(req, 'transferAccount', req.params.id, {
      sourceId: req.params.sourceId,
      targetId: req.params.id,
    });
    res.json({ ok: true, message: `Transferred state from ${req.params.sourceId} to ${req.params.id}` });
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
    await auditLog(req, banned ? 'ban' : 'unban', req.params.id, {});

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

    const oldState = player.game_state || {};
    const freshState = init(req.params.id, player.name || 'Unknown');
    freshState.companyName = oldState.companyName || 'Reset Company';
    freshState.isAI = !!oldState.isAI; // Preserve AI status on reset
    if (oldState._botConfig) freshState._botConfig = oldState._botConfig; // Preserve stealth bot config
    freshState.log = [`[ADMIN] Progress reset by admin ${req.adminId}`];

    await savePlayerState(req.params.id, freshState);
    await auditLog(req, 'resetPlayer', req.params.id, {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/players/:id', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    await removePlayer(req.params.id);
    await auditLog(req, 'deletePlayer', req.params.id, { companyName: player.game_state?.companyName });
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
    await auditLog(req, 'setPremium', req.params.id, { isPremium });
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

    const clients = req.app.locals.wsClients || new Set();
    const payload = JSON.stringify({ type: 'chatDelete', messageId: req.params.id });
    for (const client of clients) {
      if (client.readyState === 1) try { client.send(payload); } catch {}
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
    await auditLog(req, 'mute', playerId, { duration, reason });
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
    await auditLog(req, 'unmute', playerId, {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Chat Reports ──
router.get('/chat/reports', async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const reports = await getChatReports(status, 100);
    res.json(reports);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/chat/reports/:id/resolve', async (req, res) => {
  try {
    await updateChatReport(req.params.id, { status: 'resolved' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin Chat Send ──
router.post('/chat/send', async (req, res) => {
  try {
    const text = (req.body.text || '').trim().slice(0, 500);
    if (!text) return res.status(400).json({ error: 'Missing text' });
    const channel = ['global', 'trade', 'help'].includes(req.body.channel) ? req.body.channel : 'global';

    const message = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      playerId: 'ADMIN',
      playerName: 'ADMIN',
      channel,
      text,
      timestamp: Date.now(),
    };
    await addChatMessage(message);

    const clients = req.app.locals.wsClients || new Set();
    const payload = JSON.stringify({ type: 'chat', message });
    for (const client of clients) {
      if (client.readyState === 1) try { client.send(payload); } catch {}
    }

    await auditLog(req, 'adminChat', null, { channel, text: text.slice(0, 100) });
    res.json({ ok: true, message });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin DM Send ──
router.post('/chat/dm', async (req, res) => {
  try {
    const { targetPlayerId } = req.body;
    const text = (req.body.text || '').trim().slice(0, 500);
    if (!targetPlayerId) return res.status(400).json({ error: 'Missing targetPlayerId' });
    if (!text) return res.status(400).json({ error: 'Missing text' });

    const dmMsg = {
      id: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fromId: 'ADMIN',
      fromName: 'ADMIN',
      toId: targetPlayerId,
      text,
      timestamp: Date.now(),
    };
    await addDM(dmMsg);

    // Deliver to target if online
    const clients = req.app.locals.wsClients || new Set();
    for (const client of clients) {
      if (client.playerId === targetPlayerId && client.readyState === 1) {
        try { client.send(JSON.stringify({ type: 'dm', message: dmMsg })); } catch {}
      }
    }

    await auditLog(req, 'adminDM', targetPlayerId, { text: text.slice(0, 100) });
    res.json({ ok: true, message: dmMsg });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin DM History ──
router.get('/chat/dm/:playerId', async (req, res) => {
  try {
    const messages = await getDMs('ADMIN', req.params.playerId);
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// GLOBAL EVENTS MANAGEMENT
// ═══════════════════════════════════════

router.get('/events', async (req, res) => {
  try {
    const game = await getGame('default');
    const active = (game?.economy?.activeGlobalEvents || []).map(e => {
      const def = GLOBAL_EVENTS.find(d => d.id === e.id);
      return { ...e, name: def?.name, icon: def?.icon, daysLeft: e.endDay - (game?.day || 0) };
    });
    const available = GLOBAL_EVENTS.map(e => ({ id: e.id, name: e.name, icon: e.icon, durationMin: e.durationMin, durationMax: e.durationMax }));
    res.json({ active, available, day: game?.day || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/events/trigger', async (req, res) => {
  try {
    const { eventId, duration } = req.body;
    const def = GLOBAL_EVENTS.find(e => e.id === eventId);
    if (!def) return res.status(400).json({ error: 'Unknown event ID' });

    const game = await getGame('default');
    if (!game) return res.status(500).json({ error: 'Game not found' });
    if (!game.economy) game.economy = {};
    if (!game.economy.activeGlobalEvents) game.economy.activeGlobalEvents = [];

    if (game.economy.activeGlobalEvents.some(e => e.id === eventId)) {
      return res.status(400).json({ error: 'Event already active' });
    }

    const dur = duration ? Number(duration) : def.durationMin + Math.floor(Math.random() * (def.durationMax - def.durationMin + 1));
    game.economy.activeGlobalEvents.push({ id: eventId, startDay: game.day, endDay: game.day + dur });

    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
    await auditLog(req, 'triggerEvent', null, { eventId, duration: dur });
    res.json({ ok: true, event: eventId, duration: dur });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/events/cancel', async (req, res) => {
  try {
    const { eventId } = req.body;
    const game = await getGame('default');
    if (!game) return res.status(500).json({ error: 'Game not found' });

    const before = (game.economy?.activeGlobalEvents || []).length;
    game.economy.activeGlobalEvents = (game.economy.activeGlobalEvents || []).filter(e => e.id !== eventId);
    if (game.economy.activeGlobalEvents.length === before) {
      return res.status(400).json({ error: 'Event not active' });
    }

    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
    await auditLog(req, 'cancelEvent', null, { eventId });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// ECONOMY CONTROLS
// ═══════════════════════════════════════

router.get('/economy', async (req, res) => {
  try {
    const all = await getAllActivePlayers();
    const game = await getGame('default');
    // Include ALL players (bots + real) in economy calculations
    const active = all.filter(p => p.game_state?.companyName);

    let totalCash = 0, totalTC = 0, totalRep = 0, totalBankRate = 0, totalBankBalance = 0;
    const withWealth = [];

    for (const p of active) {
      const g = p.game_state;
      totalCash += g.cash || 0;
      totalTC += g.tireCoins || 0;
      totalRep += g.reputation || 0;
      totalBankRate += g.bankRate || 0.042;
      totalBankBalance += g.bankBalance || 0;
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
      avgReputation: active.length > 0 ? Math.round((totalRep / active.length) * 10) / 10 : 0,
      playerCount: all.length,
      activePlayerCount: active.length,
      top10: withWealth.slice(0, 10),
      commodities: game?.economy?.commodities || {},
      tcValue: game?.economy?.tcValue || 50000,
      avgBankRate: active.length > 0 ? Math.round((totalBankRate / active.length) * 10000) / 10000 : 0.042,
      totalBankDeposits: Math.round(totalBankBalance),
      tcPerCapita: active.length > 0 ? Math.round((totalTC / active.length) * 100) / 100 : 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/economy/indices', async (req, res) => {
  try {
    const game = await getGame('default');
    if (!game) return res.status(500).json({ error: 'Game not found' });
    if (!game.economy?.commodities) return res.status(400).json({ error: 'No commodities data' });

    const changes = {};
    for (const sym of ['RUBR', 'STEL', 'CHEM']) {
      if (req.body[sym] !== undefined) {
        const price = Math.max(10, Number(req.body[sym]));
        game.economy.commodities[sym].price = price;
        changes[sym] = price;
      }
    }

    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
    await auditLog(req, 'setIndices', null, changes);
    res.json({ ok: true, commodities: game.economy.commodities });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/economy/tc-value', async (req, res) => {
  try {
    const { value } = req.body;
    if (!value || Number(value) <= 0) return res.status(400).json({ error: 'Invalid TC value' });

    const game = await getGame('default');
    if (!game) return res.status(500).json({ error: 'Game not found' });
    if (!game.economy) game.economy = {};

    game.economy.tcValue = Number(value);
    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
    await auditLog(req, 'setTcValue', null, { value: game.economy.tcValue });
    res.json({ ok: true, tcValue: game.economy.tcValue });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// BROADCAST ANNOUNCEMENTS
// ═══════════════════════════════════════

router.post('/broadcast', async (req, res) => {
  try {
    const { message, severity } = req.body;
    if (!message) return res.status(400).json({ error: 'Missing message' });

    const clients = req.app.locals.wsClients || new Set();
    const payload = JSON.stringify({
      type: 'announcement',
      message,
      severity: severity || 'info',
      timestamp: Date.now(),
    });
    let sent = 0;
    for (const client of clients) {
      if (client.readyState === 1) { client.send(payload); sent++; }
    }

    await auditLog(req, 'broadcast', null, { message, severity, sentTo: sent });
    res.json({ ok: true, sentTo: sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// TICK / SERVER CONTROLS
// ═══════════════════════════════════════

router.get('/server-stats', async (req, res) => {
  try {
    const game = await getGame('default');
    const clients = req.app.locals.wsClients || new Set();
    const tl = req.app.locals.tickLoop || {};

    res.json({
      uptime: Math.round(process.uptime()),
      currentDay: game?.day || 0,
      tickMs: tl.getTickSpeed ? tl.getTickSpeed() : 20000,
      tickRunning: tl.isTickRunning ? tl.isTickRunning() : true,
      wsConnections: clients.size,
      storageType: STORAGE_TYPE,
      nodeEnv: NODE_ENV,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tick-speed', async (req, res) => {
  try {
    const { tickMs } = req.body;
    const ms = Number(tickMs);
    if (!ms || ms < 1000 || ms > 120000) return res.status(400).json({ error: 'tickMs must be 1000-120000' });

    const tl = req.app.locals.tickLoop;
    const clients = req.app.locals.wsClients;
    if (tl?.setTickSpeed) tl.setTickSpeed(ms, clients);

    await auditLog(req, 'setTickSpeed', null, { tickMs: ms });
    res.json({ ok: true, tickMs: ms });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tick/pause', async (req, res) => {
  try {
    const tl = req.app.locals.tickLoop;
    if (tl?.stopTickLoop) tl.stopTickLoop();
    await auditLog(req, 'pauseTick', null, {});
    res.json({ ok: true, running: false });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tick/resume', async (req, res) => {
  try {
    const tl = req.app.locals.tickLoop;
    const clients = req.app.locals.wsClients;
    if (tl?.startTickLoop) tl.startTickLoop(clients);
    await auditLog(req, 'resumeTick', null, {});
    res.json({ ok: true, running: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════

// ═══════════════════════════════════════
// STEALTH PLAYER CREATION
// ═══════════════════════════════════════

router.get('/cities', (req, res) => {
  res.json(CITIES.map(c => ({ id: c.id, name: c.name, state: c.state })));
});

router.post('/create-stealth-player', async (req, res) => {
  try {
    const { name, companyName, cityId, intensity } = req.body;
    if (!name || !companyName) return res.status(400).json({ error: 'Name and company name required' });
    const int = Math.max(1, Math.min(10, Number(intensity) || 5));

    const player = createStealthPlayer(name, companyName, cityId || null, int, req.adminId);
    await createPlayer(player.id, player.game_state.name || name, player.game_state);
    await auditLog(req, 'createStealthPlayer', player.id, { name, companyName, intensity: int, cityId });
    res.json({ ok: true, id: player.id, companyName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// ADMIN WHITELIST MANAGEMENT
// ═══════════════════════════════════════

router.get('/settings', async (req, res) => {
  try {
    const game = await getGame('default');
    const dbAdmins = game?.economy?.adminUids || [];
    // Merge env admins (immutable) with DB admins
    const envAdmins = ADMIN_UIDS.map(uid => ({ uid, source: 'env' }));
    const allAdmins = [...envAdmins, ...dbAdmins.map(a => ({ ...a, source: 'db' }))];
    res.json({ admins: allAdmins });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/settings/add-admin', async (req, res) => {
  try {
    const { uid, email } = req.body;
    if (!uid) return res.status(400).json({ error: 'UID required' });

    const game = await getGame('default');
    if (!game) return res.status(500).json({ error: 'Game not found' });
    if (!game.economy) game.economy = {};
    if (!game.economy.adminUids) game.economy.adminUids = [];

    // Check for duplicates
    if (ADMIN_UIDS.includes(uid) || game.economy.adminUids.some(a => a.uid === uid)) {
      return res.status(400).json({ error: 'UID already whitelisted' });
    }

    game.economy.adminUids.push({ uid, email: email || '', addedAt: Date.now(), addedBy: req.adminId });
    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
    await auditLog(req, 'addAdmin', null, { uid, email });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/settings/remove-admin', async (req, res) => {
  try {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'UID required' });
    if (ADMIN_UIDS.includes(uid)) return res.status(400).json({ error: 'Cannot remove env-var admin' });

    const game = await getGame('default');
    if (!game) return res.status(500).json({ error: 'Game not found' });
    if (!game.economy?.adminUids) return res.status(400).json({ error: 'No DB admins' });

    const before = game.economy.adminUids.length;
    game.economy.adminUids = game.economy.adminUids.filter(a => a.uid !== uid);
    if (game.economy.adminUids.length === before) return res.status(404).json({ error: 'Admin not found' });

    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
    await auditLog(req, 'removeAdmin', null, { uid });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════

router.get('/audit-log', async (req, res) => {
  try {
    const game = await getGame('default');
    const log = (game?.economy?.adminLog || []).slice(-200).reverse();
    res.json({ log });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// APK UPLOAD / DOWNLOAD
// ═══════════════════════════════════════

router.post('/upload-apk', async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const data = Buffer.concat(chunks);
    if (data.length === 0) return res.status(400).json({ error: 'No file data' });
    if (data.length > 100 * 1024 * 1024) return res.status(400).json({ error: 'File too large (100MB max)' });
    const filename = req.headers['x-filename'] || 'tire-empire.apk';
    await saveFile('latest-apk', filename, 'application/vnd.android.package-archive', data);
    res.json({ ok: true, size: data.length, filename });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/download-apk', async (req, res) => {
  try {
    const file = await getFile('latest-apk');
    if (!file) return res.status(404).json({ error: 'No APK uploaded yet' });
    res.set('Content-Type', file.content_type);
    res.set('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.set('Content-Length', file.data.length);
    res.send(file.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Diagnose economy bloat — show top keys by size
router.get('/economy-sizes', async (req, res) => {
  try {
    const game = await getGame();
    if (!game) return res.status(404).json({ error: 'No game' });
    const econ = game.economy || {};
    const sizes = {};
    for (const [k, v] of Object.entries(econ)) {
      const sz = JSON.stringify(v || '').length;
      sizes[k] = Math.round(sz / 1024) + 'KB';
      // Go one level deeper for large keys
      if (sz > 50000 && v && typeof v === 'object' && !Array.isArray(v)) {
        sizes[k + ' (children)'] = {};
        for (const [ck, cv] of Object.entries(v)) {
          const csz = JSON.stringify(cv || '').length;
          if (csz > 5000) sizes[k + ' (children)'][ck] = Math.round(csz / 1024) + 'KB';
        }
      }
    }
    const aiShopsKB = Math.round(JSON.stringify(game.ai_shops || []).length / 1024);
    const liqKB = Math.round(JSON.stringify(game.liquidation || []).length / 1024);
    sizes._ai_shops = aiShopsKB + 'KB';
    sizes._liquidation = liqKB + 'KB';
    sizes._total = Math.round(JSON.stringify(econ).length / 1024) + 'KB';
    // Show per-stock field breakdown for the first stock
    if (econ.exchange?.stocks) {
      const tickers = Object.keys(econ.exchange.stocks);
      if (tickers.length > 0) {
        const firstStock = econ.exchange.stocks[tickers[0]];
        sizes['firstStock ('+tickers[0]+')'] = {};
        for (const [fk, fv] of Object.entries(firstStock || {})) {
          const fsz = JSON.stringify(fv || '').length;
          if (fsz > 100) sizes['firstStock ('+tickers[0]+')'][fk] = Math.round(fsz / 1024) + 'KB (' + fsz + 'B)';
        }
        sizes._stockCount = tickers.length;
      }
    }
    res.json(sizes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Emergency: trim bloated games row economy JSONB in-place
router.post('/trim-economy', async (req, res) => {
  try {
    // Bypass cache — read directly from DB
    const pgPool = (await import('../db/pool.js')).pool;
    const { rows } = await pgPool.query('SELECT economy FROM games WHERE id = $1', ['default']);
    if (!rows[0]) return res.status(404).json({ error: 'No game' });
    const econ = typeof rows[0].economy === 'string' ? JSON.parse(rows[0].economy) : (rows[0].economy || {});
    const beforeKB = Math.round(JSON.stringify(econ).length / 1024);

    // Aggressively trim exchange (biggest contributor — often 10+ MB)
    trimExchange(econ);
    if (econ.rateHistory?.length > 12) econ.rateHistory = econ.rateHistory.slice(-12);
    if (econ.tcHistory?.length > 14) econ.tcHistory = econ.tcHistory.slice(-14);
    if (econ.tcMarketplace?.tradeHistory?.length > 20) econ.tcMarketplace.tradeHistory = econ.tcMarketplace.tradeHistory.slice(-20);
    if (econ.tournamentHistory?.length > 10) econ.tournamentHistory = econ.tournamentHistory.slice(-10);
    if (econ.globalEventHistory?.length > 10) econ.globalEventHistory = econ.globalEventHistory.slice(-10);
    delete econ.tcReserve?.history;
    if (econ.adminLog?.length > 50) econ.adminLog = econ.adminLog.slice(-50);

    const afterKB = Math.round(JSON.stringify(econ).length / 1024);
    // Force save via direct SQL (bypass the 800KB safety limit for emergency trim)
    const econStr = JSON.stringify(econ);
    await pgPool.query(
      `UPDATE games SET economy = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      ['default', econStr]
    );
    res.json({ ok: true, beforeKB, afterKB, saved: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
