const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory DB (replace with real DB in production) ─────────────────────
const db = {
  users: new Map(),       // personalId -> user object
  sessions: new Map(),    // sessionToken -> personalId
  telegramLinks: new Map(), // linkCode -> personalId (pending telegram links)
};

// ─── Config (set these in environment variables) ────────────────────────────
const CONFIG = {
  BOT_TOKEN: process.env.BOT_TOKEN || '8510380755:AAEE21aieG5V3oeiW_9ckNJqP5twqhYvhbU',
  BOG_API_KEY: process.env.BOG_API_KEY || 'YOUR_BOG_API_KEY',
  BOG_SECRET: process.env.BOG_SECRET || 'YOUR_BOG_SECRET',
  BOG_SHOP_ID: process.env.BOG_SHOP_ID || 'YOUR_SHOP_ID',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  ADMIN_ID: process.env.ADMIN_PERSONAL_ID || 'ADMIN',
  SUBSCRIPTION_PRICE: 10, // GEL
  CHECK_INTERVAL_MS: 60000,
};

// ─── Exam API ────────────────────────────────────────────────────────────────
const BASE_URL = 'https://api-bookings.sa.gov.ge/api/v1/DrivingLicensePracticalExams2';
const EXAM_HEADERS = {
  'Origin': 'https://my.sa.gov.ge',
  'Referer': 'https://my.sa.gov.ge/',
  'Accept': 'application/json',
  'Accept-Language': 'ka',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'გაიარეთ ავტორიზაცია' });
  const personalId = db.sessions.get(token);
  if (!personalId) return res.status(401).json({ error: 'სესია ამოიწურა' });
  const user = db.users.get(personalId);
  if (!user) return res.status(401).json({ error: 'მომხმარებელი ვერ მოიძებნა' });
  req.user = user;
  req.personalId = personalId;
  next();
}

function requireSubscription(req, res, next) {
  if (!req.user.subscriptionActive) {
    return res.status(403).json({ error: 'გამოწერა საჭიროა', code: 'SUBSCRIPTION_REQUIRED' });
  }
  const expiry = req.user.subscriptionExpiry;
  if (expiry && new Date(expiry) < new Date()) {
    req.user.subscriptionActive = false;
    return res.status(403).json({ error: 'გამოწერა ამოიწურა', code: 'SUBSCRIPTION_EXPIRED' });
  }
  next();
}

// ─── Telegram helper ─────────────────────────────────────────────────────────
async function sendTelegram(chatId, message) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${CONFIG.BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', () => resolve({ ok: false }));
    req.write(body);
    req.end();
  });
}

// ─── Telegram webhook (for account linking) ──────────────────────────────────
app.post('/webhook/telegram', async (req, res) => {
  const update = req.body;
  res.json({ ok: true }); // always respond fast

  const message = update?.message;
  if (!message) return;

  const chatId = message.chat.id;
  const text = (message.text || '').trim();

  // User sends /start CODE to link account
  if (text.startsWith('/start ')) {
    const code = text.replace('/start ', '').trim();
    const personalId = db.telegramLinks.get(code);

    if (personalId) {
      const user = db.users.get(personalId);
      if (user) {
        user.telegramChatId = chatId;
        user.telegramLinked = true;
        db.telegramLinks.delete(code);
        await sendTelegram(chatId,
          `✅ <b>ანგარიში წარმატებით დაუკავშირდა!</b>\n\n` +
          `გამარჯობა! თქვენ მიიღებთ შეტყობინებებს გამოცდის ადგილების შესახებ.\n\n` +
          `🔔 როდესაც ადგილი გამოჩნდება, დაუყოვნებლივ მოგწერთ!`
        );
      }
    } else {
      await sendTelegram(chatId,
        `❌ კოდი არასწორია ან ამოიწურა.\n\nდარეგისტრირდით ჯერ: ${CONFIG.APP_URL}`
      );
    }
    return;
  }

  if (text === '/status') {
    // Check if this chat is linked to any user
    let linked = false;
    for (const [pid, user] of db.users) {
      if (user.telegramChatId === chatId) {
        const sub = user.subscriptionActive ? '✅ აქტიური' : '❌ არ არის';
        await sendTelegram(chatId, `👤 პირადი ნომერი: ${pid}\n💳 გამოწერა: ${sub}`);
        linked = true;
        break;
      }
    }
    if (!linked) await sendTelegram(chatId, `❌ ანგარიში დაკავშირებული არ არის.\n\n${CONFIG.APP_URL}`);
    return;
  }
});

// ─── Auth routes ──────────────────────────────────────────────────────────────

