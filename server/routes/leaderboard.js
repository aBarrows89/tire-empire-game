import { Router } from 'express';
import { getLeaderboard } from '../db/queries.js';

const router = Router();

// GET /api/leaderboard — top players
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const rows = await getLeaderboard(limit);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/leaderboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
