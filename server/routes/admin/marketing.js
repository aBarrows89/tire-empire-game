import { Router } from 'express';
import { adminAuthMiddleware } from '../../middleware/adminAuth.js';
import { getAllActivePlayers, getGame, saveGame } from '../../db/queries.js';
import { getWealth } from '../../../shared/helpers/wealth.js';
import { uid } from '../../../shared/helpers/random.js';
import { isRedditApiConfigured, postComment as redditPostComment, deleteComment as redditDeleteComment, submitPost as redditSubmitPost } from '../../services/redditApi.js';

const router = Router();
router.use(adminAuthMiddleware);

// ── Reddit User-Agent (21a) ──
const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT
  || 'nodejs:tire-empire-admin:v1.0.0 (by /u/TireEmpireGame)';

// ── Helper: push to audit log ──
async function auditLog(req, action, targetId, details) {
  try {
    const game = await getGame('default');
    if (!game) return;
    if (!game.economy) game.economy = {};
    if (!game.economy.adminLog) game.economy.adminLog = [];
    game.economy.adminLog.push({
      timestamp: Date.now(), adminId: req.adminId,
      action, targetId: targetId || null, details: details || {},
    });
    if (game.economy.adminLog.length > 500) game.economy.adminLog = game.economy.adminLog.slice(-500);
    await saveGame('default', game.day, game.economy, game.ai_shops, game.liquidation || []);
  } catch (e) { console.error('Audit log error:', e); }
}

// ═══════════════════════════════════════
// REDDIT SCOUT
// ═══════════════════════════════════════

const REDDIT_CONFIG = {
  subreddits: [
    'incremental_games', 'tycoon', 'IdleGames', 'WebGames',
    'indiegames', 'AndroidGaming', 'MobileGaming', 'businesssim',
    'playmygame', 'gamedev',
  ],
  gamingSubs: new Set([
    'incremental_games', 'tycoon', 'IdleGames', 'WebGames',
    'indiegames', 'AndroidGaming', 'MobileGaming', 'businesssim',
    'playmygame',
  ]),
  keywords: [
    'tire game', 'tire simulator', 'tire tycoon', 'tire empire',
    'business sim', 'tycoon recommendation', 'looking for games like',
    'idle business', 'multiplayer tycoon', 'economy sim',
    'recommend me a game', 'new mobile game', 'indie game',
    'what games are you playing', 'feedback friday', 'screenshot saturday',
    'any good', 'business game', 'management game', 'sim game',
    'tycoon game', 'what should I play', 'hidden gem',
    'underrated game', 'new release', 'early access',
    'self promotion', 'my game', 'feedback wanted',
    'stock market game', 'trading sim', 'industry sim',
  ],
  scoring: {
    keywordInTitle: 0.4,
    keywordInBody: 0.2,
    subredditRelevance: 0.2,
    recency: 0.1,
    engagement: 0.1,
  },
};

const SUGGESTED_ANGLES = {
  multiplayer: 'Tire Empire has a player-driven stock exchange and real wholesale mechanics with multiplayer competition.',
  realistic: 'Built by someone in tire distribution — real industry mechanics, supplier tiers, DOT codes.',
  mobile: 'Available as a mobile app via Capacitor — play anywhere on Android.',
  idle: 'Tick-based simulation that runs while you are away. Check in, make decisions, grow your empire.',
  tycoon: 'Full business tycoon with retail shops, wholesale, e-commerce, factory, and stock exchange.',
  default: 'Tire Empire is a multiplayer business sim where you build a tire empire from a van to a factory.',
};

function getSuggestedAngle(title, body) {
  const text = `${title} ${body}`.toLowerCase();
  if (text.includes('multiplayer') || text.includes('pvp') || text.includes('compete')) return SUGGESTED_ANGLES.multiplayer;
  if (text.includes('realistic') || text.includes('authentic') || text.includes('simulation')) return SUGGESTED_ANGLES.realistic;
  if (text.includes('mobile') || text.includes('android') || text.includes('phone')) return SUGGESTED_ANGLES.mobile;
  if (text.includes('idle') || text.includes('incremental') || text.includes('clicker')) return SUGGESTED_ANGLES.idle;
  if (text.includes('tycoon') || text.includes('business') || text.includes('management')) return SUGGESTED_ANGLES.tycoon;
  return SUGGESTED_ANGLES.default;
}

