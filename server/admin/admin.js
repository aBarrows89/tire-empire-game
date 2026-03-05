/* Tire Empire Admin Dashboard — vanilla JS, no dependencies */

const API = '/api/admin';
let AUTH_HEADER = {};
let currentPlayerPage = 1;

// Restore auth from session storage on page refresh
try {
  const savedAuth = sessionStorage.getItem('te_admin_auth');
  if (savedAuth) {
    AUTH_HEADER = JSON.parse(savedAuth);
  }
} catch {}
let _tickSource = null;
let currentDetailId = null;

// ═══════════════════════════════════════
// AUTH — Google Sign-In + Dev UID fallback
// ═══════════════════════════════════════

// Initialize Firebase if config is available (production)
(async function initAuth() {
  try {
    const res = await fetch('/admin/firebase-config');
    const config = await res.json();
    if (config && config.apiKey && config.projectId) {
      firebase.initializeApp(config);
      document.getElementById('google-signin-btn').style.display = '';
      document.getElementById('dev-auth-form').style.display = 'none';

      // ── Auth state persistence ──
      // Firebase persists the signed-in user across page reloads.
      // onAuthStateChanged fires on load if the user is already signed in,
      // so we don't need to manually restore Bearer tokens from sessionStorage.
      firebase.auth().onAuthStateChanged(async (user) => {
        if (!user) return; // Not signed in — show the login form, do nothing
        try {
          const token = await user.getIdToken();
          AUTH_HEADER = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
          try { sessionStorage.setItem('te_admin_auth', JSON.stringify(AUTH_HEADER)); } catch {}

          // Verify this user is actually an admin before showing the dashboard
          const verify = await fetch(`${API}/server-stats`, { headers: AUTH_HEADER });
          if (!verify.ok) {
            // Signed in to Firebase but not whitelisted — sign them back out
            await firebase.auth().signOut();
            document.getElementById('auth-status').textContent = 'Not an admin — your Google account is not whitelisted';
            document.getElementById('auth-status').style.color = '#ef5350';
            return;
          }

          onAuthSuccess(user.email || user.uid);

          // Keep token fresh — update AUTH_HEADER whenever Firebase rotates it
          firebase.auth().onIdTokenChanged(async (u) => {
            if (u) {
              const newToken = await u.getIdToken();
              AUTH_HEADER = { 'Authorization': `Bearer ${newToken}`, 'Content-Type': 'application/json' };
              try { sessionStorage.setItem('te_admin_auth', JSON.stringify(AUTH_HEADER)); } catch {}
            }
          });
        } catch (e) {
          console.error('Auth state restore error:', e);
        }
      });
    }
  } catch (e) {
    // No Firebase config — dev mode, show UID input
  }
})();

document.getElementById('google-signin-btn')?.addEventListener('click', googleSignIn);
document.getElementById('auth-btn')?.addEventListener('click', devAuthenticate);
document.getElementById('admin-uid-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') devAuthenticate();
});

async function googleSignIn() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().signInWithPopup(provider);
    // onAuthStateChanged (registered in initAuth) fires after signInWithPopup,
    // verifies admin status, and calls onAuthSuccess. Nothing else needed here.
  } catch (e) {
    document.getElementById('auth-status').textContent = 'Sign-in failed: ' + e.message;
    document.getElementById('auth-status').style.color = '#ef5350';
  }
}

async function devAuthenticate() {
  const uid = document.getElementById('admin-uid-input').value.trim();
  if (!uid) return;

  AUTH_HEADER = { 'X-Player-Id': uid, 'Content-Type': 'application/json' };
  try { sessionStorage.setItem('te_admin_auth', JSON.stringify(AUTH_HEADER)); } catch {}

  try {
    const res = await fetch(`${API}/server-stats`, { headers: AUTH_HEADER });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      document.getElementById('auth-status').textContent = err.error || 'Auth failed';
      document.getElementById('auth-status').style.color = '#ef5350';
      return;
    }
    onAuthSuccess(uid);
  } catch (e) {
    document.getElementById('auth-status').textContent = 'Connection failed';
    document.getElementById('auth-status').style.color = '#ef5350';
  }
}

// Auto-restore session on page load
(function autoRestore() {
  try {
    const savedAuth = sessionStorage.getItem('te_admin_auth');
    if (savedAuth) {
      const parsed = JSON.parse(savedAuth);
      if (parsed['X-Player-Id']) {
        AUTH_HEADER = parsed;
        // Verify still valid
        fetch(API + '/server-stats', { headers: AUTH_HEADER }).then(res => {
          if (res.ok) {
            onAuthSuccess(parsed['X-Player-Id']);
          } else {
            sessionStorage.removeItem('te_admin_auth');
          }
        }).catch(() => {});
      }
    }
  } catch {}
})();

function onAuthSuccess(displayName) {
  document.getElementById('auth-status').textContent = `Authenticated as ${displayName}`;
  document.getElementById('auth-status').style.color = '#4caf50';
  document.getElementById('auth-form').classList.add('hidden');
  document.getElementById('admin-tabs').style.display = 'flex';
  document.getElementById('admin-content').style.display = 'block';
  loadPlayers();
  initCreatePlayerForm();
  startTickStream();
}

// ═══════════════════════════════════════
// LIVE TICK STREAM (SSE)
// ═══════════════════════════════════════

function startTickStream() {
  if (_tickSource) { _tickSource.close(); _tickSource = null; }

  // Build SSE URL with auth query params (EventSource doesn't support headers)
  const params = new URLSearchParams();
  if (AUTH_HEADER['Authorization']) {
    params.set('token', AUTH_HEADER['Authorization'].replace('Bearer ', ''));
  }
  if (AUTH_HEADER['X-Player-Id']) {
    params.set('devId', AUTH_HEADER['X-Player-Id']);
  }

  _tickSource = new EventSource(`${API}/tick-stream?${params.toString()}`);

  _tickSource.onopen = () => {
    const el = document.getElementById('live-indicator');
    if (el) { el.style.display = ''; el.title = 'Live — auto-refreshing every tick'; }
  };

  _tickSource.onmessage = (e) => {
    try { JSON.parse(e.data); } catch { return; }
    refreshActiveView();
  };

  _tickSource.onerror = () => {
    const el = document.getElementById('live-indicator');
    if (el) { el.style.display = 'none'; }
  };
}

