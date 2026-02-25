import { Router } from 'express';
import { getPlayer, createPlayer, isCompanyNameTaken, getGame } from '../db/queries.js';
import { init } from '../engine/init.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/state — current player game state
router.get('/', authMiddleware, async (req, res) => {
  try {
    let player = await getPlayer(req.playerId);

    if (!player) {
      // Auto-create new player with default state
      const game = await getGame();
      const globalDay = game?.day || game?.week || 1;
      const state = init('Player', globalDay);
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

    const taken = await isCompanyNameTaken(companyName, req.playerId);
    if (taken) {
      return res.status(400).json({ error: 'Company name is already taken' });
    }

    let player = await getPlayer(req.playerId);

    if (!player) {
      const game = await getGame();
      const globalDay = game?.day || game?.week || 1;
      const state = init(playerName, globalDay);
      state.id = req.playerId;
      state.companyName = companyName;
      player = await createPlayer(req.playerId, playerName, state);
    } else {
      const oldState = player.game_state;
      // If player had no company name, this is a fresh registration — reset their state
      if (!oldState.companyName) {
        const game = await getGame();
        const globalDay = game?.day || game?.week || 1;
        const fresh = init(playerName, globalDay);
        fresh.id = oldState.id || req.playerId;
        fresh.companyName = companyName;
        fresh.tutorialStep = oldState.tutorialStep || 0;
        fresh.tutorialDone = oldState.tutorialDone || false;
        const { savePlayerState } = await import('../db/queries.js');
        await savePlayerState(req.playerId, fresh);
        player.game_state = fresh;
      } else {
        // Update existing player's names
        const g = { ...oldState };
        g.name = playerName;
        g.companyName = companyName;
        const { savePlayerState } = await import('../db/queries.js');
        await savePlayerState(req.playerId, g);
        player.game_state = g;
      }
    }

    res.json(player.game_state);
  } catch (err) {
    console.error('POST /api/state/register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
