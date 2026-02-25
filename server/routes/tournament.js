import { Router } from 'express';
import { getTournament } from '../db/queries.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const tournament = await getTournament('current');
    res.json(tournament || { rankings: [], endDay: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
