import { Router } from 'express';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import {
  getAllActivePlayers, getPlayer, savePlayerState, getGame, saveGame, createPlayer,
} from '../../db/queries.js';
import { getWealth } from '../../../shared/helpers/wealth.js';
import { isBotPlayer, createStealthPlayer } from '../../engine/aiPlayers.js';
import { uid } from '../../../shared/helpers/random.js';

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
      return {
        id: p.id, name: g.companyName || g.name || 'Unknown',
        intensity: g._botConfig?.intensity || (g.isAI ? 5 : 0),
        personality: g._botConfig?.personality || 'standard',
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
    const { count = 1, intensity = 5 } = req.body;
    const toCreate = Math.min(Math.max(1, count), 10); // Max 10 at once
    const created = [];

    for (let i = 0; i < toCreate; i++) {
      try {
        const player = createStealthPlayer(
          null, null, null,
          Math.max(1, Math.min(10, intensity)),
          req.adminId
        );
        await createPlayer(player.id, player.game_state.name || 'Bot', player.game_state);
        created.push(player.id);
      } catch (e) {
        console.error('Bot spawn error:', e.message);
      }
    }

    await auditLog(req, 'spawnBots', null, { count: created.length, intensity });
    res.json({ ok: true, created: created.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/bots/:id/intensity', async (req, res) => {
  try {
    const { intensity } = req.body;
    if (intensity == null || intensity < 1 || intensity > 10) {
      return res.status(400).json({ error: 'Intensity must be 1-10' });
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
