// ─── Secret Admin Login (triple-tap logo) ────────────────────────────────────

(function() {
  var tapCount = 0, tapTimer = null;
  var icon = document.getElementById('login-logo-icon');
  if (!icon) return;
  function handleTap() {
    tapCount++;
    clearTimeout(tapTimer);
    if (tapCount >= 3) {
      tapCount = 0;
      document.getElementById('admin-secret-modal').style.display = 'flex';
      document.getElementById('admin-secret-pid').value = '';
      document.getElementById('admin-secret-pw').value = '';
      document.getElementById('admin-secret-err').textContent = '';
      document.getElementById('admin-secret-pid').focus();
    } else {
      tapTimer = setTimeout(function() { tapCount = 0; }, 800);
    }
  }
  icon.addEventListener('click', handleTap);
  icon.addEventListener('touchend', function(e) { e.preventDefault(); handleTap(); });
})();

function closeAdminSecretModal() {
  document.getElementById('admin-secret-modal').style.display = 'none';
}

async function doAdminSecretLogin() {
  const pid = document.getElementById('admin-secret-pid').value.trim();
  const pw = document.getElementById('admin-secret-pw').value;
  const errEl = document.getElementById('admin-secret-err');
  errEl.textContent = '';
  if (!pid || !pw) { errEl.textContent = 'შეავსეთ ყველა ველი'; return; }
  const btn = document.getElementById('admin-secret-btn');
  btn.disabled = true; btn.textContent = '...';
  try {
    const data = await api('/api/auth/login', 'POST', { personalId: pid, password: pw });
    if (!data.token) { errEl.textContent = data.error || 'შეცდომა'; btn.disabled = false; btn.textContent = 'შესვლა'; return; }
    if (!data.user || !data.user.isAdmin) { errEl.textContent = 'ეს არ არის ადმინის ანგარიში'; btn.disabled = false; btn.textContent = 'შესვლა'; return; }
    TOKEN = data.token;
    localStorage.setItem('exam_token', TOKEN);
    currentUser = data.user;
    closeAdminSecretModal();
    await initApp();
  } catch(e) {
    errEl.textContent = e.message || 'სერვერის შეცდომა';
    btn.disabled = false; btn.textContent = 'შესვლა';
  }
}

document.getElementById('admin-secret-modal').addEventListener('click', function(e) {
  if (e.target === this) closeAdminSecretModal();
});

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeAdminSecretModal();
  if (e.key === 'Enter' && document.getElementById('admin-secret-modal').style.display === 'flex') doAdminSecretLogin();
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    if (document.getElementById('admin-secret-modal').style.display === 'flex') return;
    if (document.getElementById('page-login').classList.contains('active')) doLogin();
    else if (document.getElementById('page-register').classList.contains('active')) doRegister();
  }
  if (e.key === 'Escape') {
    closeSubModal();
    closeEditPrefsModal();
  }
});

document.getElementById('sub-modal').addEventListener('click', function(e) {
  if (e.target === this) closeSubModal();
});
document.getElementById('edit-prefs-modal').addEventListener('click', function(e) {
  if (e.target === this) closeEditPrefsModal();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

if (TOKEN) initApp();
else showPage('page-login');
