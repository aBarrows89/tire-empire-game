import { Router } from 'express';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import {
  getGame, saveGame, getAllActivePlayers, getPlayer,
} from '../../db/queries.js';
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
    if (game.economy.adminLog.length > 500) {
      game.economy.adminLog = game.economy.adminLog.slice(-500);
    }
    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
  } catch (e) { console.error('Audit log error:', e); }
}

// ═══════════════════════════════════════
// DB HEALTH MONITOR
// ═══════════════════════════════════════

router.get('/health', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    // Connection pool stats
    const poolStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    };

    // Table sizes
    const tableQuery = await pool.query(`
      SELECT relname AS name,
             n_live_tup AS rows,
             pg_total_relation_size(quote_ident(relname)) AS size_bytes
      FROM pg_stat_user_tables
      ORDER BY pg_total_relation_size(quote_ident(relname)) DESC
    `);
    const tables = tableQuery.rows.map(r => ({
      name: r.name, rows: Number(r.rows),
      sizeMB: Math.round(Number(r.size_bytes) / 1024 / 1024 * 100) / 100,
    }));

    // DB total size
    const dbSizeRes = await pool.query(`SELECT pg_database_size(current_database()) AS size`);
    const dbSizeMB = Math.round(Number(dbSizeRes.rows[0].size) / 1024 / 1024 * 100) / 100;

    // Tick stats from app.locals
    const tickStats = req.app.locals.tickStats || { lastMs: 0, avgMs: 0, p95Ms: 0, history: [] };

    // Memory
    const mem = process.memoryUsage();
    const memoryMB = Math.round(mem.heapUsed / 1024 / 1024);

    res.json({
      ok: true, pool: poolStats, dbSizeMB, tables, tick: tickStats,
      memoryMB, uptime: Math.round(process.uptime()),
    });
  } catch (e) {
    console.error('Health check error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════

router.get('/announcements', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows } = await pool.query(
      `SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ ok: true, announcements: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/announcements', async (req, res) => {
  try {
    const { message, style = 'info', expiresAt } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const { pool } = await import('../../db/pool.js');
    const id = uid();
    await pool.query(
      `INSERT INTO announcements (id, message, style, active, expires_at, created_by) VALUES ($1,$2,$3,true,$4,$5)`,
      [id, message, style, expiresAt || null, req.adminId]
    );

    // Broadcast to connected players
    const clients = req.app.locals.wsClients;
    if (clients) {
      const payload = JSON.stringify({
        type: style === 'vinnie' ? 'vinnie' : 'announcement',
        message, style, id,
      });
      for (const ws of clients) {
        try { ws.send(payload); } catch {}
      }
    }

    await auditLog(req, 'createAnnouncement', id, { message, style });
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/announcements/:id/toggle', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    await pool.query(
      `UPDATE announcements SET active = NOT active WHERE id = $1`, [req.params.id]
    );
    await auditLog(req, 'toggleAnnouncement', req.params.id, {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/announcements/:id', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    await pool.query(`DELETE FROM announcements WHERE id = $1`, [req.params.id]);
    await auditLog(req, 'deleteAnnouncement', req.params.id, {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// A/B TESTS (Config Overrides)
// ═══════════════════════════════════════

router.get('/ab-tests', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows } = await pool.query(`SELECT * FROM ab_tests ORDER BY created_at DESC`);
    res.json({ ok: true, tests: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/ab-tests', async (req, res) => {
  try {
    const { name, constantKey, controlValue, variantValue, metric } = req.body;
    if (!name || !constantKey) return res.status(400).json({ error: 'name and constantKey required' });
    const { pool } = await import('../../db/pool.js');
    const id = uid();
    await pool.query(
      `INSERT INTO ab_tests (id, name, constant_key, control_value, variant_value, metric) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, name, constantKey, controlValue || '', variantValue || '', metric || 'revenue']
    );
    await auditLog(req, 'createAbTest', id, { name, constantKey });
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/ab-tests/:id/toggle', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    await pool.query(`UPDATE ab_tests SET active = NOT active WHERE id = $1`, [req.params.id]);
    await auditLog(req, 'toggleAbTest', req.params.id, {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/ab-tests/:id', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    await pool.query(`DELETE FROM ab_tests WHERE id = $1`, [req.params.id]);
    await auditLog(req, 'deleteAbTest', req.params.id, {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// REVENUE DASHBOARD
// ═══════════════════════════════════════

router.get('/revenue', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const players = await getAllActivePlayers();
    const premiumCount = players.filter(p => p.game_state?.isPremium).length;
    const totalPlayers = players.length;
    const totalTC = players.reduce((s, p) => s + (p.game_state?.tireCoins || 0), 0);

    // Revenue events if table has data
    let revenueByType = [];
    try {
      const { rows } = await pool.query(
        `SELECT event_type, COUNT(*) as count, COALESCE(SUM(revenue_cents),0) as total_cents
         FROM revenue_events WHERE created_at > NOW() - INTERVAL '30 days'
         GROUP BY event_type ORDER BY total_cents DESC`
      );
      revenueByType = rows;
    } catch { /* table may be empty */ }

    res.json({
      ok: true, premiumCount, totalPlayers, totalTC,
      premiumRate: totalPlayers > 0 ? Math.round(premiumCount / totalPlayers * 100) : 0,
      revenueByType,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
