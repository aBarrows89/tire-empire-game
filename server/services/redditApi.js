// ── Reddit OAuth API Service ──
// Handles authenticated Reddit API calls (posting comments, deleting, fetching threads).
// Uses Reddit "script" app type with password grant.
// Requires env vars: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;
const REDDIT_USERNAME = process.env.REDDIT_USERNAME;
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD;
const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT
  || 'nodejs:tire-empire-admin:v1.0.0 (by /u/TireEmpireGame)';

let cachedToken = null;
let tokenExpiresAt = 0;

export function isRedditApiConfigured() {
  return !!(REDDIT_CLIENT_ID && REDDIT_CLIENT_SECRET && REDDIT_USERNAME && REDDIT_PASSWORD);
}

export async function getAccessToken() {
  if (!isRedditApiConfigured()) {
    throw new Error('Reddit API not configured — set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD in .env');
  }

  // Return cached token if still valid (55 min buffer on 60 min expiry)
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
  const resp = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Reddit OAuth failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  if (data.error) {
    throw new Error(`Reddit OAuth error: ${data.error}`);
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + 55 * 60 * 1000; // Cache for 55 minutes
  return cachedToken;
}

export async function postComment(parentFullname, text) {
  const token = await getAccessToken();
  const resp = await fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT,
    },
    body: new URLSearchParams({
      thing_id: parentFullname,
      text,
      api_type: 'json',
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Reddit comment failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  if (data.json?.errors?.length) {
    throw new Error(`Reddit comment error: ${data.json.errors.map(e => e.join(': ')).join(', ')}`);
  }

  const comment = data.json?.data?.things?.[0]?.data;
  return comment || data;
}

export async function getThreadComments(threadId) {
  // threadId is the raw ID without prefix (e.g. "abc123" not "t3_abc123")
  const id = threadId.startsWith('t3_') ? threadId.slice(3) : threadId;
  const token = await getAccessToken();
  const resp = await fetch(`https://oauth.reddit.com/comments/${id}.json?limit=50&depth=2`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': REDDIT_USER_AGENT,
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Reddit fetch comments failed (${resp.status}): ${errText}`);
  }

  return resp.json();
}

export async function submitPost(subreddit, title, text, flairId) {
  const token = await getAccessToken();
  const params = {
    api_type: 'json',
    kind: 'self',
    sr: subreddit,
    title,
    text,
  };
  if (flairId) params.flair_id = flairId;

  const resp = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT,
    },
    body: new URLSearchParams(params),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Reddit submit failed (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  if (data.json?.errors?.length) {
    throw new Error(`Reddit submit error: ${data.json.errors.map(e => e.join(': ')).join(', ')}`);
  }

  return data.json?.data || data;
}

export async function deleteComment(commentFullname) {
  const token = await getAccessToken();
  const resp = await fetch('https://oauth.reddit.com/api/del', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT,
    },
    body: new URLSearchParams({ id: commentFullname }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Reddit delete failed (${resp.status}): ${errText}`);
  }

  return true;
}
