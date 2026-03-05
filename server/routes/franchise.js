/**
 * Franchise Routes — public read endpoints
 * Actions (buy, create, terminate) go through /api/action
 */
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getFranchiseOfferings, getFranchiseAgreements } from '../db/queries.js';

const router = Router();
router.use(authMiddleware);

// Browse all active franchise offerings
router.get('/listings', async (req, res) => {
  try {
    const offerings = await getFranchiseOfferings(true);
    res.json(offerings);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// My franchise agreements (as franchisee)
router.get('/my-agreements', async (req, res) => {
  try {
    const agreements = await getFranchiseAgreements({ franchiseeId: req.playerId });
    res.json(agreements);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// My franchisees (as franchisor)
router.get('/my-franchisees', async (req, res) => {
  try {
    const agreements = await getFranchiseAgreements({ franchisorId: req.playerId });
    res.json(agreements);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
