/* Operations + Economy Tools — admin frontend */

function loadOperations() {
  // Default sub-tab loads handled by sub-tab click delegation
}

// ═══════════════════════════════════════
// DB HEALTH MONITOR
// ═══════════════════════════════════════

async function loadDbHealth() {
  const el = document.getElementById('health-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/operations/health`, { headers: AUTH_HEADER });
    const data = await res.json();
    if (!data.ok) { el.innerHTML = `<em style="color:#ef5350">${esc(data.error)}</em>`; return; }

    const { pool, dbSizeMB, tables, tick, memoryMB, uptime } = data;
    const uptimeStr = uptime > 3600 ? `${Math.round(uptime/3600)}h ${Math.round((uptime%3600)/60)}m` : `${Math.round(uptime/60)}m`;

    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">DB Size</div><div class="value blue">${dbSizeMB} MB</div></div>
        <div class="stat-card"><div class="label">Connections</div><div class="value">${pool.totalCount - pool.idleCount} active / ${pool.totalCount} total</div></div>
        <div class="stat-card"><div class="label">Waiting Queries</div><div class="value ${pool.waitingCount > 0 ? 'red' : 'green'}">${pool.waitingCount}</div></div>
        <div class="stat-card"><div class="label">Heap Memory</div><div class="value">${memoryMB} MB</div></div>
        <div class="stat-card"><div class="label">Uptime</div><div class="value green">${uptimeStr}</div></div>
        <div class="stat-card"><div class="label">Last Tick</div><div class="value">${tick.lastMs || 0}ms</div></div>
        <div class="stat-card"><div class="label">Avg Tick</div><div class="value">${tick.avgMs || 0}ms</div></div>
        <div class="stat-card"><div class="label">P95 Tick</div><div class="value ${(tick.p95Ms||0) > 500 ? 'red' : ''}">${tick.p95Ms || 0}ms</div></div>
      </div>
      <h3 style="margin:16px 0 8px">Table Sizes</h3>
      <table>
        <thead><tr><th>Table</th><th>Rows</th><th>Size</th></tr></thead>
        <tbody>${tables.map(t => `<tr><td>${esc(t.name)}</td><td>${t.rows.toLocaleString()}</td><td>${t.sizeMB} MB</td></tr>`).join('')}</tbody>
      </table>
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

// ═══════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════

async function loadAnnouncements() {
  const el = document.getElementById('announce-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/operations/announcements`, { headers: AUTH_HEADER });
    const data = await res.json();

    el.innerHTML = `
      <div style="padding:12px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:16px">
        <h4 style="margin-bottom:8px;font-size:14px">New Announcement</h4>
        <textarea id="ann-message" rows="2" placeholder="Announcement message..." style="width:100%;margin-bottom:8px"></textarea>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="ann-style">
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
            <option value="vinnie">Vinnie</option>
          </select>
          <button class="btn btn-green btn-sm" onclick="createAnnouncement()">Send</button>
        </div>
      </div>
      <h4 style="margin-bottom:8px">History</h4>
      ${(data.announcements || []).map(a => `
        <div class="thread-card">
          <div class="thread-meta">
            <span class="badge badge-${a.active ? 'green' : 'gray'}">${a.active ? 'Active' : 'Inactive'}</span>
            <span class="badge badge-blue">${esc(a.style)}</span>
            ${a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}
          </div>
          <div style="margin:4px 0">${esc(a.message)}</div>
          <div class="thread-actions">
            <button class="btn btn-outline btn-sm" onclick="toggleAnnouncement('${esc(a.id)}')">${a.active ? 'Deactivate' : 'Activate'}</button>
            <button class="btn btn-red btn-sm" onclick="deleteAnnouncement('${esc(a.id)}')">Delete</button>
          </div>
        </div>
      `).join('') || '<em style="color:#555">No announcements</em>'}
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

async function createAnnouncement() {
  const message = document.getElementById('ann-message').value.trim();
  const style = document.getElementById('ann-style').value;
  if (!message) return;
  await fetch(`${API}/operations/announcements`, {
    method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ message, style }),
  });
  document.getElementById('ann-message').value = '';
  loadAnnouncements();
}

async function toggleAnnouncement(id) {
  await fetch(`${API}/operations/announcements/${id}/toggle`, { method: 'POST', headers: AUTH_HEADER });
  loadAnnouncements();
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  await fetch(`${API}/operations/announcements/${id}`, { method: 'DELETE', headers: AUTH_HEADER });
  loadAnnouncements();
}

// ═══════════════════════════════════════
// A/B TESTS
// ═══════════════════════════════════════

async function loadAbTests() {
  const el = document.getElementById('abtest-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/operations/ab-tests`, { headers: AUTH_HEADER });
    const data = await res.json();

    el.innerHTML = `
      <div style="padding:12px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:16px">
        <h4 style="margin-bottom:8px;font-size:14px">New Config Override</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:500px">
          <div class="edit-field"><label>Name</label><input type="text" id="ab-name" placeholder="e.g. Sales Cap Test"></div>
          <div class="edit-field"><label>Constant Key</label><input type="text" id="ab-key" placeholder="e.g. salesCap"></div>
          <div class="edit-field"><label>Control Value</label><input type="text" id="ab-control" placeholder="Current value"></div>
          <div class="edit-field"><label>Variant Value</label><input type="text" id="ab-variant" placeholder="Test value"></div>
        </div>
        <button class="btn btn-green btn-sm" style="margin-top:8px" onclick="createAbTest()">Create</button>
      </div>
      ${(data.tests || []).map(t => `
        <div class="thread-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>${esc(t.name || 'Unnamed')}</strong>
              <span style="color:#888;font-size:12px;margin-left:8px">${esc(t.constant_key || '')}</span>
            </div>
            <span class="badge badge-${t.active ? 'green' : 'gray'}">${t.active ? 'Active' : 'Inactive'}</span>
          </div>
          <div style="font-size:12px;color:#aaa;margin-top:4px">
            Control: ${esc(t.control_value || '-')} | Variant: ${esc(t.variant_value || '-')}
          </div>
          <div class="thread-actions">
            <button class="btn btn-outline btn-sm" onclick="toggleAbTest('${esc(t.id)}')">${t.active ? 'Deactivate' : 'Activate'}</button>
            <button class="btn btn-red btn-sm" onclick="deleteAbTest('${esc(t.id)}')">Delete</button>
          </div>
        </div>
      `).join('') || '<em style="color:#555">No tests</em>'}
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

async function createAbTest() {
  const name = document.getElementById('ab-name').value.trim();
  const constantKey = document.getElementById('ab-key').value.trim();
  const controlValue = document.getElementById('ab-control').value.trim();
  const variantValue = document.getElementById('ab-variant').value.trim();
  if (!name || !constantKey) return alert('Name and Constant Key required');
  await fetch(`${API}/operations/ab-tests`, {
    method: 'POST', headers: AUTH_HEADER,
    body: JSON.stringify({ name, constantKey, controlValue, variantValue }),
  });
  loadAbTests();
}

async function toggleAbTest(id) {
  await fetch(`${API}/operations/ab-tests/${id}/toggle`, { method: 'POST', headers: AUTH_HEADER });
  loadAbTests();
}

async function deleteAbTest(id) {
  if (!confirm('Delete this test?')) return;
  await fetch(`${API}/operations/ab-tests/${id}`, { method: 'DELETE', headers: AUTH_HEADER });
  loadAbTests();
}

// ═══════════════════════════════════════
// REVENUE DASHBOARD
// ═══════════════════════════════════════

async function loadRevenue() {
  const el = document.getElementById('revenue-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/operations/revenue`, { headers: AUTH_HEADER });
    const data = await res.json();

    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Total Players</div><div class="value">${data.totalPlayers}</div></div>
        <div class="stat-card"><div class="label">Premium</div><div class="value gold">${data.premiumCount} (${data.premiumRate}%)</div></div>
        <div class="stat-card"><div class="label">Total TC in Circulation</div><div class="value blue">${data.totalTC.toLocaleString()}</div></div>
      </div>
      ${data.revenueByType.length > 0 ? `
        <h4 style="margin:16px 0 8px">Revenue Events (30 days)</h4>
        <table>
          <thead><tr><th>Type</th><th>Count</th><th>Revenue</th></tr></thead>
          <tbody>${data.revenueByType.map(r => `<tr><td>${esc(r.event_type)}</td><td>${r.count}</td><td>$${(r.total_cents/100).toFixed(2)}</td></tr>`).join('')}</tbody>
        </table>
      ` : '<p style="color:#888;margin-top:16px">No revenue events recorded yet. Revenue tracking activates when players make real-money purchases.</p>'}
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

// ═══════════════════════════════════════
// BOT CONTROL CENTER
// ═══════════════════════════════════════

async function loadBots() {
  const el = document.getElementById('bot-controls');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/economy/bots`, { headers: AUTH_HEADER });
    const data = await res.json();

    const fmt = n => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${Math.round(n)}`;

    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Active Bots</div><div class="value">${data.botCount}</div></div>
        <div class="stat-card"><div class="label">Real Players</div><div class="value green">${data.realCount}</div></div>
        <div class="stat-card"><div class="label">Bot:Real Ratio</div><div class="value">${data.ratio}:1</div></div>
        <div class="stat-card"><div class="label">Bots Status</div><div class="value ${data.botsPaused ? 'red' : 'green'}">${data.botsPaused ? 'PAUSED' : 'RUNNING'}</div></div>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn btn-green btn-sm" onclick="spawnBots()">Spawn Bots</button>
        <input type="number" id="spawn-count" value="3" min="1" max="10" style="width:60px">
        <label style="font-size:12px;color:#888;align-self:center">Intensity:</label>
        <input type="number" id="spawn-intensity" value="5" min="1" max="10" style="width:60px">
        <button class="btn btn-${data.botsPaused ? 'green' : 'red'} btn-sm" onclick="${data.botsPaused ? 'resumeBots()' : 'pauseBots()'}">
          ${data.botsPaused ? 'Resume All' : 'Pause All'}
        </button>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Intensity</th><th>Rep</th><th>Cash</th><th>Shops</th><th>Wealth</th><th>Actions</th></tr></thead>
        <tbody>${data.bots.map(b => `
          <tr>
            <td>${esc(b.name)}</td>
            <td><span class="badge badge-${b.isStealth ? 'blue' : 'gray'}">${b.isStealth ? 'Stealth' : 'Legacy'}</span></td>
            <td>${b.intensity}</td>
            <td>${Math.round(b.rep)}</td>
            <td>${fmt(b.cash)}</td>
            <td>${b.shops}</td>
            <td>${fmt(b.wealth)}</td>
            <td>
              <select onchange="setBotIntensity('${esc(b.id)}', this.value)" style="width:60px">
                ${[1,2,3,4,5,6,7,8,9,10].map(i => `<option value="${i}" ${i===b.intensity?'selected':''}>${i}</option>`).join('')}
              </select>
            </td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

async function spawnBots() {
  const count = Number(document.getElementById('spawn-count').value) || 3;
  const intensity = Number(document.getElementById('spawn-intensity').value) || 5;
  await fetch(`${API}/economy/bots/spawn`, {
    method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ count, intensity }),
  });
  loadBots();
}

async function pauseBots() {
  await fetch(`${API}/economy/bots/pause`, { method: 'POST', headers: AUTH_HEADER });
  loadBots();
}

async function resumeBots() {
  await fetch(`${API}/economy/bots/resume`, { method: 'POST', headers: AUTH_HEADER });
  loadBots();
}

async function setBotIntensity(id, intensity) {
  await fetch(`${API}/economy/bots/${id}/intensity`, {
    method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ intensity: Number(intensity) }),
  });
}

// ═══════════════════════════════════════
// ECONOMY SIMULATOR
// ═══════════════════════════════════════

async function loadSimulator() {
  const el = document.getElementById('sim-controls');
  // Fetch player list for dropdown
  try {
    const res = await fetch(`${API}/players?limit=50`, { headers: AUTH_HEADER });
    const data = await res.json();
    const players = (data.players || []).filter(p => !p.game_state?.isAI);

    el.innerHTML = `
      <div style="padding:12px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:16px">
        <h4 style="margin-bottom:8px;font-size:14px">Run Simulation</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="sim-player" style="min-width:200px">
            ${players.map(p => `<option value="${esc(p.id)}">${esc(p.game_state?.companyName || p.name)}</option>`).join('')}
          </select>
          <div class="edit-field"><label>Days</label><input type="number" id="sim-days" value="30" min="1" max="365" style="width:80px"></div>
          <button class="btn btn-green btn-sm" onclick="runSimulation()">Simulate</button>
        </div>
      </div>
      <div id="sim-results"></div>
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

async function runSimulation() {
  const playerId = document.getElementById('sim-player').value;
  const days = Number(document.getElementById('sim-days').value) || 30;
  const resultsEl = document.getElementById('sim-results');
  resultsEl.innerHTML = '<em style="color:#888">Running simulation...</em>';

  try {
    const res = await fetch(`${API}/economy/simulate`, {
      method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ playerId, days }),
    });
    const data = await res.json();
    if (!data.ok) { resultsEl.innerHTML = `<em style="color:#ef5350">${esc(data.error)}</em>`; return; }

    const fmt = n => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${Math.round(n)}`;
    const snaps = data.snapshots || [];
    const first = snaps[0] || {};
    const last = snaps[snaps.length - 1] || {};
    const cashChange = last.cash - first.cash;
    const revChange = last.rev - first.rev;

    resultsEl.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Cash Change</div><div class="value ${cashChange >= 0 ? 'green' : 'red'}">${cashChange >= 0 ? '+' : ''}${fmt(cashChange)}</div></div>
        <div class="stat-card"><div class="label">Rev Gained</div><div class="value green">+${fmt(revChange)}</div></div>
        <div class="stat-card"><div class="label">Rep Change</div><div class="value">${first.rep} → ${last.rep}</div></div>
        <div class="stat-card"><div class="label">Days Simulated</div><div class="value">${data.daysSimulated}</div></div>
      </div>
      <h4 style="margin:12px 0 8px">Snapshots (every 7 days)</h4>
      <table>
        <thead><tr><th>Day</th><th>Cash</th><th>Revenue</th><th>Rep</th><th>Shops</th></tr></thead>
        <tbody>${snaps.map(s => `<tr><td>${s.day}</td><td>${fmt(s.cash)}</td><td>${fmt(s.rev)}</td><td>${s.rep}</td><td>${s.shops}</td></tr>`).join('')}</tbody>
      </table>
    `;
  } catch (e) {
    resultsEl.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

// ═══════════════════════════════════════
// EVENT SCHEDULER
// ═══════════════════════════════════════

async function loadSchedule() {
  const el = document.getElementById('schedule-controls');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/economy/schedule`, { headers: AUTH_HEADER });
    const data = await res.json();

    // Also fetch available events for the dropdown
    const evRes = await fetch(`${API}/events`, { headers: AUTH_HEADER });
    const evData = await evRes.json();
    const available = evData.available || [];

    el.innerHTML = `
      <p style="font-size:13px;color:#888;margin-bottom:12px">Current Day: <strong style="color:#ffd54f">${data.currentDay}</strong></p>
      ${(data.activeEvents || []).length > 0 ? `
        <h4 style="margin-bottom:8px">Active Events</h4>
        ${data.activeEvents.map(e => `
          <div class="event-card"><div class="event-info"><div class="event-name">${esc(e.id)}</div><div class="event-meta">Day ${e.startDay} - ${e.endDay}</div></div></div>
        `).join('')}
      ` : ''}
      <div style="padding:12px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin:16px 0">
        <h4 style="margin-bottom:8px;font-size:14px">Schedule Event</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="sched-event" style="min-width:200px">
            ${available.map(e => `<option value="${esc(e.id)}">${esc(e.name || e.id)}</option>`).join('')}
          </select>
          <div class="edit-field"><label>Day</label><input type="number" id="sched-day" value="${data.currentDay + 7}" min="${data.currentDay}" style="width:80px"></div>
          <div class="edit-field"><label>Duration</label><input type="number" id="sched-dur" placeholder="Auto" min="1" max="60" style="width:80px"></div>
          <button class="btn btn-green btn-sm" onclick="scheduleEvent()">Schedule</button>
        </div>
      </div>
      <h4 style="margin-bottom:8px">Scheduled</h4>
      ${(data.events || []).map(e => `
        <div class="thread-card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>${esc(e.event_id)}</strong>
              <span style="color:#888;font-size:12px;margin-left:8px">Day ${e.trigger_day}${e.duration ? ` (${e.duration}d)` : ''}</span>
            </div>
            <span class="badge badge-${e.status === 'scheduled' ? 'blue' : e.status === 'active' ? 'green' : 'gray'}">${esc(e.status)}</span>
          </div>
          <div class="thread-actions">
            <button class="btn btn-red btn-sm" onclick="cancelScheduled('${esc(e.id)}')">Cancel</button>
          </div>
        </div>
      `).join('') || '<em style="color:#555">No scheduled events</em>'}
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

async function scheduleEvent() {
  const eventId = document.getElementById('sched-event').value;
  const triggerDay = Number(document.getElementById('sched-day').value);
  const dur = document.getElementById('sched-dur').value;
  const duration = dur ? Number(dur) : undefined;
  await fetch(`${API}/economy/schedule`, {
    method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ eventId, triggerDay, duration }),
  });
  loadSchedule();
}

async function cancelScheduled(id) {
  await fetch(`${API}/economy/schedule/${id}`, { method: 'DELETE', headers: AUTH_HEADER });
  loadSchedule();
}

// ═══════════════════════════════════════
// MARKET WATCH
// ═══════════════════════════════════════

async function loadMarketWatch() {
  const el = document.getElementById('watch-alerts');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/economy/market-watch`, { headers: AUTH_HEADER });
    const data = await res.json();

    const severityColor = { high: 'red', medium: 'gold', low: 'blue' };
    el.innerHTML = `
      <p style="font-size:13px;color:#888;margin-bottom:12px">TC Fair Value: <strong style="color:#ffd54f">$${(data.tcFairValue || 0).toLocaleString()}</strong></p>
      ${(data.alerts || []).length > 0 ? data.alerts.map(a => `
        <div class="thread-card" style="border-left:3px solid var(--${a.severity === 'high' ? 'red' : a.severity === 'medium' ? 'gold' : 'blue'}, #888)">
          <span class="badge badge-${severityColor[a.severity] || 'gray'}">${esc(a.severity)}</span>
          <strong style="margin-left:8px">${esc(a.type)}</strong>
          <div style="font-size:13px;color:#aaa;margin-top:4px">${esc(a.player)}: ${esc(a.detail)}</div>
        </div>
      `).join('') : '<div style="text-align:center;padding:32px;color:#666">No suspicious activity detected</div>'}
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}
