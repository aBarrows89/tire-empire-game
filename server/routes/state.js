import { Router } from 'express';
import { getPlayer, createPlayer } from '../db/queries.js';
import { init } from '../engine/init.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/state — current player game state
router.get('/', authMiddleware, async (req, res) => {
  try {
    let player = await getPlayer(req.playerId);

    if (!player) {
      // Auto-create new player
      const state = init(req.query.name || 'Player');
      state.id = req.playerId;
      player = await createPlayer(req.playerId, state.name, state);
    }

    res.json(player.game_state);
  } catch (err) {
    console.error('GET /api/state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
