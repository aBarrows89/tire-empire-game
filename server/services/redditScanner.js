// ── Reddit Scanner Service (Section 21c) ──
// Polls Reddit every 15 minutes for relevant threads.
// Only activates when REDDIT_USER_AGENT is set in env.

const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT
  || 'nodejs:tire-empire-admin:v1.0.0 (by /u/TireEmpireGame)';

const SCAN_INTERVAL_MS = 15 * 60 * 1000;

const SUBREDDITS = [
  'incremental_games', 'tycoon', 'IdleGames', 'WebGames',
  'indiegames', 'AndroidGaming', 'MobileGaming', 'businesssim',
  'playmygame', 'gamedev',
];

const KEYWORDS = [
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
];

const GAMING_SUBS = new Set([
  'incremental_games', 'tycoon', 'IdleGames', 'WebGames',
  'indiegames', 'AndroidGaming', 'MobileGaming', 'businesssim',
  'playmygame',
]);

function scorePost(post, sub) {
  let score = 0;
  const title = (post.title || '').toLowerCase();
  const body = (post.selftext || '').toLowerCase();
  const matched = [];

  for (const kw of KEYWORDS) {
    if (title.includes(kw)) { score += 0.4; matched.push(kw); }
    else if (body.includes(kw)) { score += 0.2; matched.push(kw); }
  }
  if (GAMING_SUBS.has(sub)) score += 0.2;
  const ageHours = (Date.now() / 1000 - post.created_utc) / 3600;
  if (ageHours < 4) score += 0.1;
  else if (ageHours < 24) score += 0.05;
  if (post.num_comments >= 5 && post.num_comments <= 50) score += 0.1;

  return { score: Math.min(1, score), matched };
}

async function runScan() {
  let pool;
  try {
    pool = (await import('../db/pool.js')).pool;
  } catch { return; }

  let totalFound = 0;
  for (const sub of SUBREDDITS) {
    // Scan both "new" and "hot" endpoints for each subreddit
    for (const sort of ['new', 'hot']) {
      try {
        const url = `https://www.reddit.com/r/${sub}/${sort}.json?limit=25`;
        const resp = await fetch(url, {
          headers: { 'User-Agent': REDDIT_USER_AGENT, 'Accept': 'application/json' },
        });
        if (!resp.ok) {
          if (resp.status === 429) await new Promise(r => setTimeout(r, 10000));
          continue;
        }

        const data = await resp.json();
        for (const { data: post } of (data?.data?.children || [])) {
          const { score: relevance, matched } = scorePost(post, sub);
          const minRelevance = GAMING_SUBS.has(sub) ? 0.15 : 0.25;
          if (relevance < minRelevance && matched.length === 0) continue;

          await pool.query(`
            INSERT INTO reddit_threads (id, subreddit, title, body, author, url, score, matched_keywords, relevance, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new')
            ON CONFLICT (id) DO UPDATE SET score = $7, relevance = $9, fetched_at = NOW()
          `, [
            post.name, sub, post.title, (post.selftext || '').slice(0, 2000),
            post.author, `https://reddit.com${post.permalink}`,
            post.score || 0, matched, relevance,
          ]);
          totalFound++;
        }

        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.error(`[RedditScanner] r/${sub}/${sort} error:`, e.message);
      }
    }
  }

  if (totalFound > 0) {
    console.log(`[RedditScanner] Found ${totalFound} relevant threads`);
  }

  // Auto-prune threads older than 30 days
  try {
    await pool.query(`DELETE FROM reddit_threads WHERE fetched_at < NOW() - INTERVAL '30 days' AND status IN ('new','dismissed')`);
  } catch {}
}

let scanInterval = null;

export function startRedditScanner() {
  if (!process.env.REDDIT_USER_AGENT) {
    console.log('[RedditScanner] Disabled — set REDDIT_USER_AGENT in .env to enable');
    return;
  }
  console.log(`[RedditScanner] Starting — scanning every ${SCAN_INTERVAL_MS / 60000} minutes`);
  setTimeout(runScan, 30000);
  scanInterval = setInterval(runScan, SCAN_INTERVAL_MS);
}

export function stopRedditScanner() {
  if (scanInterval) clearInterval(scanInterval);
}