// Register
app.post('/api/auth/register', (req, res) => {
  const { personalId, password, fullName, phone } = req.body;

  if (!personalId || !password || !fullName) {
    return res.status(400).json({ error: 'შეავსეთ ყველა სავალდებულო ველი' });
  }
  if (!/^\d{11}$/.test(personalId)) {
    return res.status(400).json({ error: 'პირადი ნომერი უნდა იყოს 11 ციფრი' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'პაროლი მინიმუმ 6 სიმბოლო' });
  }
  if (db.users.has(personalId)) {
    return res.status(409).json({ error: 'ეს პირადი ნომერი უკვე დარეგისტრირებულია' });
  }

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  const user = {
    personalId,
    passwordHash,
    fullName,
    phone: phone || '',
    createdAt: new Date().toISOString(),
    subscriptionActive: false,
    subscriptionExpiry: null,
    telegramLinked: false,
    telegramChatId: null,
    notificationsEnabled: false,
    watchedCategories: [],
    lastPaymentId: null,
  };
  db.users.set(personalId, user);

  const token = generateToken();
  db.sessions.set(token, personalId);

  res.json({
    token,
    user: { personalId, fullName, subscriptionActive: false, telegramLinked: false }
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { personalId, password } = req.body;
  if (!personalId || !password) return res.status(400).json({ error: 'შეავსეთ ყველა ველი' });

  const user = db.users.get(personalId);
  if (!user) return res.status(401).json({ error: 'მომხმარებელი ვერ მოიძებნა' });

  const hash = crypto.createHash('sha256').update(password).digest('hex');
  if (hash !== user.passwordHash) return res.status(401).json({ error: 'პაროლი არასწორია' });

  const token = generateToken();
  db.sessions.set(token, personalId);

  res.json({
    token,
    user: {
      personalId: user.personalId,
      fullName: user.fullName,
      subscriptionActive: user.subscriptionActive,
      telegramLinked: user.telegramLinked,
    }
  });
});

// Logout
app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  db.sessions.delete(token);
  res.json({ ok: true });
});

// Get current user
app.get('/api/auth/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    personalId: u.personalId,
    fullName: u.fullName,
    phone: u.phone,
    subscriptionActive: u.subscriptionActive,
    subscriptionExpiry: u.subscriptionExpiry,
    telegramLinked: u.telegramLinked,
    notificationsEnabled: u.notificationsEnabled,
    watchedCategories: u.watchedCategories,
  });
});

// ─── Telegram link ────────────────────────────────────────────────────────────
app.post('/api/telegram/generate-link', requireAuth, async (req, res) => {
  const code = generateToken().substring(0, 16);
  db.telegramLinks.set(code, req.personalId);

  // Code expires in 10 minutes
  setTimeout(() => db.telegramLinks.delete(code), 10 * 60 * 1000);

  const botUsername = 'Gamocda_tracker_bot';
  const deepLink = `https://t.me/${botUsername}?start=${code}`;

  res.json({ code, deepLink, botUsername });
});

// Update notification preferences
app.post('/api/telegram/preferences', requireAuth, (req, res) => {
  const { enabled, categories } = req.body;
  req.user.notificationsEnabled = !!enabled;
  if (categories) req.user.watchedCategories = categories;
  res.json({ ok: true });
});

// ─── BOG Payment ──────────────────────────────────────────────────────────────

// Create BOG payment order
app.post('/api/payment/create', requireAuth, async (req, res) => {
  const orderId = `SUB-${req.personalId}-${Date.now()}`;

  // BOG payment API integration
  // Docs: https://developers.bog.ge/docs/payment
  try {
    // Step 1: Get BOG access token
    const tokenRes = await bogRequest('POST', '/auth/token', null, {
      grant_type: 'client_credentials'
    }, true);

    if (!tokenRes.access_token) {
      // If BOG not configured, return demo mode
      return res.json({
        demoMode: true,
        orderId,
        message: 'BOG_NOT_CONFIGURED',
        // For demo: admin can manually activate subscription
        manualPaymentInfo: {
          bankAccount: 'GE00BG0000000000000000',
          amount: '10.00 GEL',
          reference: orderId,
          note: 'BOG API გასაღები არ არის დაყენებული. მიუთითეთ reference-ი გადახდისას.'
        }
      });
    }

    // Step 2: Create order
    const order = await bogRequest('POST', '/ecommerce/orders', tokenRes.access_token, {
      callback_url: `${CONFIG.APP_URL}/api/payment/callback`,
      purchase_units: [{
        amount: { currency_code: 'GEL', value: CONFIG.SUBSCRIPTION_PRICE.toString() },
        description: 'გამოცდის ტრეკერი — 1 თვის გამოწერა',
      }],
      redirect_urls: {
        success: `${CONFIG.APP_URL}?payment=success`,
        fail: `${CONFIG.APP_URL}?payment=fail`,
      },
      metadata: {
        order_id: orderId,
        personal_id: req.personalId,
      }
    });

    req.user.lastPaymentId = order.id;
    res.json({ redirectUrl: order._links?.redirect?.href, orderId: order.id });

  } catch (err) {
    console.error('BOG payment error:', err.message);
    // Fallback to manual payment info
    res.json({
      demoMode: true,
      orderId,
      manualPaymentInfo: {
        bankAccount: 'GE00BG0000000000000000',
        amount: '10.00 GEL',
        reference: orderId,
        note: 'გადახდის შემდეგ ადმინი გააქტიურებს გამოწერას 24 საათის განმავლობაში.'
      }
    });
  }
});

