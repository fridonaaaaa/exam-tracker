// ─── Setup (subscribed, no prefs) ────────────────────────────────────────────

var setupCatCode = '4';
var setupCatName = 'B — ავტომატი';

function selectSetupCat(btn) {
  document.querySelectorAll('#setup-cats .cat-pill').forEach(function(p) { p.classList.remove('selected'); });
  btn.classList.add('selected');
  setupCatCode = btn.dataset.val;
  setupCatName = btn.dataset.name;
}

async function saveSetupPrefs() {
  const date = document.getElementById('setup-date').value;
  const city = document.getElementById('setup-city').value;
  if (!date) { toast('გთხოვთ შეიყვანოთ უადრესი თარიღი', 'error'); return; }
  setBtn('setup-save-btn', '<span class="spinner"></span>ინახება...', true);
  try {
    await api('/api/user/preferences', 'PUT', {
      earliestDate: date,
      city: city,
      category: setupCatName,
      categoryCode: setupCatCode
    });
    currentUser.preferences = { earliestDate: date, city: city, category: setupCatName, categoryCode: setupCatCode };
    toast('პარამეტრები შენახულია! ძებნა დაიწყო.', 'success');
    showUserPanel('panel-tracking');
    renderTrackingPrefs();
    autoStartTracking();
  } catch(e) {
    toast(e.message, 'error');
    setBtn('setup-save-btn', 'ძებნის დაწყება →', false);
  }
}

// ─── Edit Prefs Modal ─────────────────────────────────────────────────────────

var editCatCode = '4';
var editCatName = 'B — ავტომატი';

function showEditPrefsModal() {
  const p = currentUser.preferences || {};
  const modal = document.getElementById('edit-prefs-modal');

  document.getElementById('edit-date').value = p.earliestDate || '';
  document.getElementById('edit-city').value = p.city || 'ქუთაის';

  document.querySelectorAll('#edit-cats .cat-pill').forEach(function(btn) {
    const active = btn.dataset.val === (p.categoryCode || '4');
    btn.classList.toggle('selected', active);
    if (active) { editCatCode = btn.dataset.val; editCatName = btn.dataset.name; }
  });

  modal.classList.add('show');
}

function closeEditPrefsModal() {
  document.getElementById('edit-prefs-modal').classList.remove('show');
}

function selectEditCat(btn) {
  document.querySelectorAll('#edit-cats .cat-pill').forEach(function(p) { p.classList.remove('selected'); });
  btn.classList.add('selected');
  editCatCode = btn.dataset.val;
  editCatName = btn.dataset.name;
}

async function saveEditedPrefs() {
  const date = document.getElementById('edit-date').value;
  const city = document.getElementById('edit-city').value;
  if (!date) { toast('გთხოვთ შეიყვანოთ უადრესი თარიღი', 'error'); return; }
  setBtn('edit-save-btn', '<span class="spinner"></span>ინახება...', true);
  try {
    await api('/api/user/preferences', 'PUT', {
      earliestDate: date, city: city, category: editCatName, categoryCode: editCatCode
    });
    currentUser.preferences = { earliestDate: date, city: city, category: editCatName, categoryCode: editCatCode };
    toast('პარამეტრები განახლდა!', 'success');
    closeEditPrefsModal();
    renderTrackingPrefs();
    stopTracking();
    checkHistory = [];
    document.getElementById('hist-card').style.display = 'none';
    document.getElementById('slot-alert').classList.remove('show');
    autoStartTracking();
  } catch(e) {
    toast(e.message, 'error');
  }
  setBtn('edit-save-btn', 'შენახვა', false);
}

// ─── Subscription Modal ───────────────────────────────────────────────────────

var modalCatCode = '4';
var modalCatName = 'B — ავტომატი';

function selectModalCat(btn) {
  document.querySelectorAll('#modal-cats .cat-pill').forEach(function(p) { p.classList.remove('selected'); });
  btn.classList.add('selected');
  modalCatCode = btn.dataset.val;
  modalCatName = btn.dataset.name;
}

function showSubModal() {
  const d = new Date(); d.setDate(d.getDate() + 7);
  document.getElementById('modal-date').value = d.toISOString().split('T')[0];
  document.getElementById('sub-step-1').classList.add('active');
  document.getElementById('sub-step-2').classList.remove('active');
  document.getElementById('sub-modal').classList.add('show');
}

function closeSubModal() {
  document.getElementById('sub-modal').classList.remove('show');
}

async function subNextStep() {
  const date = document.getElementById('modal-date').value;
  const city = document.getElementById('modal-city').value;
  if (!date) { toast('გთხოვთ შეიყვანოთ უადრესი თარიღი', 'error'); return; }

  setBtn('sub-next-btn', '<span class="spinner"></span>ინახება...', true);

  try {
    await api('/api/user/preferences', 'PUT', {
      earliestDate: date, city: city, category: modalCatName, categoryCode: modalCatCode
    });
    currentUser.preferences = { earliestDate: date, city: city, category: modalCatName, categoryCode: modalCatCode };

    document.getElementById('pay-prefs-summary').innerHTML =
      '<div class="prefs-confirm-title">შენი პარამეტრები</div>' +
      '<div class="pref-confirm-row">📅 უადრესი თარიღი: <strong>' + fmtDateShort(date) + '</strong></div>' +
      '<div class="pref-confirm-row">🏙️ ქალაქი: <strong>' + cityLabel(city) + '</strong></div>' +
      '<div class="pref-confirm-row">🚗 კატეგორია: <strong>' + modalCatName + '</strong></div>';

    document.getElementById('sub-step-1').classList.remove('active');
    document.getElementById('sub-step-2').classList.add('active');
    document.getElementById('pay-loading').style.display = 'block';
    document.getElementById('pay-info').style.display = 'none';

    const r = await api('/api/payment/create', 'POST');
    document.getElementById('pay-loading').style.display = 'none';

    if (r.redirectUrl) {
      window.location.href = r.redirectUrl;
      return;
    }

    document.getElementById('pay-info').style.display = 'block';
    if (r.manualPaymentInfo) {
      const i = r.manualPaymentInfo;
      document.getElementById('pay-box-content').innerHTML =
        '<div class="pay-row"><span class="pay-row-label">🏦 ბანკის ანგარიში</span><span class="pay-row-value" style="font-family:monospace">' + i.bankAccount + '</span></div>' +
        '<div class="pay-row"><span class="pay-row-label">💰 თანხა</span><span class="pay-row-value" style="color:var(--green)">' + i.amount + '</span></div>' +
        '<div class="pay-row"><span class="pay-row-label">📝 დანიშნულება</span><span class="pay-row-value" style="color:var(--yellow)">' + i.reference + '</span></div>' +
        '<div style="font-size:12px;color:var(--text-dim);padding-top:10px">' + (i.note || 'გადარიცხვის შემდეგ ადმინი გააქტიურებს გამოწერას 24 სთ-ში.') + '</div>';
    } else {
      document.getElementById('pay-box-content').innerHTML = '<p style="color:var(--text-muted);font-size:13px">გადახდის ინფო მიუწვდომელია. დაუკავშირდი ადმინს.</p>';
    }

  } catch(e) {
    toast(e.message, 'error');
    setBtn('sub-next-btn', 'გადახდაზე გადასვლა →', false);
    return;
  }

  setBtn('sub-next-btn', 'გადახდაზე გადასვლა →', false);
}

function subPrevStep() {
  document.getElementById('sub-step-2').classList.remove('active');
  document.getElementById('sub-step-1').classList.add('active');
}
