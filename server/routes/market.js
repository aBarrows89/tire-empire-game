import { Router } from 'express';
import { getGame } from '../db/queries.js';

const router = Router();

// GET /api/market — shared economy data
router.get('/', async (req, res) => {
  try {
    const game = await getGame();
    if (!game) return res.status(404).json({ error: 'No active game' });

    res.json({
      week: game.week,
      economy: game.economy,
      aiShopCount: (game.ai_shops || []).length,
      liquidationCount: (game.liquidation || []).length,
    });
  } catch (err) {
    console.error('GET /api/market error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
