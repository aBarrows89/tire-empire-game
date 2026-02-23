import { Router } from 'express';
import { getPlayer } from '../db/queries.js';

const router = Router();

// GET /api/profile/:playerId — public player profile (no money values)
router.get('/:playerId', async (req, res) => {
  try {
    const player = await getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const g = player.game_state;
    const yearsInBusiness = Math.max(1, Math.ceil((g.week || 1) / 52));

    res.json({
      name: g.name || 'Unknown',
      companyName: g.companyName || 'Unnamed Co.',
      yearsInBusiness,
      locationCount: (g.locations || []).length,
      reputation: Math.round((g.reputation || 0) * 10) / 10,
    });
  } catch (err) {
    console.error('GET /api/profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
