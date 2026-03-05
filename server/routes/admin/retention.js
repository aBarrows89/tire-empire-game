import { Router } from 'express';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { getAllActivePlayers, getPlayer, getGame, saveGame } from '../../db/queries.js';
import { getWealth } from '../../../shared/helpers/wealth.js';
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
// CHURN RISK DASHBOARD
// ═══════════════════════════════════════

function computeChurnRisk(g, updatedAt) {
  let risk = 0;
  const hoursSince = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) / 3600000 : 0;

  // Inactivity
  if (hoursSince > 168) risk += 45;       // 7+ days
  else if (hoursSince > 72) risk += 35;   // 3+ days
  else if (hoursSince > 48) risk += 20;   // 2+ days

  // Cash crisis (has shops but no money)
  if (g.cash < 500 && (g.locations || []).length > 0) risk += 20;

  // Revenue declining
  if ((g.dayRev || 0) < (g.prevDayRev || 1) * 0.5 && g.day > 5) risk += 15;

  // Stuck early (low rep after many days)
  if ((g.reputation || 0) < 5 && g.day > 30) risk += 15;

  // No shops after many days
  if ((g.locations || []).length === 0 && g.day > 20) risk += 10;

  return Math.min(100, risk);
}

router.get('/churn-risk', async (req, res) => {
  try {
    const players = await getAllActivePlayers();
    const risks = players
      .filter(p => !p.game_state?.isAI && !p.game_state?._botConfig)
      .map(p => {
        const g = p.game_state || {};
        const risk = computeChurnRisk(g, p.updated_at);
        return {
          id: p.id, name: g.companyName || g.name || 'Unknown',
          risk, cash: g.cash || 0, rep: g.reputation || 0,
          shops: (g.locations || []).length, day: g.day || 0,
          dayRev: g.dayRev || 0, lastActive: p.updated_at,
          issues: getIssues(g, p.updated_at),
        };
      })
      .sort((a, b) => b.risk - a.risk);

    res.json({ ok: true, players: risks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function getIssues(g, updatedAt) {
  const issues = [];
  const hours = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) / 3600000 : 0;
  if (hours > 48) issues.push(`Inactive ${Math.round(hours / 24)}d`);
  if (g.cash < 500 && (g.locations || []).length > 0) issues.push('Near bankruptcy');
  if ((g.dayRev || 0) < (g.prevDayRev || 1) * 0.5 && g.day > 5) issues.push('Revenue declining');
  if ((g.reputation || 0) < 5 && g.day > 30) issues.push('Stuck early game');
  if ((g.locations || []).length === 0 && g.day > 20) issues.push('No shops yet');
  return issues;
}

// ═══════════════════════════════════════
// PLAYER JOURNEY VISUALIZER
// ═══════════════════════════════════════

const MILESTONES = [
  { id: 'signup', label: 'Signed Up', check: () => true },
  { id: 'first_sale', label: 'First Sale', check: g => (g.totalSold || 0) > 0 },
  { id: 'rev_1k', label: '$1K Revenue', check: g => (g.totalRev || 0) >= 1000 },
  { id: 'rep_5', label: 'Rep 5', check: g => (g.reputation || 0) >= 5 },
  { id: 'first_storage', label: 'Storage Upgrade', check: g => (g.storage || []).length > 1 },
  { id: 'rep_8', label: 'Rep 8', check: g => (g.reputation || 0) >= 8 },
  { id: 'first_supplier', label: 'First Supplier', check: g => (g.unlockedSuppliers || []).length > 0 },
  { id: 'rep_10', label: 'Rep 10', check: g => (g.reputation || 0) >= 10 },
  { id: 'first_shop', label: 'First Shop', check: g => (g.locations || []).length >= 1 },
  { id: 'first_hire', label: 'First Hire', check: g => Object.values(g.staff || {}).some(v => v > 0) },
  { id: 'rev_10k', label: '$10K Revenue', check: g => (g.totalRev || 0) >= 10000 },
  { id: 'rep_25', label: 'Rep 25', check: g => (g.reputation || 0) >= 25 },
  { id: 'wholesale', label: 'Wholesale Active', check: g => g.hasWholesale },
  { id: 'second_shop', label: 'Second Shop', check: g => (g.locations || []).length >= 2 },
  { id: 'rep_30', label: 'Rep 30', check: g => (g.reputation || 0) >= 30 },
  { id: 'ecom', label: 'E-Commerce Live', check: g => g.hasEcom },
  { id: 'rev_100k', label: '$100K Revenue', check: g => (g.totalRev || 0) >= 100000 },
  { id: 'brokerage', label: 'TESX Brokerage', check: g => g.stockExchange?.hasBrokerage },
  { id: 'rep_50', label: 'Rep 50', check: g => (g.reputation || 0) >= 50 },
  { id: 'warehouse', label: 'Warehouse', check: g => g.hasWarehouse },
  { id: 'rev_1m', label: '$1M Revenue', check: g => (g.totalRev || 0) >= 1000000 },
  { id: 'rep_75', label: 'Rep 75', check: g => (g.reputation || 0) >= 75 },
  { id: 'factory', label: 'Factory Built', check: g => g.hasFactory },
  { id: 'ipo', label: 'IPO', check: g => g.stockExchange?.isPublic },
];

router.get('/journeys', async (req, res) => {
  try {
    const players = await getAllActivePlayers();
    const realPlayers = players.filter(p => !p.game_state?.isAI && !p.game_state?._botConfig);

    // Per-player milestone status
    const journeys = realPlayers.map(p => {
      const g = p.game_state || {};
      const reached = MILESTONES.filter(m => m.check(g)).map(m => m.id);
      return {
        id: p.id, name: g.companyName || g.name || 'Unknown',
        day: g.day || 0, reached,
      };
    });

    // Aggregate funnel
    const funnel = MILESTONES.map(m => ({
      id: m.id, label: m.label,
      count: realPlayers.filter(p => m.check(p.game_state || {})).length,
      pct: realPlayers.length > 0
        ? Math.round(realPlayers.filter(p => m.check(p.game_state || {})).length / realPlayers.length * 100)
        : 0,
    }));

    res.json({ ok: true, journeys, funnel, totalPlayers: realPlayers.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/journeys/:id', async (req, res) => {
  try {
    const player = await getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const g = player.game_state || {};
    const milestones = MILESTONES.map(m => ({
      id: m.id, label: m.label, reached: m.check(g),
    }));
    res.json({ ok: true, id: player.id, name: g.companyName || g.name, day: g.day, milestones });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// PUSH NOTIFICATION MANAGER
// ═══════════════════════════════════════

router.get('/push/templates', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows } = await pool.query(`SELECT * FROM push_templates ORDER BY created_at DESC`);
    res.json({ ok: true, templates: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/push/templates', async (req, res) => {
  try {
    const { name, title, body, segment = 'all' } = req.body;
    if (!name || !title || !body) return res.status(400).json({ error: 'name, title, and body required' });
    const { pool } = await import('../../db/pool.js');
    const id = uid();
    await pool.query(
      `INSERT INTO push_templates (id, name, title, body, segment) VALUES ($1,$2,$3,$4,$5)`,
      [id, name, title, body, segment]
    );
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/push/templates/:id', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    await pool.query(`DELETE FROM push_templates WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/push/send', async (req, res) => {
  try {
    const { templateId, title, body, segment = 'all', playerIds } = req.body;
    let sendTitle = title;
    let sendBody = body;

    // Load template if provided
    if (templateId) {
      const { pool } = await import('../../db/pool.js');
      const { rows } = await pool.query(`SELECT * FROM push_templates WHERE id = $1`, [templateId]);
      if (rows.length > 0) {
        sendTitle = rows[0].title;
        sendBody = rows[0].body;
      }
    }

    if (!sendTitle || !sendBody) return res.status(400).json({ error: 'title and body required' });

    const players = await getAllActivePlayers();
    let targets = players.filter(p => !p.game_state?.isAI && !p.game_state?._botConfig);

    // Filter by segment
    if (segment === 'premium') targets = targets.filter(p => p.game_state?.isPremium);
    else if (segment === 'free') targets = targets.filter(p => !p.game_state?.isPremium);
    else if (segment === 'custom' && playerIds) targets = targets.filter(p => playerIds.includes(p.id));

    // Send push notifications
    let sentCount = 0;
    try {
      const { sendPushToPlayer } = await import('../../notifications/sender.js');
      for (const p of targets) {
        const g = p.game_state || {};
        const personalTitle = sendTitle.replace(/\{\{playerName\}\}/g, g.companyName || g.name || 'Player');
        const personalBody = sendBody
          .replace(/\{\{playerName\}\}/g, g.companyName || g.name || 'Player')
          .replace(/\{\{cash\}\}/g, String(Math.round(g.cash || 0)))
          .replace(/\{\{rep\}\}/g, String(Math.round(g.reputation || 0)));
        try {
          await sendPushToPlayer(p.id, g.fcmToken, personalTitle, personalBody);
          sentCount++;
        } catch {}
      }
    } catch { /* push not configured */ }

    // Log to push_history
    try {
      const { pool } = await import('../../db/pool.js');
      for (const p of targets) {
        await pool.query(
          `INSERT INTO push_history (template_id, player_id, title, body) VALUES ($1,$2,$3,$4)`,
          [templateId || null, p.id, sendTitle, sendBody]
        );
      }
    } catch {}

    await auditLog(req, 'sendPush', null, { segment, sentCount, title: sendTitle });
    res.json({ ok: true, sentCount, targeted: targets.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/push/history', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows } = await pool.query(
      `SELECT * FROM push_history ORDER BY sent_at DESC LIMIT 100`
    );
    res.json({ ok: true, history: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
