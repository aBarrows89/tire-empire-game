/* Retention Tools — admin frontend */

function loadRetention() {
  loadChurnRisk();
}

// ═══════════════════════════════════════
// CHURN RISK DASHBOARD
// ═══════════════════════════════════════

async function loadChurnRisk() {
  const el = document.getElementById('churn-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/retention/churn-risk`, { headers: AUTH_HEADER });
    const data = await res.json();
    const players = data.players || [];

    const fmt = n => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${Math.round(n)}`;
    const riskClass = r => r >= 60 ? 'high' : r >= 30 ? 'med' : 'low';
    const riskLabel = r => r >= 60 ? 'HIGH' : r >= 30 ? 'MEDIUM' : 'HEALTHY';
    const riskBadge = r => r >= 60 ? 'badge-red' : r >= 30 ? 'badge-gold' : 'badge-green';

    const high = players.filter(p => p.risk >= 60);
    const med = players.filter(p => p.risk >= 30 && p.risk < 60);
    const low = players.filter(p => p.risk < 30);

    function renderPlayer(p) {
      return `
        <div class="thread-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong>${esc(p.name)}</strong>
            <div>
              <span class="badge ${riskBadge(p.risk)}">${riskLabel(p.risk)} ${p.risk}/100</span>
              ${p.lastActive ? `<span style="font-size:11px;color:#888;margin-left:8px">Last: ${timeAgo(p.lastActive)}</span>` : ''}
            </div>
          </div>
          <div style="font-size:12px;color:#aaa">
            Cash: ${fmt(p.cash)} | Rep: ${Math.round(p.rep * 10) / 10} | Shops: ${p.shops} | Day: ${p.day} | Daily Rev: ${fmt(p.dayRev)}
          </div>
          ${p.issues.length > 0 ? `<div style="font-size:12px;color:#ffa726;margin-top:4px">Issues: ${esc(p.issues.join(', '))}</div>` : ''}
          <div class="thread-actions">
            <button class="btn btn-outline btn-sm" onclick="sendVinnieNudge('${esc(p.id)}')">Send Vinnie Nudge</button>
            <button class="btn btn-green btn-sm" onclick="giftBoost('${esc(p.id)}')">Gift Boost</button>
          </div>
        </div>
      `;
    }

    el.innerHTML = `
      <button class="btn btn-outline btn-sm" onclick="loadChurnRisk()" style="margin-bottom:12px">Refresh</button>
      ${high.length > 0 ? `<h4 style="color:#ef5350;margin-bottom:8px">HIGH RISK (${high.length})</h4>${high.map(renderPlayer).join('')}` : ''}
      ${med.length > 0 ? `<h4 style="color:#ffa726;margin:12px 0 8px">MEDIUM RISK (${med.length})</h4>${med.map(renderPlayer).join('')}` : ''}
      ${low.length > 0 ? `<h4 style="color:#66bb6a;margin:12px 0 8px">HEALTHY (${low.length})</h4>${low.map(renderPlayer).join('')}` : ''}
      ${players.length === 0 ? '<em style="color:#555">No real players found</em>' : ''}
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

function timeAgo(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function sendVinnieNudge(playerId) {
  const msg = prompt('Vinnie message to send:', "Hey kid, where you been? Your shop's collecting dust.");
  if (!msg) return;
  try {
    await fetch(`${API}/retention/push/send`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ title: 'Vinnie says...', body: msg, segment: 'custom', playerIds: [playerId] }),
    });
    alert('Nudge sent!');
  } catch (e) { alert('Error: ' + e.message); }
}

async function giftBoost(playerId) {
  if (!confirm('Gift $50K + 10 TC to this player?')) return;
  try {
    await fetch(`${API}/players/${playerId}/edit`, {
      method: 'POST', headers: AUTH_HEADER,
      body: JSON.stringify({ _addCash: 50000, _addTC: 10 }),
    });
    alert('Boost gifted!');
    loadChurnRisk();
  } catch (e) { alert('Error: ' + e.message); }
}

// ═══════════════════════════════════════
// PLAYER JOURNEY VISUALIZER
// ═══════════════════════════════════════

