// ─── Tracking ─────────────────────────────────────────────────────────────────

function autoStartTracking() {
  if (trackInterval) return;
  startTracking();
}

async function startTracking() {
  if (trackInterval) return;
  document.getElementById('slot-alert').classList.remove('show');
  checkHistory = [];
  document.getElementById('hist-card').style.display = 'none';

  await doCheckSlots();

  trackInterval = setInterval(doCheckSlots, CHECK_SEC * 1000);
  nextCheckIn = CHECK_SEC;
  startProgressBar();

  countdownInterval = setInterval(function() {
    nextCheckIn--;
    const el = document.getElementById('trk-next');
    if (el) el.textContent = nextCheckIn > 0 ? 'მომდევნო: ' + nextCheckIn + 'წმ-ში' : 'შემოწმება...';
    if (nextCheckIn <= 0) nextCheckIn = CHECK_SEC;
  }, 1000);
}

function stopTracking() {
  clearInterval(trackInterval);
  clearInterval(countdownInterval);
  clearInterval(progressInterval);
  trackInterval = null;
  const bar = document.getElementById('prog-bar');
  if (bar) bar.style.width = '0%';
}

function startProgressBar() {
  let elapsed = 0;
  clearInterval(progressInterval);
  const bar = document.getElementById('prog-bar');
  if (bar) bar.style.width = '0%';
  progressInterval = setInterval(function() {
    elapsed++;
    if (bar) bar.style.width = Math.min(100, (elapsed / CHECK_SEC) * 100) + '%';
    if (elapsed >= CHECK_SEC) elapsed = 0;
  }, 1000);
}

async function doCheckSlots() {
  const u = currentUser;
  if (!u || !u.preferences) return;
  const p = u.preferences;
  const catCode = p.categoryCode || '4';

  try {
    const data = await api('/api/all-slots?categoryCode=' + catCode);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ka-GE');

    const cityFilter = p.city;
    const dateFilter = p.earliestDate ? new Date(p.earliestDate) : null;

    let found = [];
    if (data.centers) {
      const filtered = data.centers.filter(function(c) { return !cityFilter || c.center.includes(cityFilter); });
      filtered.forEach(function(c) {
        let dates = c.availableDates || [];
        if (dateFilter) {
          dates = dates.filter(function(d) {
            const raw = d.bookingDate || d.examDate || d.date;
            if (!raw) return true;
            return new Date(raw) >= dateFilter;
          });
        }
        if (dates.length > 0) {
          found.push({ center: c.center, dates: dates });
        }
      });
    }

    const hasSlots = found.length > 0;
    document.getElementById('trk-last').textContent = 'ბოლო შემოწმება: ' + timeStr;
    document.getElementById('trk-since').textContent = 'ბოლო შემოწმება: ' + timeStr;

    addHistory(hasSlots, found.reduce(function(s, c) { return s + c.dates.length; }, 0), timeStr);

    if (hasSlots) {
      showSlotAlert(found);
      playBeep();
      if (Notification.permission === 'granted') {
        const total = found.reduce(function(s, c) { return s + c.dates.length; }, 0);
        new Notification('🚗 გამოცდის ადგილი!', { body: total + ' ადგილი ხელმისაწვდომია!' });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    } else {
      document.getElementById('slot-alert').classList.remove('show');
    }
  } catch(e) {
    if (e.code === 'SUBSCRIPTION_REQUIRED') {
      stopTracking();
      currentUser.subscriptionActive = false;
      renderUserView();
    }
    const el = document.getElementById('trk-since');
    if (el) el.textContent = 'შეცდომა: ' + e.message;
  }
}

function showSlotAlert(found) {
  const card = document.getElementById('slot-alert');
  const chips = document.getElementById('slot-chips');
  const total = found.reduce(function(s, c) { return s + c.dates.length; }, 0);
  document.getElementById('slot-alert-sub').textContent = 'სულ ' + total + ' ადგილი ხელმისაწვდომია';
  chips.innerHTML = found.flatMap(function(c) {
    return c.dates.slice(0, 4).map(function(d) {
      const ds = d.bookingDate || d.examDate || d.date || '';
      return '<span class="slot-chip">📍 ' + c.center.split(' ')[0] + ': ' + ds + '</span>';
    });
  }).join('');
  card.classList.add('show');
}

function addHistory(found, count, timeStr) {
  checkHistory.unshift({ found: found, count: count, timeStr: timeStr });
  if (checkHistory.length > 15) checkHistory.pop();
  const card = document.getElementById('hist-card');
  const list = document.getElementById('hist-list');
  if (!card || !list) return;
  card.style.display = 'block';
  list.innerHTML = checkHistory.map(function(h) {
    return '<div class="h-row ' + (h.found ? 'found' : '') + '">' +
      '<span class="h-time">' + h.timeStr + '</span>' +
      '<span>' + (h.found ? '✅ ' + h.count + ' ადგილი გამოჩნდა' : '❌ ადგილი არ არის') + '</span>' +
      '</div>';
  }).join('');
}

function playBeep() {
  try {
    const ctx = new AudioContext();
    [0, 0.2, 0.4].forEach(function(off) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.3, ctx.currentTime + off);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + off + 0.18);
      o.start(ctx.currentTime + off);
      o.stop(ctx.currentTime + off + 0.18);
    });
  } catch {}
}
