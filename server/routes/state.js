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
      // Auto-create new player with default state
      const state = init('Player');
      state.id = req.playerId;
      player = await createPlayer(req.playerId, state.name, state);
    }

    res.json(player.game_state);
  } catch (err) {
    console.error('GET /api/state error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/state/register — set player and company name
router.post('/register', authMiddleware, async (req, res) => {
  try {
    const { playerName, companyName } = req.body;
    if (!playerName || !companyName) {
      return res.status(400).json({ error: 'playerName and companyName are required' });
    }

    let player = await getPlayer(req.playerId);

    if (!player) {
      const state = init(playerName);
      state.id = req.playerId;
      state.companyName = companyName;
      player = await createPlayer(req.playerId, playerName, state);
    } else {
      // Update existing player's names
      const g = { ...player.game_state };
      g.name = playerName;
      g.companyName = companyName;
      const { savePlayerState } = await import('../db/queries.js');
      await savePlayerState(req.playerId, g);
      player.game_state = g;
    }

    res.json(player.game_state);
  } catch (err) {
    console.error('POST /api/state/register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
