const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
// In production, restrict to your domain:
//   app.use(cors({ origin: 'https://yourdomain.com' }));
// For development keep it open:
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory DB (replace with real DB in production) ─────────────────────
const db = {
  users: new Map(),    // personalId -> user object
  sessions: new Map(), // sessionToken -> personalId
};

// ─── Config ──────────────────────────────────────────────────────────────────
const CONFIG = {
  BOG_API_KEY: process.env.BOG_API_KEY || 'YOUR_BOG_API_KEY',
  BOG_SECRET: process.env.BOG_SECRET || 'YOUR_BOG_SECRET',
  BOG_SHOP_ID: process.env.BOG_SHOP_ID || 'YOUR_SHOP_ID',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  ADMIN_ID: process.env.ADMIN_PERSONAL_ID || '00000000000',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'ADMIN',
  SUBSCRIPTION_PRICE: 10,
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

/** Generate a cryptographically random session token. */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Middleware: verifies Bearer token, attaches req.user and req.personalId.
 */
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

/**
 * Middleware: ensures user has an active, non-expired subscription.
 * Admin always bypasses this check.
 */
function requireSubscription(req, res, next) {
  if (req.personalId === CONFIG.ADMIN_ID) return next();
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

// ─── Auth routes ──────────────────────────────────────────────────────────────

/** Register a new user. Admin personalId bypasses 11-digit format check. */
app.post('/api/auth/register', (req, res) => {
  const { personalId, password, fullName, phone } = req.body;

  if (!personalId || !password || !fullName) {
    return res.status(400).json({ error: 'შეავსეთ ყველა სავალდებულო ველი' });
  }
  if (personalId !== CONFIG.ADMIN_ID && !/^\d{11}$/.test(personalId)) {
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
    lastPaymentId: null,
  };
  db.users.set(personalId, user);

  const token = generateToken();
  db.sessions.set(token, personalId);

  res.json({
    token,
    user: { personalId, fullName, subscriptionActive: false, isAdmin: personalId === CONFIG.ADMIN_ID }
  });
});

/** Authenticate existing user, return session token. */
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
      isAdmin: personalId === CONFIG.ADMIN_ID,
    }
  });
});

/** Invalidate current session token. */
app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  db.sessions.delete(token);
  res.json({ ok: true });
});

/** Return current user profile. */
app.get('/api/auth/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    personalId: u.personalId,
    fullName: u.fullName,
    phone: u.phone,
    subscriptionActive: u.subscriptionActive,
    subscriptionExpiry: u.subscriptionExpiry,
    isAdmin: u.personalId === CONFIG.ADMIN_ID,
  });
});

// ─── BOG Payment ──────────────────────────────────────────────────────────────

/** Initiate a BOG payment order for subscription purchase. */
app.post('/api/payment/create', requireAuth, async (req, res) => {
  const orderId = `SUB-${req.personalId}-${Date.now()}`;
  try {
    const tokenRes = await bogRequest('POST', '/auth/token', null, { grant_type: 'client_credentials' }, true);

    if (!tokenRes.access_token) {
      return res.json({
        demoMode: true,
        orderId,
        message: 'BOG_NOT_CONFIGURED',
        manualPaymentInfo: {
          bankAccount: 'GE00BG0000000000000000',
          amount: '10.00 GEL',
          reference: orderId,
          note: 'BOG API გასაღები არ არის დაყენებული. მიუთითეთ reference-ი გადახდისას.'
        }
      });
    }

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
      metadata: { order_id: orderId, personal_id: req.personalId }
    });

    req.user.lastPaymentId = order.id;
    res.json({ redirectUrl: order._links?.redirect?.href, orderId: order.id });

  } catch (err) {
    console.error('BOG payment error:', err.message);
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

/** BOG payment webhook callback — activates subscription on successful payment. */
app.post('/api/payment/callback', express.json(), async (req, res) => {
  res.json({ ok: true });
  const { order_id, status, metadata } = req.body;

  if (status === 'completed' && metadata?.personal_id) {
    const user = db.users.get(metadata.personal_id);
    if (user) {
      user.subscriptionActive = true;
      user.subscriptionExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      user.lastPaymentId = order_id;
    }
  }
});

// ─── Admin routes ─────────────────────────────────────────────────────────────

/** Admin: list all registered users. */
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
      createdAt: u.createdAt,
    });
  }
  res.json(users);
});

