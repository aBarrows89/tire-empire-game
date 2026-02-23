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

// GET /api/market/city/:cityId — AI shop info for a specific city
router.get('/city/:cityId', async (req, res) => {
  try {
    const game = await getGame();
    if (!game) return res.status(404).json({ error: 'No active game' });

    const shops = (game.ai_shops || []).filter(s => s.cityId === req.params.cityId);
    res.json({
      cityId: req.params.cityId,
      shops: shops.map(s => ({
        name: s.name,
        ic: s.ic,
        personality: s.personality,
        reputation: s.reputation,
      })),
      count: shops.length,
    });
  } catch (err) {
    console.error('GET /api/market/city error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/market/cities — AI shop counts for all cities (summary)
router.get('/cities', async (req, res) => {
  try {
    const game = await getGame();
    if (!game) return res.status(404).json({ error: 'No active game' });

    const counts = {};
    for (const shop of (game.ai_shops || [])) {
      counts[shop.cityId] = (counts[shop.cityId] || 0) + 1;
    }
    res.json(counts);
  } catch (err) {
    console.error('GET /api/market/cities error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