function refreshActiveView() {
  const activeTab = document.querySelector('.tab.active');
  if (!activeTab) return;
  const tab = activeTab.dataset.tab;

  // Find active sub-tab if any
  const section = document.getElementById(`tab-${tab}`);
  const activeSub = section?.querySelector('.sub-tab.active')?.dataset?.sub;

  switch (tab) {
    case 'players': loadPlayers(); break;
    case 'chat': loadChat(); break;
    case 'economy':
      if (activeSub === 'economy-bots' && typeof loadBots === 'function') loadBots();
      else if (activeSub === 'economy-simulator' && typeof loadSimulator === 'function') loadSimulator();
      else if (activeSub === 'economy-schedule' && typeof loadSchedule === 'function') loadSchedule();
      else if (activeSub === 'economy-watch' && typeof loadMarketWatch === 'function') loadMarketWatch();
      else loadEconomy();
      break;
    case 'events': loadEvents(); break;
    case 'operations':
      if (activeSub === 'ops-audit') loadAuditLog();
      else if (activeSub === 'ops-health' && typeof loadDbHealth === 'function') loadDbHealth();
      else if (activeSub === 'ops-announce' && typeof loadAnnouncements === 'function') loadAnnouncements();
      else if (activeSub === 'ops-abtests' && typeof loadAbTests === 'function') loadAbTests();
      else if (activeSub === 'ops-revenue' && typeof loadRevenue === 'function') loadRevenue();
      else loadServerStats();
      break;
    case 'marketing':
      if (activeSub === 'mkt-reddit' && typeof loadRedditScout === 'function') loadRedditScout();
      else if (activeSub === 'mkt-posts' && typeof loadRedditPostGenerator === 'function') loadRedditPostGenerator();
      else if (activeSub === 'mkt-content' && typeof loadSocialContent === 'function') loadSocialContent();
      else if (activeSub === 'mkt-referrals' && typeof loadReferrals === 'function') loadReferrals();
      break;
    case 'retention':
      if (activeSub === 'ret-churn' && typeof loadChurnRisk === 'function') loadChurnRisk();
      else if (activeSub === 'ret-journey' && typeof loadJourneys === 'function') loadJourneys();
      else if (activeSub === 'ret-push' && typeof loadPushManager === 'function') loadPushManager();
      break;
    case 'settings': loadSettings(); break;
  }
}

// ═══════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════

document.getElementById('admin-tabs')?.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  const id = tab.dataset.tab;

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById(`tab-${id}`).classList.add('active');

  if (id === 'players') loadPlayers();
  if (id === 'chat') { loadChat(); loadMutes(); }
  if (id === 'economy') loadEconomy();
  if (id === 'events') loadEvents();
  if (id === 'operations') { loadServerStats(); loadAuditLog(); if (typeof loadOperations === 'function') loadOperations(); }
  if (id === 'marketing') { if (typeof loadMarketing === 'function') loadMarketing(); }
  if (id === 'retention') { if (typeof loadRetention === 'function') loadRetention(); }
  if (id === 'settings') loadSettings();

  // Auto-refresh handled by SSE tick stream
});

// ═══════════════════════════════════════
// SUB-TAB SWITCHING (delegated)
// ═══════════════════════════════════════

document.addEventListener('click', e => {
  const subTab = e.target.closest('.sub-tab');
  if (!subTab) return;
  const container = subTab.closest('.tab-content');
  if (!container) return;
  container.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  container.querySelectorAll('.sub-content').forEach(c => c.classList.remove('active'));
  subTab.classList.add('active');
  const target = document.getElementById(subTab.dataset.sub);
  if (target) target.classList.add('active');

  // Trigger sub-tab load functions
  const sub = subTab.dataset.sub;
  if (sub === 'economy-bots' && typeof loadBots === 'function') loadBots();
  if (sub === 'economy-simulator' && typeof loadSimulator === 'function') loadSimulator();
  if (sub === 'economy-schedule' && typeof loadSchedule === 'function') loadSchedule();
  if (sub === 'economy-watch' && typeof loadMarketWatch === 'function') loadMarketWatch();
  if (sub === 'ops-health' && typeof loadDbHealth === 'function') loadDbHealth();
  if (sub === 'ops-announce' && typeof loadAnnouncements === 'function') loadAnnouncements();
  if (sub === 'ops-abtests' && typeof loadAbTests === 'function') loadAbTests();
  if (sub === 'ops-revenue' && typeof loadRevenue === 'function') loadRevenue();
  if (sub === 'ops-audit') loadAuditLog();
  if (sub === 'ops-system') loadServerStats();
  if (sub === 'mkt-reddit' && typeof loadRedditScout === 'function') loadRedditScout();
  if (sub === 'mkt-posts' && typeof loadRedditPostGenerator === 'function') loadRedditPostGenerator();
  if (sub === 'mkt-content' && typeof loadSocialContent === 'function') loadSocialContent();
  if (sub === 'mkt-referrals' && typeof loadReferrals === 'function') loadReferrals();
  if (sub === 'ret-churn' && typeof loadChurnRisk === 'function') loadChurnRisk();
  if (sub === 'ret-journey' && typeof loadJourneys === 'function') loadJourneys();
  if (sub === 'ret-push' && typeof loadPushManager === 'function') loadPushManager();
});

// ═══════════════════════════════════════
// PLAYERS
// ═══════════════════════════════════════

document.getElementById('player-search-btn')?.addEventListener('click', () => { currentPlayerPage = 1; loadPlayers(); });
document.getElementById('player-search')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { currentPlayerPage = 1; loadPlayers(); }
});

