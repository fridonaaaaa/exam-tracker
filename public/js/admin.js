// ─── Admin ────────────────────────────────────────────────────────────────────

function switchAdminTab(name, el) {
  document.querySelectorAll('.admin-tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.admin-panel').forEach(function(p) { p.classList.remove('active'); });
  el.classList.add('active');
  document.getElementById('atab-' + name).classList.add('active');
}

async function loadAdminStats() {
  try {
    const results = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/slot-events').catch(function() { return []; })
    ]);
    const users = results[0];
    const events = results[1];
    const active = users.filter(function(u) { return u.subscriptionActive; }).length;
    document.getElementById('st-total').textContent   = users.length;
    document.getElementById('st-active').textContent  = active;
    document.getElementById('st-inactive').textContent = users.length - active;
    document.getElementById('st-events').textContent  = events.length;

    allSlotEvents = events;
    renderEventsInDiv('stats-events-wrap', events.slice(0, 10));
  } catch(e) { toast('ადმინ შეცდომა: ' + e.message, 'error'); }
}

async function loadAdminUsers() {
  try {
    const users = await api('/api/admin/users');
    adminUsersCache = users;
    renderUsersTable(users);
  } catch(e) { toast('მომხმარებლების ჩატვირთვა ვერ მოხერხდა', 'error'); }
}

function filterUsersTable(query) {
  const q = query.toLowerCase();
  const filtered = adminUsersCache.filter(function(u) {
    return (u.fullName || '').toLowerCase().includes(q) ||
      (u.personalId || '').includes(q) ||
      ((u.preferences && u.preferences.city) || '').includes(q) ||
      ((u.preferences && u.preferences.category) || '').toLowerCase().includes(q);
  });
  renderUsersTable(filtered);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:32px">მომხმარებელი ვერ მოიძებნა</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(function(u) {
    const isMe = u.personalId === (currentUser && currentUser.personalId);
    const p = u.preferences || {};
    const masked = maskId(u.personalId);
    return '<tr>' +
      '<td style="font-weight:600">' + u.fullName + '</td>' +
      '<td><span style="font-family:monospace;font-size:12px;color:var(--text-muted)">' + masked + '</span></td>' +
      '<td style="font-size:12px;color:var(--text-muted)">' + (u.phone || '—') + '</td>' +
      '<td style="font-size:12px">' + (p.city ? cityLabel(p.city) : '<span style="color:var(--text-dim)">—</span>') + '</td>' +
      '<td style="font-size:12px">' + (p.category || '<span style="color:var(--text-dim)">—</span>') + '</td>' +
      '<td style="font-size:12px">' + (p.earliestDate ? fmtDateShort(p.earliestDate) : '<span style="color:var(--text-dim)">—</span>') + '</td>' +
      '<td>' + (u.subscriptionActive
        ? '<span class="badge badge-green">✅ აქტიური</span>'
        : '<span class="badge badge-red">❌ არ აქვს</span>') + '</td>' +
      '<td style="font-size:12px;color:var(--text-muted)">' + (u.subscriptionExpiry ? fmtDate(u.subscriptionExpiry) : '—') + '</td>' +
      '<td>' + (isMe ? '<span style="font-size:11px;color:var(--text-dim)">ადმინი</span>' :
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button class="btn btn-success btn-sm" onclick="showActForm(\'' + u.personalId + '\')">✅ გააქტიურება</button>' +
          '<button class="btn btn-danger btn-sm" onclick="adminDeactivate(\'' + u.personalId + '\')">❌ გაუქმება</button>' +
        '</div>' +
        '<div class="act-form" id="actform-' + u.personalId + '">' +
          '<input type="number" value="30" min="1" max="365" id="actdays-' + u.personalId + '"/>' +
          '<span style="font-size:12px;color:var(--text-muted)">დღე</span>' +
          '<button class="btn btn-success btn-sm" onclick="adminActivate(\'' + u.personalId + '\')">✓</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="hideActForm(\'' + u.personalId + '\')">✕</button>' +
        '</div>') +
      '</td></tr>';
  }).join('');
}

function maskId(pid) {
  if (!pid || pid.length < 5) return pid;
  return pid.slice(0, 3) + '•'.repeat(pid.length - 5) + pid.slice(-2);
}