// BOG payment callback
app.post('/api/payment/callback', express.json(), async (req, res) => {
  res.json({ ok: true });
  const { order_id, status, metadata } = req.body;

  if (status === 'completed' && metadata?.personal_id) {
    const user = db.users.get(metadata.personal_id);
    if (user) {
      user.subscriptionActive = true;
      user.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      user.lastPaymentId = order_id;

      // Notify user via Telegram
      if (user.telegramChatId) {
        await sendTelegram(user.telegramChatId,
          `✅ <b>გამოწერა გააქტიურდა!</b>\n\n` +
          `💳 გადახდა წარმატებით დასრულდა\n` +
          `📅 მოქმედებს: 30 დღე\n\n` +
          `🔍 ახლა შეგიძლიათ გამოცდის ადგილების ტრეკინგი დაიწყოთ!`
        );
      }
    }
  }
});

// Admin: manually activate subscription
app.post('/api/admin/activate', requireAuth, (req, res) => {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  const { personalId, days } = req.body;
  const user = db.users.get(personalId);
  if (!user) return res.status(404).json({ error: 'მომხმარებელი ვერ მოიძებნა' });

  user.subscriptionActive = true;
  user.subscriptionExpiry = new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000).toISOString();
  res.json({ ok: true, expiry: user.subscriptionExpiry });
});

// Admin: list all users
app.get('/api/admin/users', requireAuth, (req, res) => {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  const users = [];
  for (const [pid, u] of db.users) {
    users.push({
      personalId: pid,
      fullName: u.fullName,
      phone: u.phone,
      subscriptionActive: u.subscriptionActive,
      subscriptionExpiry: u.subscriptionExpiry,
      telegramLinked: u.telegramLinked,
      createdAt: u.createdAt,
    });
  }
  res.json(users);
});

// ─── BOG API helper ───────────────────────────────────────────────────────────
function bogRequest(method, path, accessToken, body, isAuth = false) {
  return new Promise((resolve, reject) => {
    const bodyStr = isAuth
      ? new URLSearchParams(body).toString()
      : JSON.stringify(body);

    const headers = {
      'Content-Type': isAuth ? 'application/x-www-form-urlencoded' : 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    };

    if (isAuth) {
      const creds = Buffer.from(`${CONFIG.BOG_API_KEY}:${CONFIG.BOG_SECRET}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    } else if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const req = https.request({
      hostname: 'api.bog.ge',
      path: `/payments/v1${path}`,
      method,
      headers,
    }, (response) => {
      let data = '';
      response.on('data', d => data += d);
      response.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ─── Exam API (protected) ─────────────────────────────────────────────────────
app.get('/api/centers', requireAuth, requireSubscription, async (req, res) => {
  try {
    const categoryCode = req.query.categoryCode || 4;
    const response = await fetch(
      `${BASE_URL}/DrivingLicenseExamsCenters2?CategoryCode=${categoryCode}`,
      { headers: EXAM_HEADERS }
    );
    res.json(await response.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/all-slots', requireAuth, requireSubscription, async (req, res) => {
  try {
    const categoryCode = req.query.categoryCode || 4;
    const centersRes = await fetch(
      `${BASE_URL}/DrivingLicenseExamsCenters2?CategoryCode=${categoryCode}`,
      { headers: EXAM_HEADERS }
    );
    const centers = await centersRes.json();

    const results = await Promise.all(
      centers.map(async (center) => {
        const centerId = center.serviceCenterId || center.id;
        const centerName = center.serviceCenterName || center.name;
        try {
          const datesRes = await fetch(
            `${BASE_URL}/DrivingLicenseExamsDates2?CategoryCode=${categoryCode}&CenterId=${centerId}`,
            { headers: EXAM_HEADERS }
          );
          const dates = await datesRes.json();
          return { center: centerName, centerId, availableDates: Array.isArray(dates) ? dates : [] };
        } catch {
          return { center: centerName, centerId, availableDates: [] };
        }
      })
    );

    const available = results.filter(r => r.availableDates.length > 0);
    const data = {
      timestamp: new Date().toISOString(),
      totalAvailable: available.reduce((sum, r) => sum + r.availableDates.length, 0),
      centers: results,
      hasSlots: available.length > 0,
    };

    // Send Telegram notifications to users watching this category
    if (data.hasSlots) {
      for (const [pid, user] of db.users) {
        if (
          user.subscriptionActive &&
          user.telegramLinked &&
          user.notificationsEnabled &&
          user.telegramChatId &&
          (user.watchedCategories.includes(categoryCode.toString()) || user.watchedCategories.length === 0)
        ) {
          const lines = available.map(c =>
            `📍 <b>${c.center}</b>: ${c.availableDates.length} ადგილი`
          ).join('\n');
          await sendTelegram(user.telegramChatId,
            `🚨 <b>გამოცდის ადგილი გამოჩნდა!</b>\n\n${lines}\n\n` +
            `🔗 დაჯავშნეთ: https://my.sa.gov.ge`
          );
        }
      }
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