async function loadPlayers() {
  const search = document.getElementById('player-search').value.trim();
  const params = new URLSearchParams({ page: currentPlayerPage, limit: 30 });
  if (search) params.set('search', search);

  try {
    const res = await fetch(`${API}/players?${params}`, { headers: AUTH_HEADER });
    const data = await res.json();
    const tbody = document.getElementById('player-tbody');
    tbody.innerHTML = '';

    for (const p of data.players) {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => loadPlayerDetail(p.id));

      const statusBadges = [];
      if (p.isPremium) statusBadges.push('<span class="badge badge-gold">PRO</span>');
      if (p.isBanned) statusBadges.push('<span class="badge badge-red">BANNED</span>');
      if (p.isBot) statusBadges.push(`<span class="badge badge-blue">Bot (${p.botIntensity})</span>`);
      else if (p.isAI) statusBadges.push('<span class="badge badge-gray">AI</span>');

      tr.innerHTML = `
        <td><strong>${esc(p.companyName)}</strong>${p.factoryBrand ? `<br><span style="color:#4ea8de;font-size:11px">Brand: ${esc(p.factoryBrand)}</span>` : ''}<br><span style="color:#555;font-size:11px">${esc(p.id.slice(0, 12))}...</span></td>
        <td>$${fmt(p.cash)}</td>
        <td>${fmt(p.tireCoins)}</td>
        <td>${p.reputation}</td>
        <td>${p.locations}</td>
        <td>$${fmt(p.wealth)}</td>
        <td>${statusBadges.join(' ') || '<span class="badge badge-green">Active</span>'}</td>
        <td><button class="btn btn-outline btn-sm" onclick="event.stopPropagation();loadPlayerDetail('${esc(p.id)}')">View</button></td>
      `;
      tbody.appendChild(tr);
    }

    const totalPages = Math.ceil(data.total / 30);
    const pg = document.getElementById('player-pagination');
    pg.innerHTML = `Page ${data.page} of ${totalPages} (${data.total} players)`;
    if (totalPages > 1) {
      if (currentPlayerPage > 1) {
        pg.innerHTML += ` <button class="btn btn-outline btn-sm" onclick="currentPlayerPage--;loadPlayers()">Prev</button>`;
      }
      if (currentPlayerPage < totalPages) {
        pg.innerHTML += ` <button class="btn btn-outline btn-sm" onclick="currentPlayerPage++;loadPlayers()">Next</button>`;
      }
    }
  } catch (e) {
    console.error('Failed to load players:', e);
  }
}

async function loadPlayerDetail(id) {
  currentDetailId = id;
  try {
    const res = await fetch(`${API}/players/${id}`, { headers: AUTH_HEADER });
    const player = await res.json();
    const g = player.game_state || {};

    document.getElementById('detail-name').textContent = g.companyName || player.name || id;

    const statsHtml = `
      <div class="detail-grid">
        <div class="detail-row"><span class="label">Player ID</span><span>${esc(id)}</span></div>
        <div class="detail-row"><span class="label">Day</span><span>${g.day || 0}</span></div>
        <div class="detail-row"><span class="label">Cash</span><span>$${fmt(Math.round(g.cash || 0))}</span></div>
        <div class="detail-row"><span class="label">TireCoins</span><span>${g.tireCoins || 0}</span></div>
        <div class="detail-row"><span class="label">Reputation</span><span>${(g.reputation || 0).toFixed(1)}</span></div>
        <div class="detail-row"><span class="label">Locations</span><span>${(g.locations || []).length}</span></div>
        <div class="detail-row"><span class="label">Total Revenue</span><span>$${fmt(Math.round(g.totalRev || 0))}</span></div>
        <div class="detail-row"><span class="label">Total Sold</span><span>${g.totalSold || 0} tires</span></div>
        <div class="detail-row"><span class="label">Factory</span><span>${g.factory ? 'Level ' + (g.factory.level || 1) : 'None'}</span></div>
        <div class="detail-row"><span class="label">Premium</span><span>${g.isPremium ? '<span class="badge badge-gold">YES</span>' : 'No'}</span></div>
        <div class="detail-row"><span class="label">Banned</span><span>${g.isBanned ? '<span class="badge badge-red">YES</span>' : 'No'}</span></div>
        <div class="detail-row"><span class="label">TC Storage Lvl</span><span>${g.tcStorageLevel || 0}</span></div>
      </div>
    `;
    document.getElementById('detail-stats').innerHTML = statsHtml;

    // Boost presets
    const boostsHtml = `
      <h3 style="margin-bottom:6px;font-size:14px">Quick Boosts</h3>
      <div class="boost-grid">
        <button class="boost-btn green" onclick="boostPlayer('${esc(id)}','cash1m')">+$1M Cash</button>
        <button class="boost-btn green" onclick="boostPlayer('${esc(id)}','cash10m')">+$10M Cash</button>
        <button class="boost-btn green" onclick="boostPlayer('${esc(id)}','cash50m')">+$50M Cash</button>
        <button class="boost-btn gold" onclick="boostPlayer('${esc(id)}','tc500')">+500 TC</button>
        <button class="boost-btn gold" onclick="boostPlayer('${esc(id)}','tc2000')">+2000 TC</button>
        <button class="boost-btn blue" onclick="boostPlayer('${esc(id)}','rep50')">Rep = 50</button>
        <button class="boost-btn blue" onclick="boostPlayer('${esc(id)}','rep100')">Rep = 100</button>
        <button class="boost-btn" onclick="boostPlayer('${esc(id)}','factory')">Grant Factory</button>
        <button class="boost-btn" onclick="boostPlayer('${esc(id)}','factory3')">Factory Lvl 3</button>
        <button class="boost-btn" onclick="boostPlayer('${esc(id)}','allcosmetics')">All Cosmetics</button>
      </div>
    `;
    document.getElementById('detail-boosts').innerHTML = boostsHtml;

    // Check if player is admin
    let isPlayerAdmin = false;
    try {
      const settingsRes = await fetch(`${API}/settings`, { headers: AUTH_HEADER });
      const settingsData = await settingsRes.json();
      isPlayerAdmin = (settingsData.admins || []).some(a => a.uid === id);
    } catch {}

    const actionsHtml = `
      <h3 style="margin-bottom:8px;font-size:14px">Edit Player</h3>
      <div class="edit-field"><label>Company Name</label><input type="text" id="edit-company-name" value="${esc(g.companyName || '')}" onFocus="this.select()"></div>
      <div class="edit-field"><label>Cash</label><input type="number" id="edit-cash" value="${Math.round(g.cash || 0)}" onFocus="this.select()"></div>
      <div class="edit-field"><label>TireCoins</label><input type="number" id="edit-tc" value="${g.tireCoins || 0}" onFocus="this.select()"></div>
      <div class="edit-field"><label>Reputation</label><input type="number" id="edit-rep" value="${(g.reputation || 0).toFixed(1)}" step="0.1" onFocus="this.select()"></div>
      <div class="edit-field"><label>TC Storage Lvl</label><input type="number" id="edit-tc-storage" value="${g.tcStorageLevel || 0}" min="0" max="5" onFocus="this.select()"></div>
      <div class="edit-field"><label>Factory Lvl</label><input type="number" id="edit-factory-lvl" value="${g.factory?.level || 0}" min="0" max="3" onFocus="this.select()"></div>
      ${g._botConfig ? `
      <div class="edit-field" style="grid-column:1/-1">
        <label>Bot Intensity <span id="edit-intensity-label" style="color:#4ea8de">${g._botConfig.intensity} - ${intensityLabel(g._botConfig.intensity)}</span></label>
        <input type="range" id="edit-intensity" min="1" max="10" value="${g._botConfig.intensity}" oninput="document.getElementById('edit-intensity-label').textContent = this.value + ' - ' + intensityLabel(+this.value)" style="width:200px">
      </div>` : ''}
      <button class="btn btn-green btn-sm" onclick="editPlayer('${esc(id)}')">Save Changes</button>
      <hr style="border-color:#333;margin:12px 0">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ${isPlayerAdmin ? 'btn-red' : 'btn-blue'} btn-sm" onclick="toggleAdmin('${esc(id)}', ${!isPlayerAdmin})">${isPlayerAdmin ? 'Remove Admin' : 'Make Admin'}</button>
        <button class="btn ${g.isAI ? 'btn-outline' : 'btn-gray'} btn-sm" onclick="toggleAI('${esc(id)}', ${!g.isAI})">${g.isAI ? 'Remove AI Flag' : 'Mark as AI'}</button>
        <button class="btn ${g.isBanned ? 'btn-green' : 'btn-red'} btn-sm" onclick="banPlayer('${esc(id)}', ${!g.isBanned})">${g.isBanned ? 'Unban' : 'Ban'} Player</button>
        <button class="btn ${g.isPremium ? 'btn-outline' : 'btn-yellow'} btn-sm" onclick="setPremium('${esc(id)}', ${!g.isPremium})">${g.isPremium ? 'Revoke Premium' : 'Grant Premium'}</button>
        <button class="btn btn-red btn-sm" onclick="if(confirm('Reset all progress for this player?'))resetPlayer('${esc(id)}')">Reset Progress</button>
        <button class="btn btn-red btn-sm" onclick="if(confirm('PERMANENTLY DELETE this player? This cannot be undone.'))deletePlayer('${esc(id)}')">Delete Player</button>
      </div>
    `;
    document.getElementById('detail-actions').innerHTML = actionsHtml;
    document.getElementById('detail-raw').textContent = JSON.stringify(g, null, 2);

    document.getElementById('player-detail-modal').classList.remove('hidden');
  } catch (e) {
    console.error('Failed to load player detail:', e);
  }
}

