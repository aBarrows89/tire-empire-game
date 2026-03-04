import { Router } from 'express';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import {
  getAllActivePlayers, getPlayer, savePlayerState, getGame, saveGame, createPlayer, removePlayer,
  upsertLeaderboard,
} from '../../db/queries.js';
import { getWealth } from '../../../shared/helpers/wealth.js';
import { isBotPlayer } from '../../engine/aiPlayers.js';
import { createBot } from '../../engine/botPlayers.js';
import { uid } from '../../../shared/helpers/random.js';
import { BOT_SCENARIOS } from '../../engine/botScenarios.js';

const router = Router();
router.use(adminAuthMiddleware);

// ── Helper: push to audit log ──
async function auditLog(req, action, targetId, details) {
  try {
    const game = await getGame('default');
    if (!game) return;
    if (!game.economy) game.economy = {};
    if (!game.economy.adminLog) game.economy.adminLog = [];
    game.economy.adminLog.push({
      timestamp: Date.now(), adminId: req.adminId,
      action, targetId: targetId || null, details: details || {},
    });
    if (game.economy.adminLog.length > 500) game.economy.adminLog = game.economy.adminLog.slice(-500);
    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
  } catch (e) { console.error('Audit log error:', e); }
}

// ═══════════════════════════════════════
// BOT CONTROL CENTER
// ═══════════════════════════════════════

