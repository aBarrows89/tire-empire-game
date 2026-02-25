import { Router } from 'express';
import { getPlayer } from '../db/queries.js';
import { DAYS_PER_YEAR } from '../../shared/helpers/calendar.js';

const router = Router();

// GET /api/profile/:playerId — public player profile (no money values)
router.get('/:playerId', async (req, res) => {
  try {
    const player = await getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const g = player.game_state;
    const daysInBusiness = Math.max(1, g.day || 1);
    const yearsInBusiness = Math.floor(daysInBusiness / DAYS_PER_YEAR) + 1;
    const currentYear = Math.floor((daysInBusiness - 1) / DAYS_PER_YEAR) + 1;
    const yearStarted = currentYear - yearsInBusiness + 1; // always 1 from player perspective

    res.json({
      name: g.name || 'Unknown',
      companyName: g.companyName || 'Unnamed Co.',
      yearsInBusiness,
      daysInBusiness,
      yearStarted,
      locationCount: (g.locations || []).length,
      reputation: Math.round((g.reputation || 0) * 10) / 10,
    });
  } catch (err) {
    console.error('GET /api/profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
