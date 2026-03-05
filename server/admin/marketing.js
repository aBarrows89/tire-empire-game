/* Marketing Tools — admin frontend */

function loadMarketing() {
  loadRedditScout();
}

// ═══════════════════════════════════════
// REDDIT SCOUT
// ═══════════════════════════════════════

async function loadRedditScout() {
  const el = document.getElementById('reddit-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const status = document.getElementById('reddit-filter')?.value || 'new';
    const res = await fetch(`${API}/marketing/reddit/threads?status=${status}`, { headers: AUTH_HEADER });
    const data = await res.json();
    const threads = data.threads || [];

    el.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">
        <select id="reddit-filter" onchange="loadRedditScout()">
          <option value="new" ${status==='new'?'selected':''}>New</option>
          <option value="reviewed" ${status==='reviewed'?'selected':''}>Reviewed</option>
          <option value="engaged" ${status==='engaged'?'selected':''}>Engaged</option>
          <option value="dismissed" ${status==='dismissed'?'selected':''}>Dismissed</option>
          <option value="all" ${status==='all'?'selected':''}>All</option>
        </select>
        <button class="btn btn-blue btn-sm" onclick="scanReddit()">Scan Now</button>
        <span style="font-size:12px;color:#888">${threads.length} threads</span>
      </div>

      ${threads.map(t => {
        const rel = Math.round((t.relevance || 0) * 100);
        const relColor = rel >= 70 ? '#66bb6a' : rel >= 40 ? '#ffa726' : '#888';
        const keywords = (t.matched_keywords || []).join(', ');
        const bodyPreview = t.body ? (t.body.length > 300 ? t.body.slice(0, 300) + '...' : t.body) : '';
        const safeId = esc(t.id);
        const escapedNotes = t.notes ? esc(t.notes).replace(/'/g, '&#39;').replace(/\n/g, '\\n') : '';
        return `
          <div class="thread-card" id="thread-${safeId}">
            <div class="thread-meta">
              <span style="color:${relColor};font-weight:600">${rel}%</span>
              <span style="margin:0 6px">r/${esc(t.subreddit)}</span>
              <span>${t.score || 0} pts</span>
              ${t.fetched_at ? `<span style="margin-left:8px">${timeAgoMkt(t.fetched_at)}</span>` : ''}
            </div>
            <div class="thread-title">${esc(t.title || 'No title')}</div>
            ${bodyPreview ? `<div style="font-size:12px;color:#aaa;margin:4px 0;line-height:1.4;max-height:60px;overflow:hidden">${esc(bodyPreview)}</div>` : ''}
            ${keywords ? `<div style="font-size:11px;color:#6ec6ff;margin:2px 0">Keywords: ${esc(keywords)}</div>` : ''}
            ${t.notes ? `<div class="thread-angle">${esc(t.notes)}</div>` : ''}
            <div class="thread-actions">
              <a href="${esc(t.url)}" target="_blank" class="btn btn-outline btn-sm">Open Thread</a>
              <button class="btn btn-blue btn-sm" onclick="toggleReplyBox('${safeId}', '${escapedNotes}')">Reply</button>
              <button class="btn btn-outline btn-sm" onclick="toggleCommentHistory('${safeId}')">Comments</button>
              <button class="btn btn-green btn-sm" onclick="updateRedditStatus('${safeId}', 'engaged')">Mark Engaged</button>
              <button class="btn btn-outline btn-sm" onclick="updateRedditStatus('${safeId}', 'reviewed')">Reviewed</button>
              <button class="btn btn-outline btn-sm" onclick="updateRedditStatus('${safeId}', 'dismissed')">Dismiss</button>
            </div>
            <div id="reply-box-${safeId}" style="display:none;margin-top:8px;padding:8px;background:#1a1a2e;border-radius:6px;border:1px solid #333">
              <textarea id="reply-text-${safeId}" rows="4" style="width:100%;background:#111;color:#eee;border:1px solid #444;border-radius:4px;padding:6px;font-size:13px;resize:vertical" placeholder="Write your Reddit comment (markdown)..."></textarea>
              <div style="display:flex;gap:8px;margin-top:6px;align-items:center">
                <button class="btn btn-green btn-sm" onclick="postRedditComment('${safeId}')">Post Comment</button>
                <button class="btn btn-outline btn-sm" onclick="toggleReplyBox('${safeId}')">Cancel</button>
                <span id="reply-status-${safeId}" style="font-size:12px"></span>
              </div>
            </div>
            <div id="comments-${safeId}" style="display:none;margin-top:8px"></div>
          </div>
        `;
      }).join('') || '<div style="text-align:center;padding:32px;color:#666">No threads found. Click "Scan Now" to search Reddit.</div>'}
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

function timeAgoMkt(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function scanReddit() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Scanning...';
  try {
    const res = await fetch(`${API}/marketing/reddit/scan`, { method: 'POST', headers: AUTH_HEADER });
    const data = await res.json();

    if (data.errors && data.errors.length > 0) {
      const errorSummary = data.errors.map(e => `r/${e.sub}: ${e.error}`).join('\n');
      console.warn('Reddit scan errors:', errorSummary);
      btn.textContent = `Found ${data.threadsFound || 0} (${data.errors.length} errors)`;
      btn.style.color = '#ffa726';
    } else {
      btn.textContent = `Found ${data.threadsFound || 0}`;
    }

    setTimeout(() => { btn.textContent = 'Scan Now'; btn.disabled = false; btn.style.color = ''; }, 3000);
    loadRedditScout();
  } catch (e) {
    btn.textContent = 'Error: ' + e.message;
    setTimeout(() => { btn.textContent = 'Scan Now'; btn.disabled = false; }, 3000);
  }
}

async function updateRedditStatus(id, status) {
  await fetch(`${API}/marketing/reddit/threads/${id}/status`, {
    method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ status }),
  });
  loadRedditScout();
}

function toggleReplyBox(threadId, suggestedText) {
  const box = document.getElementById(`reply-box-${threadId}`);
  if (!box) return;
  const isHidden = box.style.display === 'none';
  box.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const textarea = document.getElementById(`reply-text-${threadId}`);
    if (textarea && !textarea.value && suggestedText) {
      textarea.value = suggestedText.replace(/&#39;/g, "'").replace(/\\n/g, '\n');
    }
    textarea?.focus();
  }
}

async function postRedditComment(threadId) {
  const textarea = document.getElementById(`reply-text-${threadId}`);
  const statusEl = document.getElementById(`reply-status-${threadId}`);
  const text = textarea?.value?.trim();
  if (!text) { statusEl.textContent = 'Comment text is required'; statusEl.style.color = '#ef5350'; return; }

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Posting...';
  statusEl.textContent = '';
  try {
    const res = await fetch(`${API}/marketing/reddit/threads/${threadId}/comment`, {
      method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.error) {
      statusEl.textContent = data.error;
      statusEl.style.color = '#ef5350';
    } else {
      statusEl.textContent = 'Posted successfully!';
      statusEl.style.color = '#66bb6a';
      textarea.value = '';
      setTimeout(() => {
        document.getElementById(`reply-box-${threadId}`).style.display = 'none';
        loadRedditScout();
      }, 1500);
    }
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#ef5350';
  }
  btn.disabled = false;
  btn.textContent = 'Post Comment';
}

async function toggleCommentHistory(threadId) {
  const el = document.getElementById(`comments-${threadId}`);
  if (!el) return;
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = '<em style="color:#888;font-size:12px">Loading comments...</em>';
  try {
    const res = await fetch(`${API}/marketing/reddit/threads/${threadId}/comments`, { headers: AUTH_HEADER });
    const data = await res.json();
    const comments = (data.comments || []).filter(c => !c.deleted);
    if (comments.length === 0) {
      el.innerHTML = '<div style="font-size:12px;color:#666;padding:8px;background:#1a1a2e;border-radius:6px;border:1px solid #333">No comments posted on this thread yet.</div>';
      return;
    }
    el.innerHTML = `<div style="padding:8px;background:#1a1a2e;border-radius:6px;border:1px solid #333">
      <div style="font-size:11px;color:#888;margin-bottom:6px;font-weight:600">Our Comments (${comments.length})</div>
      ${comments.map(c => `
        <div style="padding:6px 0;border-top:1px solid #333;font-size:12px">
          <div style="color:#ddd;white-space:pre-wrap;line-height:1.4;margin-bottom:4px">${esc(c.body)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:#888">${c.posted_by || 'admin'} &middot; ${timeAgoMkt(c.posted_at)}</span>
            <button class="btn btn-red btn-sm" style="font-size:10px;padding:2px 6px" onclick="deleteRedditComment('${esc(c.id)}', '${esc(threadId)}')">Delete</button>
          </div>
        </div>
      `).join('')}
    </div>`;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350;font-size:12px">Error: ${esc(e.message)}</em>`;
  }
}

async function deleteRedditComment(commentId, threadId) {
  if (!confirm('Delete this comment from Reddit?')) return;
  try {
    const res = await fetch(`${API}/marketing/reddit/comments/${commentId}`, { method: 'DELETE', headers: AUTH_HEADER });
    const data = await res.json();
    if (data.error) alert(data.error);
    else toggleCommentHistory(threadId); // re-hide then re-show to refresh
    setTimeout(() => toggleCommentHistory(threadId), 100);
  } catch (e) { alert('Error: ' + e.message); }
}

// ═══════════════════════════════════════
// REDDIT POST GENERATOR
// ═══════════════════════════════════════

const MECHANIC_SNIPPETS = {
  core: 'Start with $500 and a van full of used tires. Build your way to retail shops, wholesale distribution, e-commerce, and a full tire manufacturing factory.',
  stock_exchange: 'Player-driven stock exchange (TESX) where you can IPO your company, trade shares in other players, margin trade, and short sell.',
  multiplayer: 'Real-time shared economy — every player affects prices, supply, and demand. Compete for market share or supply each other wholesale.',
  factory: 'Build a tire factory with R&D projects (Ultra-Grip, Silent Ride, EV Optimized). Produce and sell your own brand of tires.',
  progression: '18 tire types, 100+ US cities for retail locations, rep-gated progression from Rep 0 (van sales) to Rep 75 (manufacturing).',
  economy: 'Dynamic market events — rubber shortages, port strikes, holiday rushes — affect all players simultaneously.',
  depth: 'Hire staff, manage pricing, run marketing campaigns, handle e-commerce SEO, negotiate wholesale contracts, and more.',
  authentic: 'Built by someone in actual tire distribution. Real supplier tiers, DOT codes, freight zones, and industry mechanics.',
  mobile: 'Play on web or mobile (Android via Capacitor). Tick-based sim — make decisions, check back later.',
};

const REDDIT_POST_SUBREDDITS = [
  'incremental_games', 'tycoon', 'IdleGames', 'WebGames',
  'indiegames', 'AndroidGaming', 'MobileGaming', 'businesssim',
  'playmygame', 'gamedev',
];

function getPostTemplate(type, stats) {
  const s = stats || {};
  const fmt = n => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${Math.round(n || 0)}`;

  switch (type) {
    case 'weekly_recap':
      return {
        title: `Tire Empire Weekly Recap — Day ${s.day || '?'}`,
        body: `**This week in Tire Empire:**\n\n` +
          `📊 **${s.activePlayers || '?'}** active players running tire empires\n` +
          `💰 Total economy: **${fmt(s.totalCash)}**\n` +
          `📈 TireCoin value: **${fmt(s.tcValue)}**\n` +
          `🏆 Top earner: **${s.topPlayer || 'N/A'}** (${fmt(s.topWealth)})\n` +
          `🌐 Active events: ${s.events || 'None'}\n\n` +
          `${MECHANIC_SNIPPETS.core}\n\n` +
          `${MECHANIC_SNIPPETS.multiplayer}\n\n` +
          `**Play free at tireempire.com**`,
      };
    case 'devlog':
      return {
        title: `Tire Empire Devlog — [Headline]`,
        body: `Hey r/[subreddit]!\n\n` +
          `[Editable intro paragraph]\n\n` +
          `**What's new:**\n- [Change 1]\n- [Change 2]\n\n` +
          `**Current stats:** ${s.activePlayers || '?'} players, ${fmt(s.totalCash)} economy, TC at ${fmt(s.tcValue)}\n\n` +
          `**About the game:**\n${MECHANIC_SNIPPETS.core}\n\n` +
          `${MECHANIC_SNIPPETS.authentic}\n\n` +
          `${MECHANIC_SNIPPETS.stock_exchange}\n\n` +
          `**Play free:** tireempire.com\n\n` +
          `Happy to answer any questions about the game or the tech behind it!`,
      };
    case 'community':
      return {
        title: `You start with $500 and a van of used tires. What's your strategy?`,
        body: `In Tire Empire, every player starts the same way — **$500 cash and 20 used tires in a van.** From there, you build a tire business empire.\n\n` +
          `The question is: what's your opening move?\n\n` +
          `${MECHANIC_SNIPPETS.progression}\n\n` +
          `${MECHANIC_SNIPPETS.economy}\n\n` +
          `Some players rush to open retail shops. Others grind the flea market circuit. A few go straight for the stock exchange.\n\n` +
          `**What would you do?**\n\n` +
          `(Game is free to play at tireempire.com)`,
      };
    case 'feedback':
      return {
        title: `Tire Empire — multiplayer tire business sim, looking for feedback`,
        body: `Hey! I've been building a multiplayer business simulation game where you start with $500 and a van of used tires, and build your way to a full tire empire.\n\n` +
          `**What makes it different:**\n` +
          `- ${MECHANIC_SNIPPETS.multiplayer}\n` +
          `- ${MECHANIC_SNIPPETS.stock_exchange}\n` +
          `- ${MECHANIC_SNIPPETS.authentic}\n\n` +
          `**Current stats:** ${s.activePlayers || '?'} active players, ${fmt(s.totalCash)} total economy\n\n` +
          `${MECHANIC_SNIPPETS.mobile}\n\n` +
          `Would love any feedback — what works, what doesn't, what you'd want to see.\n\n` +
          `**Play free:** tireempire.com`,
      };
    case 'custom':
    default:
      return { title: '', body: '' };
  }
}

let _postGeneratorStats = null;

async function loadRedditPostGenerator() {
  const el = document.getElementById('reddit-post-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    // Fetch live stats
    const statsRes = await fetch(`${API}/marketing/content`, { headers: AUTH_HEADER });
    const statsData = await statsRes.json();
    _postGeneratorStats = statsData.stats || {};

    // Fetch post history
    const histRes = await fetch(`${API}/marketing/reddit/posts`, { headers: AUTH_HEADER });
    const histData = await histRes.json();
    const posts = histData.posts || [];

    const s = _postGeneratorStats;
    const fmt = n => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${Math.round(n || 0)}`;

    el.innerHTML = `
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card"><div class="label">Game Day</div><div class="value">${s.day || '?'}</div></div>
        <div class="stat-card"><div class="label">Active Players</div><div class="value green">${s.activePlayers || '?'}</div></div>
        <div class="stat-card"><div class="label">Total Economy</div><div class="value gold">${fmt(s.totalCash)}</div></div>
        <div class="stat-card"><div class="label">TC Value</div><div class="value blue">${fmt(s.tcValue)}</div></div>
      </div>

      <div style="padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:16px">
        <h4 style="margin-bottom:12px;font-size:14px">Compose Reddit Post</h4>
        <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          <div class="edit-field">
            <label>Template</label>
            <select id="rpost-template" onchange="applyRedditPostTemplate()">
              <option value="weekly_recap">Weekly Recap</option>
              <option value="devlog">Devlog / Update</option>
              <option value="community">Community Discussion</option>
              <option value="feedback">Looking for Feedback</option>
              <option value="custom">Custom (blank)</option>
            </select>
          </div>
          <div class="edit-field">
            <label>Subreddit</label>
            <select id="rpost-subreddit">
              ${REDDIT_POST_SUBREDDITS.map(s => `<option value="${s}">r/${s}</option>`).join('')}
            </select>
          </div>
          <div class="edit-field">
            <label>Flair ID (optional)</label>
            <input type="text" id="rpost-flair" placeholder="e.g. abc123" style="width:140px">
          </div>
        </div>
        <div class="edit-field" style="margin-bottom:8px">
          <label>Title</label>
          <input type="text" id="rpost-title" style="width:100%" placeholder="Post title...">
        </div>
        <div class="edit-field" style="margin-bottom:8px">
          <label>Body (Markdown)</label>
          <textarea id="rpost-body" rows="12" style="width:100%;background:#111;color:#eee;border:1px solid #444;border-radius:4px;padding:8px;font-size:13px;font-family:monospace;resize:vertical" placeholder="Post body (markdown)..."></textarea>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-green" onclick="submitRedditPost()">Post to Reddit</button>
          <button class="btn btn-outline btn-sm" onclick="applyRedditPostTemplate()">Reset Template</button>
          <span id="rpost-status" style="font-size:13px"></span>
        </div>
      </div>

      <details style="margin-bottom:16px">
        <summary style="cursor:pointer;font-size:14px;font-weight:600;color:#aaa;padding:8px 0">Post History (${posts.length})</summary>
        <div style="margin-top:8px">
          ${posts.length > 0 ? posts.map(p => `
            <div class="thread-card">
              <div class="thread-meta">
                <span style="color:#4ea8de">r/${esc(p.subreddit)}</span>
                <span style="margin-left:8px">${p.posted_by || 'admin'}</span>
                <span style="margin-left:8px">${timeAgoMkt(p.posted_at)}</span>
              </div>
              <div class="thread-title">${esc(p.title)}</div>
              <div style="font-size:12px;color:#aaa;margin:4px 0;max-height:60px;overflow:hidden;white-space:pre-wrap">${esc((p.body || '').slice(0, 300))}</div>
              ${p.url ? `<a href="${esc(p.url)}" target="_blank" class="btn btn-outline btn-sm" style="margin-top:4px">View on Reddit</a>` : ''}
            </div>
          `).join('') : '<em style="color:#555">No posts yet</em>'}
        </div>
      </details>

      <details>
        <summary style="cursor:pointer;font-size:14px;font-weight:600;color:#aaa;padding:8px 0">Game Mechanic Snippets</summary>
        <div style="margin-top:8px;display:grid;gap:8px">
          ${Object.entries(MECHANIC_SNIPPETS).map(([key, val]) => `
            <div style="padding:8px;background:#111;border-radius:6px;border:1px solid #333;font-size:12px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <code style="color:#6ec6ff">${esc(key)}</code>
                <button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 6px" onclick="insertSnippet('${esc(key)}')">Insert</button>
              </div>
              <div style="color:#aaa">${esc(val)}</div>
            </div>
          `).join('')}
        </div>
      </details>
    `;

    // Auto-apply first template
    applyRedditPostTemplate();
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

function applyRedditPostTemplate() {
  const type = document.getElementById('rpost-template')?.value || 'custom';
  const tmpl = getPostTemplate(type, _postGeneratorStats);
  const titleEl = document.getElementById('rpost-title');
  const bodyEl = document.getElementById('rpost-body');
  if (titleEl) titleEl.value = tmpl.title;
  if (bodyEl) bodyEl.value = tmpl.body;
}

function insertSnippet(key) {
  const bodyEl = document.getElementById('rpost-body');
  if (!bodyEl || !MECHANIC_SNIPPETS[key]) return;
  const start = bodyEl.selectionStart;
  const end = bodyEl.selectionEnd;
  const text = bodyEl.value;
  bodyEl.value = text.slice(0, start) + MECHANIC_SNIPPETS[key] + text.slice(end);
  bodyEl.focus();
  bodyEl.selectionStart = bodyEl.selectionEnd = start + MECHANIC_SNIPPETS[key].length;
}

async function submitRedditPost() {
  const subreddit = document.getElementById('rpost-subreddit')?.value;
  const title = document.getElementById('rpost-title')?.value?.trim();
  const text = document.getElementById('rpost-body')?.value?.trim();
  const flairId = document.getElementById('rpost-flair')?.value?.trim() || undefined;
  const statusEl = document.getElementById('rpost-status');

  if (!title || !text) {
    statusEl.textContent = 'Title and body are required';
    statusEl.style.color = '#ef5350';
    return;
  }

  if (!confirm(`Post to r/${subreddit}?\n\nTitle: ${title}`)) return;

  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Posting...';
  statusEl.textContent = '';
  try {
    const res = await fetch(`${API}/marketing/reddit/post`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ subreddit, title, text, flairId }),
    });
    const data = await res.json();
    if (data.error) {
      statusEl.textContent = data.error;
      statusEl.style.color = '#ef5350';
    } else {
      statusEl.innerHTML = `Posted! ${data.url ? `<a href="${esc(data.url)}" target="_blank" style="color:#4ea8de">View on Reddit</a>` : ''}`;
      statusEl.style.color = '#66bb6a';
      setTimeout(() => loadRedditPostGenerator(), 2000);
    }
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#ef5350';
  }
  btn.disabled = false;
  btn.textContent = 'Post to Reddit';
}

// ═══════════════════════════════════════
// SOCIAL CONTENT GENERATOR
// ═══════════════════════════════════════

async function loadSocialContent() {
  const el = document.getElementById('social-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/marketing/content`, { headers: AUTH_HEADER });
    const data = await res.json();

    const content = data.content || [];
    const stats = data.stats || {};
    const fmt = n => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${Math.round(n)}`;

    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Game Day</div><div class="value">${stats.day}</div></div>
        <div class="stat-card"><div class="label">Active Players</div><div class="value green">${stats.activePlayers}</div></div>
        <div class="stat-card"><div class="label">Total Economy</div><div class="value gold">${fmt(stats.totalCash || 0)}</div></div>
        <div class="stat-card"><div class="label">TC Value</div><div class="value blue">${fmt(stats.tcValue || 0)}</div></div>
      </div>

      <h4 style="margin-bottom:12px">Content Drafts</h4>
      ${content.map((c, i) => `
        <div class="thread-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div>
              <span class="badge badge-blue">${esc(c.platform)}</span>
              <span class="badge badge-gray" style="margin-left:4px">${esc(c.type)}</span>
            </div>
            <button class="btn btn-outline btn-sm" onclick="copyContent(${i})">Copy</button>
          </div>
          ${c.title ? `<div style="font-weight:600;margin-bottom:4px">${esc(c.title)}</div>` : ''}
          <pre id="content-${i}" style="font-size:12px;white-space:pre-wrap;word-break:break-word;background:#111;padding:8px;border-radius:6px;max-height:200px;overflow:auto">${esc(c.body)}</pre>
        </div>
      `).join('')}
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

function copyContent(idx) {
  const pre = document.getElementById(`content-${idx}`);
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => {
    const btn = event.target;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

// ═══════════════════════════════════════
// REFERRAL TRACKING
// ═══════════════════════════════════════

async function loadReferrals() {
  const el = document.getElementById('referral-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/marketing/referrals`, { headers: AUTH_HEADER });
    const data = await res.json();
    const referrals = data.referrals || [];

    el.innerHTML = `
      <div style="padding:12px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:16px">
        <h4 style="margin-bottom:8px;font-size:14px">New Referral Code</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="edit-field"><label>Code</label><input type="text" id="ref-code" placeholder="e.g. reddit_tycoon"></div>
          <div class="edit-field"><label>Channel</label>
            <select id="ref-channel">
              <option value="reddit">Reddit</option>
              <option value="twitter">Twitter</option>
              <option value="discord">Discord</option>
              <option value="direct">Direct</option>
              <option value="friend">Friend</option>
            </select>
          </div>
          <div class="edit-field"><label>Campaign</label><input type="text" id="ref-campaign" placeholder="Optional"></div>
          <button class="btn btn-green btn-sm" onclick="createReferral()">Create</button>
        </div>
      </div>

      ${referrals.length > 0 ? `
        <table>
          <thead><tr><th>Code</th><th>Channel</th><th>Signups</th><th>7-Day</th><th>30-Day</th><th>Premium</th><th>Conv %</th><th></th></tr></thead>
          <tbody>${referrals.map(r => {
            const conv = r.signups > 0 ? Math.round(r.premium / r.signups * 100) : 0;
            return `<tr>
              <td><code style="color:#6ec6ff">${esc(r.code)}</code></td>
              <td>${esc(r.channel)}</td>
              <td>${r.signups}</td>
              <td>${r.day7}</td>
              <td>${r.day30}</td>
              <td>${r.premium}</td>
              <td>${conv}%</td>
              <td><button class="btn btn-red btn-sm" onclick="deleteReferral('${esc(r.code)}')">Del</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      ` : '<em style="color:#555">No referral codes yet</em>'}
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

async function createReferral() {
  const code = document.getElementById('ref-code').value.trim();
  const channel = document.getElementById('ref-channel').value;
  const campaign = document.getElementById('ref-campaign').value.trim();
  if (!code) return alert('Code required');
  try {
    const res = await fetch(`${API}/marketing/referrals`, {
      method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ code, channel, campaign: campaign || undefined }),
    });
    const data = await res.json();
    if (data.error) alert(data.error);
    loadReferrals();
  } catch (e) { alert('Error: ' + e.message); }
}

async function deleteReferral(code) {
  if (!confirm(`Delete referral code "${code}"?`)) return;
  await fetch(`${API}/marketing/referrals/${code}`, { method: 'DELETE', headers: AUTH_HEADER });
  loadReferrals();
}