async function loadJourneys() {
  const el = document.getElementById('journey-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const res = await fetch(`${API}/retention/journeys`, { headers: AUTH_HEADER });
    const data = await res.json();
    const { funnel, journeys, totalPlayers } = data;

    const maxCount = totalPlayers || 1;

    el.innerHTML = `
      <h4 style="margin-bottom:12px">Player Funnel (${totalPlayers} real players)</h4>
      ${(funnel || []).map(m => {
        const pct = m.pct;
        const width = Math.max(2, pct);
        return `
          <div class="funnel-row">
            <div class="funnel-label">${esc(m.label)}</div>
            <div class="funnel-bar" style="width:${width}%;background:${pct > 50 ? '#2979ff' : pct > 20 ? '#ffa726' : '#ef5350'}"></div>
            <div class="funnel-count">${m.count}/${totalPlayers} (${pct}%)</div>
          </div>
        `;
      }).join('')}

      <h4 style="margin:24px 0 12px">Per-Player Journeys</h4>
      ${(journeys || []).map(j => {
        const total = funnel.length;
        const reached = j.reached.length;
        return `
          <div class="thread-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong>${esc(j.name)}</strong>
              <span style="font-size:12px;color:#888">Day ${j.day} | ${reached}/${total} milestones</span>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${funnel.map(m => {
                const done = j.reached.includes(m.id);
                return `<span class="badge ${done ? 'badge-green' : 'badge-gray'}" style="font-size:10px">${done ? '✓' : '○'} ${esc(m.label)}</span>`;
              }).join('')}
            </div>
          </div>
        `;
      }).join('')}
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

// ═══════════════════════════════════════
// PUSH NOTIFICATION MANAGER
// ═══════════════════════════════════════

async function loadPushManager() {
  const el = document.getElementById('push-content');
  el.innerHTML = '<em style="color:#888">Loading...</em>';
  try {
    const [tplRes, histRes] = await Promise.all([
      fetch(`${API}/retention/push/templates`, { headers: AUTH_HEADER }),
      fetch(`${API}/retention/push/history`, { headers: AUTH_HEADER }),
    ]);
    const tplData = await tplRes.json();
    const histData = await histRes.json();

    el.innerHTML = `
      <div style="padding:12px;background:#1a1a2e;border-radius:8px;border:1px solid #333;margin-bottom:16px">
        <h4 style="margin-bottom:8px;font-size:14px">Quick Send</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:500px">
          <div class="edit-field"><label>Title</label><input type="text" id="push-title" placeholder="Notification title"></div>
          <div class="edit-field"><label>Segment</label>
            <select id="push-segment">
              <option value="all">All Players</option>
              <option value="premium">Premium</option>
              <option value="free">Free</option>
            </select>
          </div>
        </div>
        <textarea id="push-body" rows="2" placeholder="Notification body... (use {{playerName}} for personalization)" style="width:100%;margin:8px 0"></textarea>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-green btn-sm" onclick="sendQuickPush()">Send Now</button>
          <button class="btn btn-outline btn-sm" onclick="savePushTemplate()">Save as Template</button>
        </div>
      </div>

      <h4 style="margin-bottom:8px">Templates</h4>
      ${(tplData.templates || []).map(t => `
        <div class="thread-card" style="cursor:pointer" onclick="fillPushTemplate('${esc(t.title)}', '${esc(t.body)}')">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>${esc(t.name)}</strong>
            <span class="badge badge-blue">${esc(t.segment)}</span>
          </div>
          <div style="font-size:12px;color:#aaa;margin-top:2px">${esc(t.title)} — ${esc(t.body).slice(0, 60)}...</div>
          <button class="btn btn-red btn-sm" style="margin-top:6px" onclick="event.stopPropagation(); deletePushTemplate('${esc(t.id)}')">Delete</button>
        </div>
      `).join('') || '<em style="color:#555">No templates</em>'}

      <h4 style="margin:16px 0 8px">Recent History</h4>
      <table>
        <thead><tr><th>Time</th><th>Player</th><th>Title</th><th>Body</th></tr></thead>
        <tbody>${(histData.history || []).slice(0, 20).map(h => `
          <tr>
            <td style="font-size:11px">${h.sent_at ? new Date(h.sent_at).toLocaleDateString() : ''}</td>
            <td style="font-size:12px">${esc((h.player_id || '').slice(0, 12))}</td>
            <td>${esc(h.title)}</td>
            <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(h.body)}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  } catch (e) {
    el.innerHTML = `<em style="color:#ef5350">Error: ${esc(e.message)}</em>`;
  }
}

function fillPushTemplate(title, body) {
  document.getElementById('push-title').value = title;
  document.getElementById('push-body').value = body;
}

async function sendQuickPush() {
  const title = document.getElementById('push-title').value.trim();
  const body = document.getElementById('push-body').value.trim();
  const segment = document.getElementById('push-segment').value;
  if (!title || !body) return alert('Title and body required');
  try {
    const res = await fetch(`${API}/retention/push/send`, {
      method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ title, body, segment }),
    });
    const data = await res.json();
    alert(`Sent to ${data.sentCount || 0} of ${data.targeted || 0} targeted players`);
    loadPushManager();
  } catch (e) { alert('Error: ' + e.message); }
}

async function savePushTemplate() {
  const title = document.getElementById('push-title').value.trim();
  const body = document.getElementById('push-body').value.trim();
  const segment = document.getElementById('push-segment').value;
  const name = prompt('Template name:');
  if (!name || !title || !body) return;
  await fetch(`${API}/retention/push/templates`, {
    method: 'POST', headers: AUTH_HEADER, body: JSON.stringify({ name, title, body, segment }),
  });
  loadPushManager();
}

async function deletePushTemplate(id) {
  if (!confirm('Delete this template?')) return;
  await fetch(`${API}/retention/push/templates/${id}`, { method: 'DELETE', headers: AUTH_HEADER });
  loadPushManager();
}