function closeModal() {
  document.getElementById('player-detail-modal').classList.add('hidden');
  currentDetailId = null;
}
document.getElementById('player-detail-modal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

async function editPlayer(id) {
  const companyName = document.getElementById('edit-company-name').value.trim();
  const body = {
    companyName,
    cash: Number(document.getElementById('edit-cash').value),
    tireCoins: Number(document.getElementById('edit-tc').value),
    reputation: Number(document.getElementById('edit-rep').value),
    tcStorageLevel: Number(document.getElementById('edit-tc-storage').value),
  };

  const factoryLvl = Number(document.getElementById('edit-factory-lvl').value);
  if (factoryLvl > 0) {
    body.hasFactory = true;
    body.factoryLevel = factoryLvl;
  } else {
    body.hasFactory = false;
  }

  const intensityEl = document.getElementById('edit-intensity');
  if (intensityEl) {
    body.botIntensity = Number(intensityEl.value);
  }

  try {
    await fetch(`${API}/players/${id}/edit`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify(body),
    });
    loadPlayerDetail(id);
    loadPlayers();
  } catch (e) { console.error(e); }
}

async function boostPlayer(id, preset) {
  const presets = {
    cash1m: { cash: null, _addCash: 1000000 },
    cash10m: { cash: null, _addCash: 10000000 },
    cash50m: { cash: null, _addCash: 50000000 },
    tc500: { tireCoins: null, _addTC: 500 },
    tc2000: { tireCoins: null, _addTC: 2000 },
    rep50: { reputation: 50 },
    rep100: { reputation: 100 },
    factory: { hasFactory: true },
    factory3: { hasFactory: true, factoryLevel: 3 },
    allcosmetics: { cosmetics: ['gold_name', 'neon_sign', 'vip_dashboard', 'premium_van', 'celebration', 'elite_border'] },
  };

  const p = presets[preset];
  if (!p) return;

  // For additive presets, fetch current value first
  if (p._addCash || p._addTC) {
    try {
      const res = await fetch(`${API}/players/${id}`, { headers: AUTH_HEADER });
      const player = await res.json();
      const g = player.game_state || {};
      if (p._addCash) p.cash = Math.round((g.cash || 0) + p._addCash);
      if (p._addTC) p.tireCoins = Math.round((g.tireCoins || 0) + p._addTC);
    } catch (e) { console.error(e); return; }
    delete p._addCash;
    delete p._addTC;
  }

  try {
    await fetch(`${API}/players/${id}/edit`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify(p),
    });
    loadPlayerDetail(id);
    loadPlayers();
  } catch (e) { console.error(e); }
}

async function banPlayer(id, banned) {
  try {
    await fetch(`${API}/players/${id}/ban`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ banned }),
    });
    loadPlayerDetail(id);
    loadPlayers();
  } catch (e) { console.error(e); }
}

async function setPremium(id, isPremium) {
  try {
    await fetch(`${API}/players/${id}/set-premium`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ isPremium }),
    });
    loadPlayerDetail(id);
    loadPlayers();
  } catch (e) { console.error(e); }
}

async function toggleAI(id, isAI) {
  try {
    await fetch(`${API}/players/${id}/edit`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ isAI }),
    });
    loadPlayerDetail(id);
    loadPlayers();
  } catch (e) { console.error(e); }
}