/** Admin: manually activate a user's subscription for N days. */
app.post('/api/admin/activate', requireAuth, (req, res) => {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  const { personalId, days } = req.body;
  const user = db.users.get(personalId);
  if (!user) return res.status(404).json({ error: 'მომხმარებელი ვერ მოიძებნა' });

  user.subscriptionActive = true;
  user.subscriptionExpiry = new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000).toISOString();
  res.json({ ok: true, expiry: user.subscriptionExpiry });
});

/** Admin: deactivate a user's subscription immediately. */
app.post('/api/admin/deactivate', requireAuth, (req, res) => {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  const { personalId } = req.body;
  const user = db.users.get(personalId);
  if (!user) return res.status(404).json({ error: 'მომხმარებელი ვერ მოიძებნა' });

  user.subscriptionActive = false;
  user.subscriptionExpiry = null;
  res.json({ ok: true });
});

// ─── Health check ─────────────────────────────────────────────────────────────

/** Public health endpoint — useful for uptime monitoring. */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    users: db.users.size,
    sessions: db.sessions.size,
    timestamp: new Date().toISOString(),
  });
});

// ─── BOG API helper ───────────────────────────────────────────────────────────

/**
 * Make an HTTPS request to the BOG payment API.
 * @param {string} method - HTTP method
 * @param {string} path - API path
 * @param {string|null} accessToken - Bearer token (null for auth requests)
 * @param {object} body - Request body
 * @param {boolean} isAuth - Whether this is a Basic-auth token request
 */
function bogRequest(method, path, accessToken, body, isAuth = false) {
  return new Promise((resolve, reject) => {
    const bodyStr = isAuth ? new URLSearchParams(body).toString() : JSON.stringify(body);
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
        try { resolve(JSON.parse(data)); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ─── Exam API (protected) ─────────────────────────────────────────────────────

/** Fetch available exam centers for a given category. */
app.get('/api/centers', requireAuth, requireSubscription, async (req, res) => {
  try {
    const categoryCode = req.query.categoryCode || 4;
    const response = await fetch(
      `${BASE_URL}/DrivingLicenseExamsCenters2?CategoryCode=${categoryCode}`,
      { headers: EXAM_HEADERS }
    );
    res.json(await response.json());
  } catch (err) {
    console.error('Centers fetch error:', err.message);
    res.json({ error: 'გარე სერვისი მიუწვდომელია', centers: [] });
  }
});

/** Fetch all available exam slots across all centers for a category. */
app.get('/api/all-slots', requireAuth, requireSubscription, async (req, res) => {
  try {
    const categoryCode = req.query.categoryCode || 4;
    const centersRes = await fetch(
      `${BASE_URL}/DrivingLicenseExamsCenters2?CategoryCode=${categoryCode}`,
      { headers: EXAM_HEADERS }
    );
    const centers = await centersRes.json();

    if (!Array.isArray(centers)) {
      return res.json({ error: 'გარე სერვისი მიუწვდომელია', centers: [], hasSlots: false, totalAvailable: 0 });
    }

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
    res.json({
      timestamp: new Date().toISOString(),
      totalAvailable: available.reduce((sum, r) => sum + r.availableDates.length, 0),
      centers: results,
      hasSlots: available.length > 0,
    });
  } catch (err) {
    console.error('All-slots fetch error:', err.message);
    res.json({ error: 'გარე სერვისი მიუწვდომელია', centers: [], hasSlots: false, totalAvailable: 0 });
  }
});

// ─── Seed default admin account ──────────────────────────────────────────────
function seedAdmin() {
  const passwordHash = crypto.createHash('sha256').update(CONFIG.ADMIN_PASSWORD).digest('hex');
  if (!db.users.has(CONFIG.ADMIN_ID)) {
    db.users.set(CONFIG.ADMIN_ID, {
      personalId: CONFIG.ADMIN_ID,
      passwordHash,
      fullName: 'Admin',
      phone: '',
      createdAt: new Date().toISOString(),
      subscriptionActive: true,
      subscriptionExpiry: null,
      lastPaymentId: null,
    });
    console.log(`Admin seeded — ID: ${CONFIG.ADMIN_ID}  password: ${CONFIG.ADMIN_PASSWORD}`);
  } else {
    // Always keep password in sync in case env changed
    db.users.get(CONFIG.ADMIN_ID).passwordHash = passwordHash;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  seedAdmin();
  console.log(`Server running on http://localhost:${PORT}`);
});
