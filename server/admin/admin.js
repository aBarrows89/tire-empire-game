/* Tire Empire Admin Dashboard — vanilla JS, no dependencies */

const API = '/api/admin';
let AUTH_HEADER = {};
let currentPlayerPage = 1;
let serverStatsInterval = null;

// ═══════════════════════════════════════
// AUTH
// ═══════════════════════════════════════

document.getElementById('auth-btn').addEventListener('click', authenticate);
document.getElementById('admin-uid-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') authenticate();
});

async function authenticate() {
  const uid = document.getElementById('admin-uid-input').value.trim();
  if (!uid) return;

  AUTH_HEADER = { 'X-Player-Id': uid, 'Content-Type': 'application/json' };

  try {
    const res = await fetch(`${API}/server-stats`, { headers: AUTH_HEADER });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      document.getElementById('auth-status').textContent = err.error || 'Auth failed';
      document.getElementById('auth-status').style.color = '#ef5350';
      return;
    }
    document.getElementById('auth-status').textContent = `Authenticated as ${uid}`;
    document.getElementById('auth-status').style.color = '#4caf50';
    document.getElementById('auth-form').classList.add('hidden');
    document.getElementById('admin-tabs').style.display = 'flex';
    document.getElementById('admin-content').style.display = 'block';

    // Load initial data
    loadPlayers();
  } catch (e) {
    document.getElementById('auth-status').textContent = 'Connection failed';
    document.getElementById('auth-status').style.color = '#ef5350';
  }
}

// ═══════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════

document.getElementById('admin-tabs').addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  const id = tab.dataset.tab;

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById(`tab-${id}`).classList.add('active');

  // Load data for the tab
  if (id === 'players') loadPlayers();
  if (id === 'chat') { loadChat(); loadMutes(); }
  if (id === 'economy') loadEconomy();
  if (id === 'server') loadServerStats();

  // Auto-refresh server stats
  clearInterval(serverStatsInterval);
  if (id === 'server') {
    serverStatsInterval = setInterval(loadServerStats, 10000);
  }
});

// ═══════════════════════════════════════
// PLAYERS
// ═══════════════════════════════════════

document.getElementById('player-search-btn').addEventListener('click', () => { currentPlayerPage = 1; loadPlayers(); });
document.getElementById('player-search').addEventListener('keydown', e => {
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
      if (p.isAI) statusBadges.push('<span class="badge badge-gray">AI</span>');

      tr.innerHTML = `
        <td><strong>${esc(p.companyName)}</strong><br><span style="color:#555;font-size:11px">${esc(p.id.slice(0, 12))}...</span></td>
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

    // Pagination
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
        <div class="detail-row"><span class="label">Premium</span><span>${g.isPremium ? '<span class="badge badge-gold">YES</span>' : 'No'}</span></div>
        <div class="detail-row"><span class="label">Banned</span><span>${g.isBanned ? '<span class="badge badge-red">YES</span>' : 'No'}</span></div>
      </div>
    `;
    document.getElementById('detail-stats').innerHTML = statsHtml;

    const actionsHtml = `
      <h3 style="margin-bottom:8px;font-size:14px">Edit Player</h3>
      <div class="edit-field"><label>Cash</label><input type="number" id="edit-cash" value="${Math.round(g.cash || 0)}" onFocus="this.select()"></div>
      <div class="edit-field"><label>TireCoins</label><input type="number" id="edit-tc" value="${g.tireCoins || 0}" onFocus="this.select()"></div>
      <div class="edit-field"><label>Reputation</label><input type="number" id="edit-rep" value="${(g.reputation || 0).toFixed(1)}" step="0.1" onFocus="this.select()"></div>
      <button class="btn btn-green btn-sm" onclick="editPlayer('${esc(id)}')">Save Changes</button>
      <hr style="border-color:#333;margin:12px 0">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ${g.isBanned ? 'btn-green' : 'btn-red'} btn-sm" onclick="banPlayer('${esc(id)}', ${!g.isBanned})">${g.isBanned ? 'Unban' : 'Ban'} Player</button>
        <button class="btn ${g.isPremium ? 'btn-outline' : 'btn-yellow'} btn-sm" onclick="setPremium('${esc(id)}', ${!g.isPremium})">${g.isPremium ? 'Revoke Premium' : 'Grant Premium'}</button>
        <button class="btn btn-red btn-sm" onclick="if(confirm('Reset all progress for this player?'))resetPlayer('${esc(id)}')">Reset Progress</button>
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
}
document.getElementById('player-detail-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

async function editPlayer(id) {
  const cash = Number(document.getElementById('edit-cash').value);
  const tireCoins = Number(document.getElementById('edit-tc').value);
  const reputation = Number(document.getElementById('edit-rep').value);
  try {
    await fetch(`${API}/players/${id}/edit`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ cash, tireCoins, reputation }),
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

async function resetPlayer(id) {
  try {
    await fetch(`${API}/players/${id}/reset`, {
      method: 'POST', headers: AUTH_HEADER,
    });
    closeModal();
    loadPlayers();
  } catch (e) { console.error(e); }
}

// ═══════════════════════════════════════
// CHAT
// ═══════════════════════════════════════

document.getElementById('refresh-chat-btn').addEventListener('click', loadChat);
document.getElementById('mute-btn').addEventListener('click', mutePlayer);

async function loadChat() {
  try {
    const res = await fetch(`${API}/chat/messages?limit=500`, { headers: AUTH_HEADER });
    const messages = await res.json();
    const log = document.getElementById('chat-log');
    log.innerHTML = '';

    for (const m of messages) {
      const div = document.createElement('div');
      div.className = 'chat-msg';
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      div.innerHTML = `
        <span class="time">${time}</span>
        <span class="name">${esc(m.playerName)}</span>
        <span class="text">${esc(m.text)}</span>
        <span class="del-btn" onclick="deleteMsg('${esc(m.id)}')" title="Delete message">&#x2715;</span>
      `;
      log.appendChild(div);
    }
    log.scrollTop = log.scrollHeight;
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
    `;

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

// ═══════════════════════════════════════
// SERVER STATS
// ═══════════════════════════════════════

async function loadServerStats() {
  try {
    const res = await fetch(`${API}/server-stats`, { headers: AUTH_HEADER });
    const data = await res.json();

    const uptimeStr = formatUptime(data.uptime);
    const tickStr = (data.tickMs / 1000).toFixed(0) + 's';

    document.getElementById('server-stats').innerHTML = `
      <div class="stat-card"><div class="label">Uptime</div><div class="value">${uptimeStr}</div></div>
      <div class="stat-card"><div class="label">Game Day</div><div class="value blue">${data.currentDay}</div></div>
      <div class="stat-card"><div class="label">Tick Interval</div><div class="value">${tickStr}</div></div>
      <div class="stat-card"><div class="label">WS Connections</div><div class="value green">${data.wsConnections}</div></div>
      <div class="stat-card"><div class="label">Storage</div><div class="value">${data.storageType}</div></div>
      <div class="stat-card"><div class="label">Environment</div><div class="value">${data.nodeEnv}</div></div>
      <div class="stat-card"><div class="label">Memory (Heap)</div><div class="value">${data.memoryMB} MB</div></div>
    `;
  } catch (e) { console.error(e); }
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