async function toggleAdmin(id, makeAdmin) {
  const action = makeAdmin ? 'Grant admin access to this player?' : 'Remove admin access from this player?';
  if (!confirm(action)) return;
  try {
    const endpoint = makeAdmin ? `${API}/settings/add-admin` : `${API}/settings/remove-admin`;
    const res = await fetch(endpoint, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ uid: id }),
    });
    const data = await res.json();
    if (data.ok) {
      loadPlayerDetail(id);
    } else {
      alert(data.error || 'Failed');
    }
  } catch (e) { console.error(e); }
}

async function resetPlayer(id) {
  try {
    await fetch(`${API}/players/${id}/reset`, {
      method: 'POST', headers: AUTH_HEADER,
    });
    closeModal();
    loadPlayers();
  } catch (e) { console.error(e); }
}

async function deletePlayer(id) {
  try {
    await fetch(`${API}/players/${id}`, {
      method: 'DELETE', headers: AUTH_HEADER,
    });
    closeModal();
    loadPlayers();
  } catch (e) { console.error(e); }
}

// ═══════════════════════════════════════
// CHAT
// ═══════════════════════════════════════

document.getElementById('refresh-chat-btn')?.addEventListener('click', loadChat);
document.getElementById('mute-btn')?.addEventListener('click', mutePlayer);
document.getElementById('admin-chat-text')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendAdminChat();
});
document.getElementById('admin-dm-text')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendAdminDM();
});
document.getElementById('admin-dm-target')?.addEventListener('change', e => {
  const pid = e.target.value.trim();
  if (pid) loadDMHistory(pid);
});

async function loadChat() {
  try {
    if (!AUTH_HEADER['Authorization'] && !AUTH_HEADER['X-Player-Id']) {
      const log = document.getElementById('chat-log');
      if (log) log.innerHTML = '<div style="color:#888;padding:8px">Waiting for auth...</div>';
      return;
    }
    const res = await fetch(`${API}/chat/messages?limit=500`, { headers: AUTH_HEADER });
    if (!res.ok) {
      const log = document.getElementById('chat-log');
      if (log) log.innerHTML = `<div style="color:#ef5350;padding:8px">Chat load failed: ${res.status} ${res.statusText}</div>`;
      return;
    }
    const messages = await res.json();
    const log = document.getElementById('chat-log');
    log.innerHTML = '';
    if (!messages.length) {
      log.innerHTML = '<div style="color:#888;padding:8px">No messages yet.</div>';
      return;
    }

    for (const m of messages) {
      const div = document.createElement('div');
      const isAdmin = m.playerId === 'ADMIN';
      div.className = 'chat-msg' + (isAdmin ? ' chat-msg-admin' : '');
      if (isAdmin) div.style.cssText = 'background:#3a2e00;border-left:3px solid #ffd54f';
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const nameHtml = isAdmin
        ? `<span class="name" style="color:#ffd54f;font-weight:700">ADMIN</span>`
        : `<span class="name">${esc(m.playerName)}</span>`;
      const dmBtn = !isAdmin
        ? ` <span class="dm-btn" onclick="event.stopPropagation();openDMPanel('${esc(m.playerId)}')" title="DM this player" style="cursor:pointer;color:#4ea8de;font-size:11px;margin-left:4px">[DM]</span>`
        : '';
      div.innerHTML = `
        <span class="time">${time}</span>
        ${nameHtml}${dmBtn}
        <span class="text">${esc(m.text)}</span>
        <span class="del-btn" onclick="deleteMsg('${esc(m.id)}')" title="Delete message">&#x2715;</span>
      `;
      log.appendChild(div);
    }
    log.scrollTop = log.scrollHeight;
  } catch (e) {
    console.error(e);
    const log = document.getElementById('chat-log');
    if (log) log.innerHTML = `<div style="color:#ef5350;padding:8px">Error: ${e.message}</div>`;
  }
}

async function sendAdminChat() {
  const text = document.getElementById('admin-chat-text').value.trim();
  if (!text) return;
  const channel = document.getElementById('admin-chat-channel').value;
  const resultEl = document.getElementById('admin-chat-result');
  try {
    const res = await fetch(`${API}/chat/send`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ text, channel }),
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('admin-chat-text').value = '';
      resultEl.textContent = 'Sent!';
      resultEl.style.color = '#4caf50';
      loadChat();
    } else {
      resultEl.textContent = data.error || 'Failed';
      resultEl.style.color = '#ef5350';
    }
    setTimeout(() => { resultEl.textContent = ''; }, 3000);
  } catch (e) { console.error(e); }
}

function openDMPanel(playerId) {
  const panel = document.getElementById('dm-panel');
  panel.open = true;
  document.getElementById('admin-dm-target').value = playerId;
  loadDMHistory(playerId);
}

async function sendAdminDM() {
  const targetPlayerId = document.getElementById('admin-dm-target').value.trim();
  const text = document.getElementById('admin-dm-text').value.trim();
  if (!targetPlayerId || !text) return;
  const resultEl = document.getElementById('admin-dm-result');
  try {
    const res = await fetch(`${API}/chat/dm`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ targetPlayerId, text }),
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('admin-dm-text').value = '';
      resultEl.textContent = 'DM sent!';
      resultEl.style.color = '#4caf50';
      loadDMHistory(targetPlayerId);
    } else {
      resultEl.textContent = data.error || 'Failed';
      resultEl.style.color = '#ef5350';
    }
    setTimeout(() => { resultEl.textContent = ''; }, 3000);
  } catch (e) { console.error(e); }
}

