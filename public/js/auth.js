// ─── Auth ─────────────────────────────────────────────────────────────────────

async function doLogin() {
  const pid = document.getElementById('login-pid').value.trim();
  const pw  = document.getElementById('login-pw').value;
  const err = document.getElementById('login-err');
  err.style.display = 'none';
  if (!pid || !pw) { err.textContent = 'შეავსეთ ყველა ველი'; err.style.display = 'block'; return; }
  setBtn('login-btn', '<span class="spinner"></span>გთხოვთ დაიცადოთ...', true);
  try {
    const r = await api('/api/auth/login', 'POST', { personalId: pid, password: pw });
    if (r.user && r.user.isAdmin) {
      err.textContent = 'მომხმარებელი ვერ მოიძებნა'; err.style.display = 'block';
      setBtn('login-btn', 'შესვლა', false);
      return;
    }
    TOKEN = r.token;
    localStorage.setItem('exam_token', TOKEN);
    currentUser = r.user;
    initApp();
  } catch(e) {
    err.textContent = e.message; err.style.display = 'block';
    setBtn('login-btn', 'შესვლა', false);
  }
}

async function doRegister() {
  const pid   = document.getElementById('reg-pid').value.trim();
  const name  = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const pw    = document.getElementById('reg-pw').value;
  const pw2   = document.getElementById('reg-pw2').value;
  const err   = document.getElementById('reg-err');
  err.style.display = 'none';
  if (pw !== pw2) { err.textContent = 'პაროლები არ ემთხვევა'; err.style.display = 'block'; return; }
  setBtn('reg-btn', '<span class="spinner"></span>იქმნება...', true);
  try {
    const r = await api('/api/auth/register', 'POST', { personalId: pid, fullName: name, phone: phone, password: pw });
    TOKEN = r.token;
    localStorage.setItem('exam_token', TOKEN);
    currentUser = r.user;
    initApp();
  } catch(e) {
    err.textContent = e.message; err.style.display = 'block';
    setBtn('reg-btn', 'ანგარიშის შექმნა', false);
  }
}

async function doLogout() {
  try { await api('/api/auth/logout', 'POST'); } catch {}
  TOKEN = null; currentUser = null;
  localStorage.removeItem('exam_token');
  stopTracking();
  showPage('page-login');
}

async function refreshUser() {
  try {
    currentUser = await api('/api/auth/me');
    renderApp();
  } catch(e) { toast(e.message, 'error'); }
}

// ─── App Init ─────────────────────────────────────────────────────────────────

async function initApp() {
  showPage('page-app');
  try {
    currentUser = await api('/api/auth/me');
  } catch {
    doLogout(); return;
  }
  renderApp();

  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success') {
    toast('გადახდა განხილულია! ადმინი 24 სთ-ში გააქტიურებს გამოწერას.', 'success');
    window.history.replaceState({}, '', '/');
  }
}

function renderApp() {
  const u = currentUser;
  document.getElementById('hdr-user').textContent = u.fullName || u.personalId;

  const badge = document.getElementById('hdr-badge');
  if (u.isAdmin) {
    badge.textContent = '🛡️ ადმინი';
    badge.className = 'sub-badge admin';
  } else if (u.subscriptionActive) {
    badge.textContent = '✅ გამოწერა აქტიურია';
    badge.className = 'sub-badge active';
  } else {
    badge.textContent = '❌ გამოწერა არ გაქვს';
    badge.className = 'sub-badge inactive';
  }

  const userView  = document.getElementById('user-view');
  const adminView = document.getElementById('admin-view');

  if (u.isAdmin) {
    userView.classList.remove('show');
    adminView.classList.add('show');
    loadAdminStats();
    loadAdminUsers();
    loadSlotEvents();
  } else {
    adminView.classList.remove('show');
    userView.classList.add('show');
    renderUserView();
  }
}

// ─── User View ────────────────────────────────────────────────────────────────

function showUserPanel(id) {
  ['panel-subscribe','panel-pending','panel-setup','panel-tracking'].forEach(function(p) {
    const el = document.getElementById(p);
    if (el) el.classList.toggle('show', p === id);
  });
}

function hasPreferences(u) {
  return u.preferences && u.preferences.city && u.preferences.category && u.preferences.earliestDate;
}

function renderUserView() {
  const u = currentUser;
  stopTracking();

  if (!u.subscriptionActive) {
    if (hasPreferences(u)) {
      showUserPanel('panel-pending');
      renderPendingPrefs();
    } else {
      showUserPanel('panel-subscribe');
    }
    return;
  }

  if (!hasPreferences(u)) {
    showUserPanel('panel-setup');
    const d = new Date(); d.setDate(d.getDate() + 7);
    const el = document.getElementById('setup-date');
    if (el) el.value = d.toISOString().split('T')[0];
    return;
  }

  showUserPanel('panel-tracking');
  renderTrackingPrefs();
  autoStartTracking();
}

function renderPendingPrefs() {
  const p = currentUser.preferences;
  if (!p) return;
  const wrap = document.getElementById('pending-prefs-display');
  if (!wrap) return;
  wrap.innerHTML =
    '<div class="pending-pref-chip">🏙️ <strong>' + cityLabel(p.city) + '</strong></div>' +
    '<div class="pending-pref-chip">🚗 <strong>' + p.category + '</strong></div>' +
    '<div class="pending-pref-chip">📅 <strong>' + fmtDateShort(p.earliestDate) + '</strong></div>';
}

function renderTrackingPrefs() {
  const p = currentUser.preferences;
  if (!p) return;
  document.getElementById('trk-cat').textContent  = p.category || '—';
  document.getElementById('trk-city').textContent = cityLabel(p.city);
  document.getElementById('trk-date').textContent = fmtDateShort(p.earliestDate);
}