router.get('/bots', async (req, res) => {
  try {
    const players = await getAllActivePlayers();
    const bots = players.filter(p => isBotPlayer(p.game_state || {}));
    const realCount = players.filter(p => !isBotPlayer(p.game_state || {})).length;

    const botList = bots.map(p => {
      const g = p.game_state || {};
      const cfg = g._botConfig || {};
      return {
        id: p.id, name: g.companyName || g.name || 'Unknown',
        intensity: cfg.intensity || (g.isAI ? 5 : 0),
        personality: cfg.personality || 'standard',
        quirks: cfg.quirks || [],
        schedule: cfg.schedule || 'regular',
        homeCity: cfg.homeCityId || null,
        rep: g.reputation || 0, cash: g.cash || 0,
        shops: (g.locations || []).length, day: g.day || 0,
        wealth: getWealth(g),
        isLegacyAI: !!g.isAI,
        isStealth: !!g._botConfig,
      };
    }).sort((a, b) => b.wealth - a.wealth);

    const game = await getGame('default');
    const botsPaused = game?.economy?.botsPaused || false;

    res.json({
      ok: true, bots: botList, botCount: bots.length, realCount,
      ratio: realCount > 0 ? Math.round(bots.length / realCount * 10) / 10 : bots.length,
      botsPaused,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/bots/spawn', async (req, res) => {
  try {
    const { count = 1, intensity = 5, personality = null } = req.body;
    const toCreate = Math.min(Math.max(1, count), 10); // Max 10 at once
    const created = [];

    for (let i = 0; i < toCreate; i++) {
      try {
        const player = createBot({
          intensity: Math.max(1, Math.min(11, intensity)),
          personality: personality || null,
          adminId: req.adminId,
        });
        await createPlayer(player.id, player.game_state.name || 'Bot', player.game_state);
        await upsertLeaderboard(
          player.id,
          player.game_state.companyName || player.game_state.name || 'Bot',
          getWealth(player.game_state),
          player.game_state.reputation || 0,
          (player.game_state.locations || []).length,
          player.game_state.day || 1,
          false
        );
        created.push({ id: player.id, name: player.game_state.companyName });
      } catch (e) {
        console.error('Bot spawn error:', e.message);
      }
    }

    await auditLog(req, 'spawnBots', null, { count: created.length, intensity, personality });
    res.json({ ok: true, created: created.length, bots: created });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/bots/:id/intensity', async (req, res) => {
  try {
    const { intensity } = req.body;
    if (intensity == null || intensity < 1 || intensity > 11) {
      return res.status(400).json({ error: 'Intensity must be 1-11' });
    }
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Bot not found' });

    const g = player.game_state;
    if (g._botConfig) g._botConfig.intensity = intensity;
    else if (g.isAI) g._botConfig = { intensity };
    await savePlayerState(req.params.id, g, player.version);

    await auditLog(req, 'setBotIntensity', req.params.id, { intensity });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/bots/pause', async (req, res) => {
  try {
    const game = await getGame('default');
    if (!game.economy) game.economy = {};
    game.economy.botsPaused = true;
    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
    await auditLog(req, 'pauseBots', null, {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/bots/resume', async (req, res) => {
  try {
    const game = await getGame('default');
    if (!game.economy) game.economy = {};
    game.economy.botsPaused = false;
    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
    await auditLog(req, 'resumeBots', null, {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// EXPANDED BOT CONTROL — puppet-master tools
// ═══════════════════════════════════════

// View full bot state
router.get('/bots/:id/view', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Bot not found' });
    const g = player.game_state;
    res.json({
      ok: true,
      id: req.params.id,
      gameState: g,
      botConfig: g._botConfig || null,
      wealth: getWealth(g),
      metrics: {
        cash: g.cash || 0, rep: g.reputation || 0,
        shops: (g.locations || []).length, day: g.day || 0,
        totalRev: g.totalRev || 0, totalSold: g.totalSold || 0,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk field editing via dot-path object
router.post('/bots/:id/edit', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Bot not found' });

    const g = player.game_state;
    const { fields } = req.body; // { "cash": 50000, "reputation": 80, "factory.level": 3 }
    if (!fields || typeof fields !== 'object') return res.status(400).json({ error: 'fields object required' });

    const applied = [];
    for (const [path, value] of Object.entries(fields)) {
      const parts = path.split('.');
      let target = g;
      for (let i = 0; i < parts.length - 1; i++) {
        if (target[parts[i]] == null) target[parts[i]] = {};
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = value;
      applied.push(path);
    }

    await savePlayerState(req.params.id, g, player.version);
    await auditLog(req, 'editBot', req.params.id, { fields: applied });
    res.json({ ok: true, applied });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Queue a behavior directive
router.post('/bots/:id/directive', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Bot not found' });

    const g = player.game_state;
    if (!g._botConfig) return res.status(400).json({ error: 'Not a bot' });

    const { type, params: directiveParams } = req.body;
    if (!type) return res.status(400).json({ error: 'directive type required' });

    g._botConfig.overrides = g._botConfig.overrides || {};
    g._botConfig.overrides.directives = g._botConfig.overrides.directives || [];
    g._botConfig.overrides.directives.push({ type, params: directiveParams || {} });

    await savePlayerState(req.params.id, g, player.version);
    await auditLog(req, 'botDirective', req.params.id, { type, params: directiveParams });
    res.json({ ok: true, queued: type, queueLength: g._botConfig.overrides.directives.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Change personality + quirks + playFrequency
router.post('/bots/:id/personality', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Bot not found' });

    const g = player.game_state;
    if (!g._botConfig) return res.status(400).json({ error: 'Not a bot' });

    const { personality, quirks, schedule } = req.body;
    if (personality) g._botConfig.personality = personality;
    if (quirks) g._botConfig.quirks = quirks;
    if (schedule) g._botConfig.schedule = schedule;

    await savePlayerState(req.params.id, g, player.version);
    await auditLog(req, 'setBotPersonality', req.params.id, { personality, quirks, schedule });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Set behavior overrides (pricingMode, canOpenShops, etc.)
router.post('/bots/:id/overrides', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Bot not found' });

    const g = player.game_state;
    if (!g._botConfig) return res.status(400).json({ error: 'Not a bot' });

    const { overrides } = req.body;
    if (!overrides || typeof overrides !== 'object') return res.status(400).json({ error: 'overrides object required' });

    g._botConfig.overrides = { ...(g._botConfig.overrides || {}), ...overrides };

    await savePlayerState(req.params.id, g, player.version);
    await auditLog(req, 'setBotOverrides', req.params.id, { overrides });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Permanently delete a bot
router.delete('/bots/:id', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Bot not found' });

    const removed = await removePlayer(req.params.id);
    await auditLog(req, 'deleteBot', req.params.id, { name: player.game_state?.companyName });
    res.json({ ok: true, removed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clone a bot (deep copy with new id/name)
router.post('/bots/:id/clone', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Bot not found' });

    const cloned = structuredClone(player.game_state);
    const newId = uid();
    cloned.id = newId;
    cloned.name = (cloned.name || 'Bot') + ' (Clone)';
    cloned.companyName = (cloned.companyName || 'Bot Co') + ' Clone';
    cloned.day = 1;

    await createPlayer(newId, cloned.name, cloned);
    await auditLog(req, 'cloneBot', req.params.id, { newId, newName: cloned.companyName });
    res.json({ ok: true, newId, newName: cloned.companyName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Bulk operations on multiple bots
router.post('/bots/bulk', async (req, res) => {
  try {
    const { botIds, operation, params: opParams } = req.body;
    if (!Array.isArray(botIds) || botIds.length === 0) return res.status(400).json({ error: 'botIds array required' });
    if (!operation) return res.status(400).json({ error: 'operation required' });

    let affected = 0;
    for (const botId of botIds) {
      try {
        const player = await getPlayer(botId);
        if (!player) continue;
        const g = player.game_state;

        switch (operation) {
          case 'pause':
            if (g._botConfig) { g._botConfig.paused = true; }
            break;
          case 'resume':
            if (g._botConfig) { g._botConfig.paused = false; }
            break;
          case 'setIntensity':
            if (g._botConfig && opParams?.intensity) { g._botConfig.intensity = opParams.intensity; }
            break;
          case 'setPersonality':
            if (g._botConfig && opParams?.personality) { g._botConfig.personality = opParams.personality; }
            break;
          case 'directive':
            if (g._botConfig && opParams?.type) {
              g._botConfig.overrides = g._botConfig.overrides || {};
              g._botConfig.overrides.directives = g._botConfig.overrides.directives || [];
              g._botConfig.overrides.directives.push({ type: opParams.type, params: opParams.directiveParams || {} });
            }
            break;
          case 'delete':
            await removePlayer(botId);
            affected++;
            continue;
          default:
            continue;
        }

        if (operation !== 'delete') {
          await savePlayerState(botId, g, player.version);
        }
        affected++;
      } catch (e) {
        console.error(`Bulk op error for ${botId}:`, e.message);
      }
    }

    await auditLog(req, 'bulkBotOp', null, { operation, affected, total: botIds.length });
    res.json({ ok: true, affected });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Run a pre-built scenario
router.post('/bots/scenario', async (req, res) => {
  try {
    const { scenarioId, params: scenarioParams } = req.body;
    if (!scenarioId) return res.status(400).json({ error: 'scenarioId required' });

    const scenario = BOT_SCENARIOS[scenarioId];
    if (!scenario) return res.status(400).json({ error: `Unknown scenario: ${scenarioId}`, available: Object.keys(BOT_SCENARIOS) });

    const players = await getAllActivePlayers();
    const bots = players.filter(p => isBotPlayer(p.game_state || {}));

    const result = await scenario.execute(bots, scenarioParams || {});

    // Save all modified bot states
    for (const bot of bots) {
      try {
        await savePlayerState(bot.id, bot.game_state);
      } catch (e) {
        console.error(`Scenario save error for ${bot.id}:`, e.message);
      }
    }

    await auditLog(req, 'runScenario', null, { scenarioId, ...result });
    res.json({ ok: true, scenario: scenario.label, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// ECONOMY SIMULATOR
// ═══════════════════════════════════════

router.post('/simulate', async (req, res) => {
  try {
    const { playerId, days = 30 } = req.body;
    const simDays = Math.min(Math.max(1, days), 365);

    const player = await getPlayer(playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const game = await getGame('default');
    const shared = buildShared(game);

    // Import simDay dynamically to avoid circular deps
    const { simDay } = await import('../../engine/simDay.js');

    let state = structuredClone(player.game_state);
    const snapshots = [{
      day: state.day, cash: Math.round(state.cash || 0),
      rep: Math.round((state.reputation || 0) * 10) / 10,
      rev: Math.round(state.totalRev || 0),
      shops: (state.locations || []).length,
    }];

    const startTime = Date.now();
    for (let i = 0; i < simDays; i++) {
      // 5 second timeout
      if (Date.now() - startTime > 5000) {
        snapshots.push({ note: `Timed out after ${i} days` });
        break;
      }
      state = simDay(state, shared);
      if (i % 7 === 0 || i === simDays - 1) {
        snapshots.push({
          day: state.day, cash: Math.round(state.cash || 0),
          rep: Math.round((state.reputation || 0) * 10) / 10,
          rev: Math.round(state.totalRev || 0),
          shops: (state.locations || []).length,
        });
      }
    }

    res.json({ ok: true, snapshots, daysSimulated: simDays });
  } catch (e) {
    console.error('Simulation error:', e);
    res.status(500).json({ error: e.message });
  }
});

function buildShared(game) {
  return {
    day: game?.day || 1,
    aiShops: game?.ai_shops || [],
    globalEvents: game?.economy?.activeGlobalEvents || [],
    commodities: game?.economy?.commodities || {},
    supplierPricing: game?.economy?.supplierPricing || {},
    bankRate: game?.economy?.bankRate,
    loanRateMult: game?.economy?.loanRateMult,
    tcValue: game?.economy?.tcValue || 10000,
  };
}

// ═══════════════════════════════════════
// EVENT SCHEDULER
// ═══════════════════════════════════════

router.get('/schedule', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows } = await pool.query(
      `SELECT * FROM scheduled_events ORDER BY trigger_day ASC`
    );
    const game = await getGame('default');
    res.json({
      ok: true, events: rows, currentDay: game?.day || 0,
      activeEvents: game?.economy?.activeGlobalEvents || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/schedule', async (req, res) => {
  try {
    const { eventId, triggerDay, duration } = req.body;
    if (!eventId || !triggerDay) return res.status(400).json({ error: 'eventId and triggerDay required' });

    const { pool } = await import('../../db/pool.js');
    const id = uid();
    await pool.query(
      `INSERT INTO scheduled_events (id, event_id, trigger_day, duration, created_by) VALUES ($1,$2,$3,$4,$5)`,
      [id, eventId, triggerDay, duration || null, req.adminId]
    );
    await auditLog(req, 'scheduleEvent', id, { eventId, triggerDay, duration });
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/schedule/:id', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    await pool.query(`DELETE FROM scheduled_events WHERE id = $1`, [req.params.id]);
    await auditLog(req, 'cancelScheduledEvent', req.params.id, {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// PRICE MANIPULATION DETECTOR
// ═══════════════════════════════════════

router.get('/market-watch', async (req, res) => {
  try {
    const players = await getAllActivePlayers();
    const game = await getGame('default');
    const tcFairValue = game?.economy?.tcValue || 10000;
    const alerts = [];

    for (const p of players) {
      const g = p.game_state || {};
      if (isBotPlayer(g)) continue;

      // Check for TC price manipulation (listing TC at >200% fair value)
      // Check shop sale listings at absurd prices
      for (const listing of (g.shopListings || [])) {
        if (listing.askingPrice > 5000000) {
          alerts.push({
            type: 'high_listing', severity: 'low',
            player: g.companyName || p.id,
            detail: `Shop listing at $${listing.askingPrice.toLocaleString()}`,
          });
        }
      }

      // New account whale check
      if (g.day < 5 && (g.cash > 500000 || (g.totalRev || 0) > 100000)) {
        alerts.push({
          type: 'new_account_whale', severity: 'medium',
          player: g.companyName || p.id,
          detail: `Day ${g.day} account with $${Math.round(g.cash).toLocaleString()} cash`,
        });
      }
    }

    res.json({ ok: true, alerts, tcFairValue });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