async function loadDMHistory(playerId) {
  const container = document.getElementById('dm-history');
  if (!playerId) { container.innerHTML = ''; return; }
  try {
    const res = await fetch(`${API}/chat/dm/${encodeURIComponent(playerId)}`, { headers: AUTH_HEADER });
    const messages = await res.json();
    if (!messages.length) {
      container.innerHTML = '<em style="color:#555;font-size:12px">No DM history with this player</em>';
      return;
    }
    container.innerHTML = '';
    for (const m of messages) {
      const div = document.createElement('div');
      const isFromAdmin = m.fromId === 'ADMIN';
      div.style.cssText = `padding:4px 8px;margin:2px 0;border-radius:4px;font-size:12px;${isFromAdmin ? 'background:#1a2e1a;text-align:right' : 'background:#1a1a2e'}`;
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      div.innerHTML = `<span style="color:#666">${time}</span> <strong style="color:${isFromAdmin ? '#ffd54f' : '#4ea8de'}">${isFromAdmin ? 'ADMIN' : esc(m.fromName || m.fromId)}</strong>: ${esc(m.text)}`;
      container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
  } catch (e) { console.error(e); }
}

async function deleteMsg(id) {
  try {
    await fetch(`${API}/chat/messages/${id}`, { method: 'DELETE', headers: AUTH_HEADER });
    loadChat();
  } catch (e) { console.error(e); }
}

async function loadMutes() {
  try {
    const res = await fetch(`${API}/chat/mutes`, { headers: AUTH_HEADER });
    const data = await res.json();
    const list = document.getElementById('mutes-list');
    const entries = Object.entries(data.mutes || {});

    if (entries.length === 0) {
      list.innerHTML = '<em style="color:#555">No active mutes</em>';
      return;
    }

    list.innerHTML = '';
    for (const [pid, m] of entries) {
      const div = document.createElement('div');
      div.className = 'mute-list-item';
      const expires = m.expiresAt ? new Date(m.expiresAt).toLocaleString() : 'Permanent';
      div.innerHTML = `
        <span><strong>${esc(pid.slice(0, 16))}...</strong></span>
        <span style="color:#888;font-size:12px">Until: ${expires}</span>
        <span style="color:#888;font-size:12px">${m.reason ? `(${esc(m.reason)})` : ''}</span>
        <button class="btn btn-outline btn-sm" onclick="unmutePlayer('${esc(pid)}')">Unmute</button>
      `;
      list.appendChild(div);
    }
  } catch (e) { console.error(e); }
}

async function mutePlayer() {
  const playerId = document.getElementById('mute-player-id').value.trim();
  if (!playerId) return;
  const duration = document.getElementById('mute-duration').value || null;
  const reason = document.getElementById('mute-reason').value.trim();

  try {
    await fetch(`${API}/chat/mute`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ playerId, duration: duration ? Number(duration) : null, reason }),
    });
    document.getElementById('mute-player-id').value = '';
    document.getElementById('mute-reason').value = '';
    loadMutes();
  } catch (e) { console.error(e); }
}

async function unmutePlayer(id) {
  try {
    await fetch(`${API}/chat/unmute`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ playerId: id }),
    });
    loadMutes();
  } catch (e) { console.error(e); }
}

// ═══════════════════════════════════════
// ECONOMY
// ═══════════════════════════════════════

async function loadEconomy() {
  try {
    const res = await fetch(`${API}/economy`, { headers: AUTH_HEADER });
    const data = await res.json();

    document.getElementById('economy-stats').innerHTML = `
      <div class="stat-card"><div class="label">Total Cash</div><div class="value green">$${fmt(data.totalCash)}</div></div>
      <div class="stat-card"><div class="label">Total TireCoins</div><div class="value gold">${fmt(data.totalTC)}</div></div>
      <div class="stat-card"><div class="label">Avg Reputation</div><div class="value blue">${data.avgReputation}</div></div>
      <div class="stat-card"><div class="label">Total Players</div><div class="value">${data.playerCount}</div></div>
      <div class="stat-card"><div class="label">Active Players</div><div class="value green">${data.activePlayerCount}</div></div>
      <div class="stat-card"><div class="label">TC Value</div><div class="value gold">$${fmt(data.tcValue)}</div></div>
      <div class="stat-card"><div class="label">TC / Player</div><div class="value gold">${data.tcPerCapita || 0}</div></div>
      <div class="stat-card"><div class="label">Avg Interest Rate</div><div class="value blue">${((data.avgBankRate || 0.042) * 100).toFixed(2)}%</div></div>
      <div class="stat-card"><div class="label">Total Bank Deposits</div><div class="value green">$${fmt(data.totalBankDeposits)}</div></div>
    `;

    // Commodity controls
    const cc = document.getElementById('commodity-controls');
    const comms = data.commodities || {};
    cc.innerHTML = '';
    for (const [sym, info] of Object.entries(comms)) {
      cc.innerHTML += `
        <div class="index-control">
          <label>${info.name || sym} ($${info.price?.toFixed(2) || '?'})</label>
          <input type="number" id="idx-${sym}" value="${info.price?.toFixed(2) || 100}" min="10" step="5" style="width:80px">
          <button class="btn btn-blue btn-sm" onclick="setIndex('${sym}')">Set</button>
        </div>
      `;
    }

    // TC value input
    document.getElementById('tc-value-input').value = data.tcValue || 50000;

    const tbody = document.getElementById('top10-tbody');
    tbody.innerHTML = '';
    data.top10.forEach((p, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${esc(p.companyName)}</td>
        <td>$${fmt(p.wealth)}</td>
        <td>$${fmt(p.cash)}</td>
        <td>${p.reputation}</td>
        <td>${p.locations}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) { console.error(e); }
}

async function setIndex(sym) {
  const val = Number(document.getElementById(`idx-${sym}`).value);
  if (!val || val < 10) return;
  try {
    await fetch(`${API}/economy/indices`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ [sym]: val }),
    });
    loadEconomy();
  } catch (e) { console.error(e); }
}

async function setTcValue() {
  const val = Number(document.getElementById('tc-value-input').value);
  if (!val || val < 1000) return;
  try {
    await fetch(`${API}/economy/tc-value`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ value: val }),
    });
    loadEconomy();
  } catch (e) { console.error(e); }
}

// ═══════════════════════════════════════
// GLOBAL EVENTS
// ═══════════════════════════════════════

