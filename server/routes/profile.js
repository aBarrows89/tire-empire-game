import { Router } from 'express';
import { getPlayer, savePlayerState } from '../db/queries.js';
import { authMiddleware } from '../middleware/auth.js';
import { DAYS_PER_YEAR } from '../../shared/helpers/calendar.js';
import { CITIES } from '../../shared/constants/cities.js';
import { uid } from '../../shared/helpers/random.js';
import { pool } from '../db/pool.js';

const router = Router();

// GET /api/profile/:playerId — public player profile (no money values)
router.get('/:playerId', async (req, res) => {
  try {
    const player = await getPlayer(req.params.playerId);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const g = player.game_state;
    const playerDays = Math.max(1, g.day || 1);
    const yearsInBusiness = Math.floor(playerDays / DAYS_PER_YEAR) + 1;
    // Use world day (startDay is set when character was created/reset)
    const worldDay = (g.startDay || 1) + playerDays - 1;
    const currentYear = Math.floor((worldDay - 1) / DAYS_PER_YEAR) + 1;
    const yearStarted = currentYear - yearsInBusiness + 1;

    // Build city names list for stores
    const storeCities = (g.locations || []).map(loc => {
      const city = CITIES.find(c => c.id === loc.cityId);
      return city ? city.name : 'Unknown';
    });

    res.json({
      name: g.name || 'Unknown',
      companyName: g.companyName || 'Unnamed Co.',
      yearsInBusiness,
      daysInBusiness: playerDays,
      yearStarted,
      locationCount: (g.locations || []).length,
      reputation: Math.round((g.reputation || 0) * 10) / 10,
      isPremium: !!g.isPremium,
      cosmetics: g.cosmetics || [],
      storeCities,
      // Factory & distributor info
      hasFactory: !!g.hasFactory,
      brandName: g.factory?.brandName || null,
      isDistributor: !!g.factory?.isDistributor,
      hasWholesale: !!g.hasWholesale,
      factoryLevel: g.factory?.level || 0,
      brandReputation: Math.round(g.factory?.brandReputation || 0),
      hasRubberForSale: ((g.factory?.naturalRubber || 0) + (g.factory?.syntheticRubber || 0)) > 50,
    });
  } catch (err) {
    console.error('GET /api/profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/profile/:playerId/send-cash — wire cash to another player
router.post('/:playerId/send-cash', authMiddleware, async (req, res) => {
  try {
    const { amount: rawAmount } = req.body;
    const amount = Math.max(1, Math.floor(Number(rawAmount) || 0));
    const targetId = req.params.playerId;

    if (targetId === req.playerId) return res.status(400).json({ error: 'Cannot send cash to yourself' });
    if (amount > 10000000) return res.status(400).json({ error: 'Max transfer $10,000,000' });

    const sender = await getPlayer(req.playerId);
    if (!sender) return res.status(404).json({ error: 'Sender not found' });
    const sg = sender.game_state;

    if (sg.cash < amount) return res.status(400).json({ error: `Not enough cash (have $${Math.floor(sg.cash).toLocaleString()})` });

    const target = await getPlayer(targetId);
    if (!target) return res.status(404).json({ error: 'Player not found' });
    const tg = target.game_state;

    sg.cash -= amount;
    sg.log = sg.log || [];
    sg.log.push({ msg: `Sent $${amount.toLocaleString()} to ${tg.companyName}`, cat: 'sale' });
    await savePlayerState(req.playerId, sg);

    tg.cash = (tg.cash || 0) + amount;
    tg.log = tg.log || [];
    tg.log.push({ msg: `Received $${amount.toLocaleString()} from ${sg.companyName}`, cat: 'sale' });
    await savePlayerState(targetId, tg);

    res.json({ ok: true, sent: amount });
  } catch (err) {
    console.error('POST /api/profile/send-cash error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/profile/:playerId/report — report a player
router.post('/:playerId/report', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.length < 3) return res.status(400).json({ error: 'Reason required' });
    const targetId = req.params.playerId;
    if (targetId === req.playerId) return res.status(400).json({ error: 'Cannot report yourself' });

    // Store report in database
    await pool.query(
      `INSERT INTO player_reports (id, reporter_id, reported_id, reason, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT DO NOTHING`,
      [uid(), req.playerId, targetId, reason.slice(0, 500)]
    ).catch(() => {
      // Table might not exist yet — create it
      return pool.query(
        `CREATE TABLE IF NOT EXISTS player_reports (
          id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, reported_id TEXT NOT NULL,
          reason TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
        )`
      ).then(() => pool.query(
        `INSERT INTO player_reports (id, reporter_id, reported_id, reason, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [uid(), req.playerId, targetId, reason.slice(0, 500)]
      ));
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/profile/report error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