function scoreThread(post, sub) {
  let score = 0;
  const title = (post.title || '').toLowerCase();
  const body = (post.selftext || '').toLowerCase();

  // Keyword matches
  const matchedKeywords = [];
  for (const kw of REDDIT_CONFIG.keywords) {
    if (title.includes(kw)) { score += REDDIT_CONFIG.scoring.keywordInTitle; matchedKeywords.push(kw); }
    else if (body.includes(kw)) { score += REDDIT_CONFIG.scoring.keywordInBody; matchedKeywords.push(kw); }
  }

  // Subreddit relevance
  if (REDDIT_CONFIG.gamingSubs.has(sub)) score += REDDIT_CONFIG.scoring.subredditRelevance;

  // Recency (< 4 hours)
  const ageHours = (Date.now() / 1000 - post.created_utc) / 3600;
  if (ageHours < 4) score += REDDIT_CONFIG.scoring.recency;
  else if (ageHours < 24) score += REDDIT_CONFIG.scoring.recency * 0.5;

  // Engagement sweet spot (5-50 comments)
  if (post.num_comments >= 5 && post.num_comments <= 50) score += REDDIT_CONFIG.scoring.engagement;

  return { score: Math.min(1, score), matchedKeywords };
}

router.get('/reddit/threads', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const status = req.query.status || 'new';
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    let query = `SELECT * FROM reddit_threads`;
    const params = [];
    if (status !== 'all') {
      query += ` WHERE status = $1`;
      params.push(status);
    }
    query += ` ORDER BY relevance DESC, fetched_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    res.json({ ok: true, threads: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/reddit/scan', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    let totalFound = 0;
    const errors = [];
    const subResults = [];

    for (const sub of REDDIT_CONFIG.subreddits) {
      try {
        const url = `https://www.reddit.com/r/${sub}/new.json?limit=25`;
        const resp = await fetch(url, {
          headers: {
            'User-Agent': REDDIT_USER_AGENT,
            'Accept': 'application/json',
          },
        });

        if (resp.status === 429) {
          errors.push({ sub, error: 'Rate limited by Reddit', status: 429 });
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        if (!resp.ok) {
          errors.push({ sub, error: `HTTP ${resp.status}`, status: resp.status });
          continue;
        }

        const data = await resp.json();
        const posts = data?.data?.children || [];
        let subFound = 0;

        for (const { data: post } of posts) {
          const { score: relevance, matchedKeywords } = scoreThread(post, sub);
          // 21d: Lower threshold for gaming subreddits
          const minRelevance = REDDIT_CONFIG.gamingSubs.has(sub) ? 0.15 : 0.25;
          if (relevance < minRelevance && matchedKeywords.length === 0) continue;

          const fullname = post.name;
          const suggestedAngle = getSuggestedAngle(post.title, post.selftext || '');

          await pool.query(`
            INSERT INTO reddit_threads (id, subreddit, title, body, author, url, score, matched_keywords, relevance, status, notes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',$10)
            ON CONFLICT (id) DO UPDATE SET score = $7, relevance = $9, fetched_at = NOW()
          `, [
            fullname, sub, post.title, (post.selftext || '').slice(0, 2000),
            post.author, `https://reddit.com${post.permalink}`,
            post.score || 0, matchedKeywords, relevance, suggestedAngle,
          ]);
          subFound++;
          totalFound++;
        }

        subResults.push({ sub, postsScanned: posts.length, matched: subFound });
        // Rate limit: delay between subreddit fetches
        await new Promise(r => setTimeout(r, 1200));
      } catch (subErr) {
        errors.push({ sub, error: subErr.message });
      }
    }

    await auditLog(req, 'redditScan', null, { threadsFound: totalFound, errors: errors.length });
    res.json({
      ok: true,
      threadsFound: totalFound,
      subredditsScanned: REDDIT_CONFIG.subreddits.length,
      errors,
      subResults,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/reddit/threads/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!['new', 'reviewed', 'engaged', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const { pool } = await import('../../db/pool.js');
    const updates = [`status = $2`];
    const params = [req.params.id, status];
    if (notes !== undefined) { updates.push(`notes = $${params.length + 1}`); params.push(notes); }
    if (status === 'reviewed') { updates.push(`reviewed_at = NOW()`); }
    if (status === 'engaged') { updates.push(`engaged_at = NOW()`); }

    await pool.query(`UPDATE reddit_threads SET ${updates.join(', ')} WHERE id = $1`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Reddit Comment Endpoints ──

router.post('/reddit/threads/:id/comment', async (req, res) => {
  try {
    if (!isRedditApiConfigured()) {
      return res.status(400).json({ error: 'Reddit API not configured — set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD in .env' });
    }
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Comment text is required' });

    const { pool } = await import('../../db/pool.js');
    const threadId = req.params.id;

    // Verify thread exists
    const { rows: [thread] } = await pool.query('SELECT id FROM reddit_threads WHERE id = $1', [threadId]);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });

    // Post to Reddit
    const commentData = await redditPostComment(threadId, text.trim());
    const redditCommentId = commentData?.name || commentData?.id || null;

    // Record in our DB
    const commentId = uid();
    await pool.query(
      `INSERT INTO reddit_comments (id, thread_id, reddit_comment_id, body, posted_by) VALUES ($1,$2,$3,$4,$5)`,
      [commentId, threadId, redditCommentId, text.trim(), req.adminId || 'admin']
    );

    // Auto-update thread status to 'engaged'
    await pool.query(
      `UPDATE reddit_threads SET status = 'engaged', engaged_at = NOW() WHERE id = $1`,
      [threadId]
    );

    await auditLog(req, 'redditComment', threadId, { commentId, redditCommentId });
    res.json({ ok: true, commentId, redditCommentId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/reddit/threads/:id/comments', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows } = await pool.query(
      `SELECT * FROM reddit_comments WHERE thread_id = $1 ORDER BY posted_at DESC`,
      [req.params.id]
    );
    res.json({ ok: true, comments: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/reddit/comments/:commentId', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows: [comment] } = await pool.query(
      'SELECT * FROM reddit_comments WHERE id = $1', [req.params.commentId]
    );
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.deleted) return res.status(400).json({ error: 'Comment already deleted' });

    // Delete from Reddit if we have the Reddit comment ID
    if (comment.reddit_comment_id && isRedditApiConfigured()) {
      await redditDeleteComment(comment.reddit_comment_id);
    }

    await pool.query('UPDATE reddit_comments SET deleted = true WHERE id = $1', [req.params.commentId]);
    await auditLog(req, 'redditDeleteComment', req.params.commentId, { threadId: comment.thread_id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// REDDIT POST GENERATOR
// ═══════════════════════════════════════

router.post('/reddit/post', async (req, res) => {
  try {
    if (!isRedditApiConfigured()) {
      return res.status(400).json({ error: 'Reddit API not configured — set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD in .env' });
    }
    const { subreddit, title, text, flairId } = req.body;
    if (!subreddit || !title || !text) return res.status(400).json({ error: 'subreddit, title, and text are required' });

    const result = await redditSubmitPost(subreddit, title, text, flairId || undefined);
    const redditPostId = result?.name || result?.id || null;
    const url = result?.url || null;

    const { pool } = await import('../../db/pool.js');
    const postId = uid();
    await pool.query(
      `INSERT INTO reddit_posts (id, subreddit, title, body, reddit_post_id, url, posted_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [postId, subreddit, title, text, redditPostId, url, req.adminId || 'admin']
    );

    await auditLog(req, 'redditPost', postId, { subreddit, title, redditPostId, url });
    res.json({ ok: true, postId, redditPostId, url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/reddit/posts', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows } = await pool.query(
      `SELECT * FROM reddit_posts WHERE deleted = false ORDER BY posted_at DESC LIMIT 50`
    );
    res.json({ ok: true, posts: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// SOCIAL CONTENT GENERATOR
// ═══════════════════════════════════════

router.get('/content', async (req, res) => {
  try {
    const game = await getGame('default');
    const players = await getAllActivePlayers();
    const realPlayers = players.filter(p => !p.game_state?.isAI && !p.game_state?._botConfig);

    const totalCash = players.reduce((s, p) => s + (p.game_state?.cash || 0), 0);
    const tcValue = game?.economy?.tcValue || 10000;
    const activePlayers = realPlayers.length;
    const day = game?.day || 0;

    // Top player by wealth
    let topPlayer = 'N/A', topWealth = 0;
    for (const p of realPlayers) {
      const w = getWealth(p.game_state || {});
      if (w > topWealth) { topWealth = w; topPlayer = p.game_state?.companyName || p.game_state?.name || 'Unknown'; }
    }

    // Active events
    const events = (game?.economy?.activeGlobalEvents || []).map(e => e.id).join(', ') || 'None';

    const fmt = n => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${n}`;
    const gameUrl = 'https://tireempire.com';

    const content = [
      {
        platform: 'reddit', type: 'weeklyRecap',
        title: `Tire Empire Weekly Recap — Day ${day}`,
        body: `This week in Tire Empire:\n\n` +
          `Total economy: ${fmt(totalCash)}\n` +
          `Active players: ${activePlayers}\n` +
          `TC Value: ${fmt(tcValue)}\n` +
          `Top earner: ${topPlayer} (${fmt(topWealth)})\n` +
          `Events: ${events}\n\n` +
          `Play free at ${gameUrl}`,
      },
      {
        platform: 'twitter', type: 'weeklyRecap',
        body: `Tire Empire Day ${day}:\n` +
          `${activePlayers} players, ${fmt(totalCash)} economy\n` +
          `Top player cleared ${fmt(topWealth)}\n` +
          `${gameUrl}`,
      },
      {
        platform: 'discord', type: 'weeklyRecap',
        body: `**Weekly Update — Day ${day}**\n` +
          `Economy: ${fmt(totalCash)} | Players: ${activePlayers} | TC: ${fmt(tcValue)}\n` +
          `Top: ${topPlayer} at ${fmt(topWealth)}\n` +
          `Events: ${events}`,
      },
      {
        platform: 'reddit', type: 'devlog',
        title: `Tire Empire Devlog — [Headline]`,
        body: `Hey r/[subreddit],\n\n` +
          `[Intro paragraph]\n\n` +
          `**What's new:**\n- [Change 1]\n- [Change 2]\n\n` +
          `**Current stats:** ${activePlayers} players, ${fmt(totalCash)} economy, TC at ${fmt(tcValue)}\n\n` +
          `**Play it:** ${gameUrl}\n\nHappy to answer questions about the game or the tech behind it.`,
      },
    ];

    res.json({ ok: true, content, stats: { totalCash, tcValue, activePlayers, topPlayer, topWealth, day, events } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════
// REFERRAL TRACKING
// ═══════════════════════════════════════

router.get('/referrals', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows: codes } = await pool.query(`SELECT * FROM referral_codes ORDER BY created_at DESC`);

    // Get event counts per code
    const { rows: events } = await pool.query(`
      SELECT code, event_type, COUNT(*) as count
      FROM referral_events GROUP BY code, event_type
    `);

    const eventMap = {};
    for (const e of events) {
      if (!eventMap[e.code]) eventMap[e.code] = {};
      eventMap[e.code][e.event_type] = Number(e.count);
    }

    const enriched = codes.map(c => ({
      ...c,
      signups: eventMap[c.code]?.signup || 0,
      day7: eventMap[c.code]?.day7_active || 0,
      day30: eventMap[c.code]?.day30_active || 0,
      premium: eventMap[c.code]?.premium_convert || 0,
    }));

    res.json({ ok: true, referrals: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/referrals', async (req, res) => {
  try {
    const { code, channel, campaign, perks, max_uses } = req.body;
    if (!code || !channel) return res.status(400).json({ error: 'code and channel required' });
    const { pool } = await import('../../db/pool.js');
    await pool.query(
      `INSERT INTO referral_codes (code, channel, campaign, perks, max_uses) VALUES ($1,$2,$3,$4::jsonb,$5)`,
      [code, channel, campaign || null, JSON.stringify(perks || {}), max_uses || 0]
    );
    await auditLog(req, 'createReferralCode', code, { channel, campaign, perks, max_uses });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Code already exists' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/referrals/:code', async (req, res) => {
  try {
    const { perks, max_uses, active, channel, campaign } = req.body;
    const { pool } = await import('../../db/pool.js');
    const updates = [];
    const vals = [];
    let idx = 1;
    if (perks !== undefined) { updates.push(`perks = $${idx++}::jsonb`); vals.push(JSON.stringify(perks)); }
    if (max_uses !== undefined) { updates.push(`max_uses = $${idx++}`); vals.push(max_uses); }
    if (active !== undefined) { updates.push(`active = $${idx++}`); vals.push(active); }
    if (channel !== undefined) { updates.push(`channel = $${idx++}`); vals.push(channel); }
    if (campaign !== undefined) { updates.push(`campaign = $${idx++}`); vals.push(campaign); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.code);
    await pool.query(`UPDATE referral_codes SET ${updates.join(', ')} WHERE code = $${idx}`, vals);
    await auditLog(req, 'updateReferralCode', req.params.code, req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/referrals/:code', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    await pool.query(`DELETE FROM referral_codes WHERE code = $1`, [req.params.code]);
    await auditLog(req, 'deleteReferralCode', req.params.code, {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/referrals/:code/funnel', async (req, res) => {
  try {
    const { pool } = await import('../../db/pool.js');
    const { rows } = await pool.query(
      `SELECT event_type, COUNT(*) as count FROM referral_events WHERE code = $1 GROUP BY event_type`,
      [req.params.code]
    );
    const funnel = {};
    for (const r of rows) funnel[r.event_type] = Number(r.count);
    res.json({ ok: true, code: req.params.code, funnel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