async function loadEvents() {
  try {
    const res = await fetch(`${API}/events`, { headers: AUTH_HEADER });
    if (!res.ok) {
      console.error('Events endpoint failed:', res.status, await res.text());
      return;
    }
    const data = await res.json();

    // Active events
    const ae = document.getElementById('active-events');
    if (!data.active || data.active.length === 0) {
      ae.innerHTML = '<em style="color:#555">No active events</em>';
    } else {
      ae.innerHTML = '';
      for (const e of data.active) {
        ae.innerHTML += `
          <div class="event-card">
            <div class="event-icon">${e.icon || '?'}</div>
            <div class="event-info">
              <div class="event-name">${esc(e.name || e.id)}</div>
              <div class="event-meta">Days ${e.startDay} - ${e.endDay} (${e.daysLeft} days left)</div>
            </div>
            <button class="btn btn-red btn-sm" onclick="cancelEvent('${esc(e.id)}')">Cancel</button>
          </div>
        `;
      }
    }

    // Populate event dropdown
    const sel = document.getElementById('event-select');
    sel.innerHTML = '';
    if (data.available && data.available.length > 0) {
      for (const ev of data.available) {
        const active = data.active.some(a => a.id === ev.id);
        sel.innerHTML += `<option value="${ev.id}" ${active ? 'disabled' : ''}>${ev.icon} ${ev.name} (${ev.durationMin}-${ev.durationMax}d)${active ? ' [ACTIVE]' : ''}</option>`;
      }
    } else {
      sel.innerHTML = '<option disabled>No events available</option>';
    }
  } catch (e) { console.error('Failed to load events:', e); }
}

async function triggerEvent() {
  const eventId = document.getElementById('event-select').value;
  const dur = document.getElementById('event-duration').value;
  if (!eventId) return;

  try {
    const body = { eventId };
    if (dur) body.duration = Number(dur);
    await fetch(`${API}/events/trigger`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify(body),
    });
    document.getElementById('event-duration').value = '';
    loadEvents();
  } catch (e) { console.error(e); }
}

async function cancelEvent(eventId) {
  try {
    await fetch(`${API}/events/cancel`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ eventId }),
    });
    loadEvents();
  } catch (e) { console.error(e); }
}

// ═══════════════════════════════════════
// SERVER STATS & TICK CONTROL
// ═══════════════════════════════════════

async function loadServerStats() {
  try {
    const res = await fetch(`${API}/server-stats`, { headers: AUTH_HEADER });
    const data = await res.json();

    const uptimeStr = formatUptime(data.uptime);
    const tickStr = (data.tickMs / 1000).toFixed(1) + 's';

    document.getElementById('server-stats').innerHTML = `
      <div class="stat-card"><div class="label">Uptime</div><div class="value">${uptimeStr}</div></div>
      <div class="stat-card"><div class="label">Game Day</div><div class="value blue">${data.currentDay}</div></div>
      <div class="stat-card"><div class="label">Tick Speed</div><div class="value">${tickStr}</div></div>
      <div class="stat-card"><div class="label">Tick Status</div><div class="value ${data.tickRunning ? 'green' : 'red'}">${data.tickRunning ? 'RUNNING' : 'PAUSED'}</div></div>
      <div class="stat-card"><div class="label">WS Connections</div><div class="value green">${data.wsConnections}</div></div>
      <div class="stat-card"><div class="label">Storage</div><div class="value">${data.storageType}</div></div>
      <div class="stat-card"><div class="label">Environment</div><div class="value">${data.nodeEnv}</div></div>
      <div class="stat-card"><div class="label">Memory (Heap)</div><div class="value">${data.memoryMB} MB</div></div>
    `;

    document.getElementById('tick-speed-input').value = data.tickMs;
  } catch (e) { console.error(e); }
}

async function changeTickSpeed() {
  const ms = Number(document.getElementById('tick-speed-input').value);
  if (!ms || ms < 1000 || ms > 120000) { alert('Speed must be 1000-120000ms'); return; }
  try {
    await fetch(`${API}/tick-speed`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ tickMs: ms }),
    });
    loadServerStats();
  } catch (e) { console.error(e); }
}

async function pauseTick() {
  try {
    await fetch(`${API}/tick/pause`, { method: 'POST', headers: AUTH_HEADER });
    loadServerStats();
  } catch (e) { console.error(e); }
}

async function resumeTick() {
  try {
    await fetch(`${API}/tick/resume`, { method: 'POST', headers: AUTH_HEADER });
    loadServerStats();
  } catch (e) { console.error(e); }
}

async function sendBroadcast() {
  const message = document.getElementById('broadcast-msg').value.trim();
  if (!message) return;
  const severity = document.getElementById('broadcast-severity').value;

  try {
    const res = await fetch(`${API}/broadcast`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ message, severity }),
    });
    const data = await res.json();
    document.getElementById('broadcast-result').textContent = `Sent to ${data.sentTo} client(s)`;
    document.getElementById('broadcast-msg').value = '';
    setTimeout(() => { document.getElementById('broadcast-result').textContent = ''; }, 3000);
  } catch (e) { console.error(e); }
}

// ═══════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════

