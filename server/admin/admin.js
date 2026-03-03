/* Tire Empire Admin Dashboard — vanilla JS, no dependencies */

const API = '/api/admin';
let AUTH_HEADER = {};
let currentPlayerPage = 1;
let serverStatsInterval = null;
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
    }
  } catch (e) {
    // No Firebase config — dev mode, show UID input
  }
})();

document.getElementById('google-signin-btn').addEventListener('click', googleSignIn);
document.getElementById('auth-btn').addEventListener('click', devAuthenticate);
document.getElementById('admin-uid-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') devAuthenticate();
});

async function googleSignIn() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await firebase.auth().signInWithPopup(provider);
    const token = await result.user.getIdToken();
    AUTH_HEADER = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    const res = await fetch(`${API}/server-stats`, { headers: AUTH_HEADER });
    if (res.status === 403) {
      document.getElementById('auth-status').textContent = 'Not an admin — your Google account is not whitelisted';
      document.getElementById('auth-status').style.color = '#ef5350';
      await firebase.auth().signOut();
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      document.getElementById('auth-status').textContent = err.error || 'Auth failed';
      document.getElementById('auth-status').style.color = '#ef5350';
      return;
    }

    onAuthSuccess(result.user.email || result.user.uid);

    // Auto-refresh token before expiry
    firebase.auth().onIdTokenChanged(async (user) => {
      if (user) {
        const newToken = await user.getIdToken();
        AUTH_HEADER = { 'Authorization': `Bearer ${newToken}`, 'Content-Type': 'application/json' };
      }
    });
  } catch (e) {
    document.getElementById('auth-status').textContent = 'Sign-in failed: ' + e.message;
    document.getElementById('auth-status').style.color = '#ef5350';
  }
}

async function devAuthenticate() {
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
    onAuthSuccess(uid);
  } catch (e) {
    document.getElementById('auth-status').textContent = 'Connection failed';
    document.getElementById('auth-status').style.color = '#ef5350';
  }
}

function onAuthSuccess(displayName) {
  document.getElementById('auth-status').textContent = `Authenticated as ${displayName}`;
  document.getElementById('auth-status').style.color = '#4caf50';
  document.getElementById('auth-form').classList.add('hidden');
  document.getElementById('admin-tabs').style.display = 'flex';
  document.getElementById('admin-content').style.display = 'block';
  loadPlayers();
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

  if (id === 'players') loadPlayers();
  if (id === 'chat') { loadChat(); loadMutes(); }
  if (id === 'economy') loadEconomy();
  if (id === 'events') loadEvents();
  if (id === 'server') loadServerStats();
  if (id === 'audit') loadAuditLog();

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

    const actionsHtml = `
      <h3 style="margin-bottom:8px;font-size:14px">Edit Player</h3>
      <div class="edit-field"><label>Company Name</label><input type="text" id="edit-company-name" value="${esc(g.companyName || '')}" onFocus="this.select()"></div>
      <div class="edit-field"><label>Cash</label><input type="number" id="edit-cash" value="${Math.round(g.cash || 0)}" onFocus="this.select()"></div>
      <div class="edit-field"><label>TireCoins</label><input type="number" id="edit-tc" value="${g.tireCoins || 0}" onFocus="this.select()"></div>
      <div class="edit-field"><label>Reputation</label><input type="number" id="edit-rep" value="${(g.reputation || 0).toFixed(1)}" step="0.1" onFocus="this.select()"></div>
      <div class="edit-field"><label>TC Storage Lvl</label><input type="number" id="edit-tc-storage" value="${g.tcStorageLevel || 0}" min="0" max="5" onFocus="this.select()"></div>
      <div class="edit-field"><label>Factory Lvl</label><input type="number" id="edit-factory-lvl" value="${g.factory?.level || 0}" min="0" max="3" onFocus="this.select()"></div>
      <button class="btn btn-green btn-sm" onclick="editPlayer('${esc(id)}')">Save Changes</button>
      <hr style="border-color:#333;margin:12px 0">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
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
document.getElementById('player-detail-modal').addEventListener('click', e => {
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
