import { Router } from 'express';
import { getChatMessages, getDMs, getRecentDMPartners, getUnreadDMCount, markDMsRead, addChatReport } from '../db/queries.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/chat — fetch channel messages (optional ?channel=global|trade|help)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const channel = ['global', 'trade', 'help'].includes(req.query.channel) ? req.query.channel : null;
    const messages = await getChatMessages(limit, channel);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/chat/dm/:playerId — fetch DM history with a specific player
router.get('/dm/:playerId', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const messages = await getDMs(req.playerId, req.params.playerId, limit);
    // Mark as read
    await markDMsRead(req.playerId, req.params.playerId);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/chat/dm-partners — list recent DM conversation partners
router.get('/dm-partners', authMiddleware, async (req, res) => {
  try {
    const partners = await getRecentDMPartners(req.playerId);
    const unread = await getUnreadDMCount(req.playerId);
    res.json({ partners, unreadCount: unread });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/chat/report — report a chat message
router.post('/report', authMiddleware, async (req, res) => {
  try {
    const { messageId, reason } = req.body;
    if (!messageId) return res.status(400).json({ error: 'Missing messageId' });
    const report = {
      id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      reporterId: req.playerId,
      messageId,
      reason: (reason || '').slice(0, 200),
    };
    await addChatReport(report);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