async function loadAuditLog() {
  try {
    const res = await fetch(`${API}/audit-log`, { headers: AUTH_HEADER });
    const data = await res.json();
    const tbody = document.getElementById('audit-tbody');
    tbody.innerHTML = '';

    for (const entry of data.log) {
      const tr = document.createElement('tr');
      const time = new Date(entry.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const details = Object.keys(entry.details || {}).length > 0 ? JSON.stringify(entry.details) : '';
      tr.innerHTML = `
        <td style="white-space:nowrap">${time}</td>
        <td>${esc((entry.adminId || '').slice(0, 12))}</td>
        <td><span class="badge badge-${actionColor(entry.action)}">${esc(entry.action)}</span></td>
        <td>${entry.targetId ? esc(entry.targetId.slice(0, 16)) + '...' : '-'}</td>
        <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#888">${esc(details)}</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) { console.error(e); }
}

function actionColor(action) {
  if (['ban', 'resetPlayer'].includes(action)) return 'red';
  if (['setPremium', 'triggerEvent', 'broadcast'].includes(action)) return 'gold';
  if (['editPlayer', 'setIndices', 'setTcValue', 'setTickSpeed'].includes(action)) return 'green';
  return 'gray';
}

// ═══════════════════════════════════════
// CREATE STEALTH PLAYER
// ═══════════════════════════════════════

let citiesCache = null;

async function loadCities() {
  if (citiesCache) return citiesCache;
  try {
    const res = await fetch(`${API}/cities`, { headers: AUTH_HEADER });
    citiesCache = await res.json();
    return citiesCache;
  } catch (e) { console.error(e); return []; }
}

async function initCreatePlayerForm() {
  const cities = await loadCities();
  const sel = document.getElementById('create-city');
  if (!sel) return;
  sel.innerHTML = '<option value="">Random City</option>';
  for (const c of cities) {
    sel.innerHTML += `<option value="${c.id}">${esc(c.name)}, ${esc(c.state)}</option>`;
  }
}

async function createStealthPlayer() {
  const name = document.getElementById('create-name').value.trim();
  const companyName = document.getElementById('create-company').value.trim();
  const cityId = document.getElementById('create-city').value || null;
  const intensity = Number(document.getElementById('create-intensity').value) || 5;

  if (!name || !companyName) { alert('Name and company name are required'); return; }

  try {
    const res = await fetch(`${API}/create-stealth-player`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ name, companyName, cityId, intensity }),
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('create-result').textContent = `Created "${companyName}" (intensity ${intensity})`;
      document.getElementById('create-result').style.color = '#4caf50';
      document.getElementById('create-name').value = '';
      document.getElementById('create-company').value = '';
      document.getElementById('create-intensity').value = '5';
      document.getElementById('create-intensity-label').textContent = '5 - Competitive';
      loadPlayers();
    } else {
      document.getElementById('create-result').textContent = data.error || 'Failed';
      document.getElementById('create-result').style.color = '#ef5350';
    }
    setTimeout(() => { document.getElementById('create-result').textContent = ''; }, 4000);
  } catch (e) { console.error(e); }
}

function intensityLabel(val) {
  const labels = { 1: 'Casual', 2: 'Casual', 3: 'Casual', 4: 'Normal', 5: 'Competitive', 6: 'Competitive', 7: 'Aggressive', 8: 'Aggressive', 9: 'Disruptor', 10: 'Disruptor' };
  return labels[val] || 'Competitive';
}
window.intensityLabel = intensityLabel; // expose for inline oninput

function updateIntensityLabel(val) {
  document.getElementById('create-intensity-label').textContent = `${val} - ${intensityLabel(val)}`;
}

// ═══════════════════════════════════════
// SETTINGS — ADMIN WHITELIST
// ═══════════════════════════════════════

async function loadSettings() {
  try {
    const res = await fetch(`${API}/settings`, { headers: AUTH_HEADER });
    const data = await res.json();
    const list = document.getElementById('admin-list');
    list.innerHTML = '';

    for (const a of data.admins) {
      const div = document.createElement('div');
      div.className = 'admin-list-item';
      const isEnv = a.source === 'env';
      div.innerHTML = `
        <div>
          <strong>${esc(a.uid.slice(0, 20))}${a.uid.length > 20 ? '...' : ''}</strong>
          ${a.email ? `<br><span style="color:#888;font-size:12px">${esc(a.email)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge badge-${isEnv ? 'gold' : 'blue'}">${isEnv ? 'ENV' : 'DB'}</span>
          ${isEnv ? '' : `<button class="btn btn-red btn-sm" onclick="removeAdmin('${esc(a.uid)}')">Remove</button>`}
        </div>
      `;
      list.appendChild(div);
    }
  } catch (e) { console.error(e); }
  checkApkStatus();
}

async function addAdmin() {
  const uid = document.getElementById('add-admin-uid').value.trim();
  const email = document.getElementById('add-admin-email').value.trim();
  if (!uid) { alert('UID is required'); return; }

  try {
    const res = await fetch(`${API}/settings/add-admin`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ uid, email }),
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('add-admin-uid').value = '';
      document.getElementById('add-admin-email').value = '';
      loadSettings();
    } else {
      alert(data.error || 'Failed');
    }
  } catch (e) { console.error(e); }
}

async function removeAdmin(uid) {
  if (!confirm('Remove this admin?')) return;
  try {
    const res = await fetch(`${API}/settings/remove-admin`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ uid }),
    });
    const data = await res.json();
    if (data.ok) loadSettings();
    else alert(data.error || 'Failed');
  } catch (e) { console.error(e); }
}

// ═══════════════════════════════════════
// APK DISTRIBUTION
// ═══════════════════════════════════════

async function checkApkStatus() {
  try {
    const res = await fetch('/download/apk', { method: 'HEAD' });
    const statusEl = document.getElementById('apk-status');
    const linkEl = document.getElementById('apk-download-link');
    const urlEl = document.getElementById('apk-share-url');
    if (res.ok) {
      const size = res.headers.get('Content-Length');
      const sizeMB = size ? (Number(size) / 1024 / 1024).toFixed(1) + ' MB' : 'unknown size';
      statusEl.textContent = `Latest APK available (${sizeMB})`;
      statusEl.style.color = '#4caf50';
      linkEl.style.display = '';
      urlEl.textContent = window.location.origin + '/download/apk';
    } else {
      statusEl.textContent = 'No APK uploaded yet';
      statusEl.style.color = '#888';
      linkEl.style.display = 'none';
      urlEl.textContent = 'Upload an APK first';
    }
  } catch { }
}

async function uploadApk() {
  const input = document.getElementById('apk-file-input');
  const progress = document.getElementById('apk-upload-progress');
  if (!input.files[0]) { alert('Select an APK file first'); return; }
  const file = input.files[0];
  if (!file.name.endsWith('.apk')) { alert('File must be an APK'); return; }
  progress.textContent = `Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`;
  try {
    // Remove Content-Type: application/json for binary upload
    const uploadHeaders = { ...AUTH_HEADER, 'X-Filename': file.name };
    delete uploadHeaders['Content-Type'];
    const res = await fetch(`${API}/upload-apk`, {
      method: 'POST',
      headers: uploadHeaders,
      body: file,
    });
    const data = await res.json();
    if (data.ok) {
      progress.textContent = `Uploaded successfully! (${(data.size / 1024 / 1024).toFixed(1)} MB)`;
      progress.style.color = '#4caf50';
      checkApkStatus();
    } else {
      progress.textContent = data.error || 'Upload failed';
      progress.style.color = '#f44336';
    }
  } catch (e) {
    progress.textContent = 'Upload failed: ' + e.message;
    progress.style.color = '#f44336';
  }
}

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function fmt(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString();
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