function showActForm(pid) { document.getElementById('actform-'+pid).classList.add('show'); }
function hideActForm(pid) { document.getElementById('actform-'+pid).classList.remove('show'); }

async function adminActivate(pid) {
  const days = parseInt((document.getElementById('actdays-'+pid) || {}).value) || 30;
  try {
    await api('/api/admin/activate', 'POST', { personalId: pid, days: days });
    toast('გააქტიურდა ' + days + ' დღით', 'success');
    loadAdminUsers();
    loadAdminStats();
  } catch(e) { toast(e.message, 'error'); }
}

async function adminDeactivate(pid) {
  try {
    await api('/api/admin/deactivate', 'POST', { personalId: pid });
    toast('გამოწერა გაუქმდა', 'info');
    loadAdminUsers();
    loadAdminStats();
  } catch(e) { toast(e.message, 'error'); }
}

// ─── Slot Events ──────────────────────────────────────────────────────────────

async function loadSlotEvents() {
  const wrap = document.getElementById('events-wrap');
  if (wrap) wrap.innerHTML = '<div class="state-box"><div class="spinner-lg"></div></div>';
  try {
    allSlotEvents = await api('/api/admin/slot-events');
    filterEvents();
  } catch(e) {
    if (wrap) wrap.innerHTML = '<div class="state-box"><div class="state-icon">❌</div><h3>შეცდომა</h3><p>' + e.message + '</p></div>';
  }
}

function filterEvents() {
  const type = ((document.getElementById('ev-filter') || {}).value) || '';
  const cat  = ((document.getElementById('ev-filter-cat') || {}).value) || '';
  const city = ((document.getElementById('ev-filter-city') || {}).value) || '';
  const events = allSlotEvents.filter(function(e) {
    if (type && e.type !== type) return false;
    if (cat  && String(e.categoryCode) !== cat) return false;
    if (city && !(e.center || '').includes(city)) return false;
    return true;
  });
  const countEl = document.getElementById('ev-count');
  if (countEl) countEl.textContent = events.length + ' ჩანაწერი';
  renderEventsInDiv('events-wrap', events);
}

function renderEventsInDiv(wrapperId, events) {
  const wrap = document.getElementById(wrapperId);
  if (!wrap) return;
  if (!events.length) {
    wrap.innerHTML = '<div class="state-box"><div class="state-icon">📭</div><h3>მოვლენები არ არის</h3><p>სლოტ-მოვლენები გამოჩნდება როდესაც მომხმარებლები ადგილებს ეძებენ</p></div>';
    return;
  }
  wrap.innerHTML = '<div class="events-wrap">' + events.map(function(e) {
    const typeLabel = e.type === 'opened' ? 'გაიხსნა' : e.type === 'booked' ? 'დაიჯავშნა' : e.type;
    return '<div class="event-row ' + (e.type || '') + '">' +
      '<div class="ev-dot ' + (e.type || '') + '"></div>' +
      '<span class="ev-time">' + fmtDate(e.timestamp) + '</span>' +
      '<span class="ev-type ' + (e.type || '') + '">' + typeLabel + '</span>' +
      '<span class="ev-detail">' + (e.center || '—') + (e.slotDate ? ' — ' + e.slotDate : '') +
        ' <span style="color:var(--text-dim);font-size:11px">(კატ. ' + (e.categoryCode || '—') + ')</span></span>' +
      '</div>';
  }).join('') + '</div>';
}

// ─── Admin Tools ──────────────────────────────────────────────────────────────

async function toolCheckSlots() {
  const cat = document.getElementById('tool-cat').value;
  const out = document.getElementById('tool-slots-out');
  out.style.display = 'block'; out.textContent = 'იტვირთება...';
  try { out.textContent = JSON.stringify(await api('/api/all-slots?categoryCode=' + cat), null, 2); }
  catch(e) { out.textContent = 'შეცდომა: ' + e.message; }
}

async function toolHealth() {
  const out = document.getElementById('tool-health-out');
  out.style.display = 'block'; out.textContent = 'იტვირთება...';
  try { out.textContent = JSON.stringify(await api('/api/health'), null, 2); }
  catch(e) { out.textContent = 'შეცდომა: ' + e.message; }
}
