// ─── UI Helpers ───────────────────────────────────────────────────────────────

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function togglePw(id, btn) {
  const inp = document.getElementById(id);
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else { inp.type = 'password'; btn.textContent = '👁'; }
}

function toast(msg, type) {
  type = type || 'info';
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
  const wrap = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span><span>' + msg + '</span>';
  wrap.appendChild(el);
  setTimeout(function() {
    el.classList.add('removing');
    el.addEventListener('animationend', function() { el.remove(); });
  }, 3800);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = function(n) { return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '/' + p(d.getMonth()+1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = function(n) { return String(n).padStart(2, '0'); };
  return p(d.getDate()) + '/' + p(d.getMonth()+1) + '/' + d.getFullYear();
}

function cityLabel(val) { return CITY_LABELS[val] || val || '—'; }

function setBtn(id, html, disabled) {
  const b = document.getElementById(id);
  if (!b) return;
  b.innerHTML = html;
  b.disabled = disabled;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validatePid() {
  const v = document.getElementById('reg-pid').value;
  const st = document.getElementById('pid-st');
  const inp = document.getElementById('reg-pid');
  if (v.length === 11 && /^\d{11}$/.test(v)) {
    st.textContent = '✅'; inp.classList.add('valid'); inp.classList.remove('invalid');
  } else if (v.length > 0) {
    st.textContent = '❌'; inp.classList.add('invalid'); inp.classList.remove('valid');
  } else {
    st.textContent = ''; inp.classList.remove('valid', 'invalid');
  }
}

function validatePw2() {
  const p1 = document.getElementById('reg-pw').value;
  const p2 = document.getElementById('reg-pw2').value;
  const st = document.getElementById('pw2-st');
  const inp = document.getElementById('reg-pw2');
  if (!p2) { st.textContent = ''; inp.classList.remove('valid', 'invalid'); return; }
  if (p1 === p2) { st.textContent = '✅'; inp.classList.add('valid'); inp.classList.remove('invalid'); }
  else { st.textContent = '❌'; inp.classList.add('invalid'); inp.classList.remove('valid'); }
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function api(url, method, body) {
  method = method || 'GET';
  body = body || null;
  const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (body) opts.body = JSON.stringify(body);
  let res;
  try { res = await fetch(url, opts); }
  catch { throw new Error('სერვერთან კავშირი ვერ მოხერხდა. შეამოწმეთ ინტერნეტი.'); }
  let data;
  try { data = await res.json(); }
  catch { throw new Error('სერვერის პასუხი არასწორია (' + res.status + ').'); }
  if (!res.ok) {
    const e = new Error(data.error || 'სერვერის შეცდომა');
    e.code = data.code;
    throw e;
  }
  return data;
}
