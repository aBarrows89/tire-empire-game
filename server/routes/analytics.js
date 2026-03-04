import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { ADMIN_UIDS } from '../config.js';
import { getOverviewStats, getFunnelStats, getTimeSeries, getActionBreakdown } from '../analytics/tracker.js';
import { getCacheStats } from '../db/playerCache.js';

const router = Router();

// Admin-only middleware
function adminOnly(req, res, next) {
  if (!ADMIN_UIDS.includes(req.playerId)) return res.status(403).json({ error: 'Admin only' });
  next();
}

// GET /api/admin/analytics/overview — DAU, WAU, MAU, totals
router.get('/overview', authMiddleware, adminOnly, async (req, res) => {
  try {
    const stats = await getOverviewStats();
    const cache = getCacheStats();
    res.json({ ...stats, cache });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/funnel — tutorial, shop opening, premium conversion
router.get('/funnel', authMiddleware, adminOnly, async (req, res) => {
  try {
    const stats = await getFunnelStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/timeseries?metric=session_start&interval=day&days=30
router.get('/timeseries', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { metric = 'session_start', interval = 'day', days = '30' } = req.query;
    const data = await getTimeSeries(metric, interval, parseInt(days));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/analytics/actions?days=7 — action type breakdown
router.get('/actions', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { days = '7' } = req.query;
    const data = await getActionBreakdown(parseInt(days));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
