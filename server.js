const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { MongoClient } = require('mongodb');

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Config ──────────────────────────────────────────────────────────────────
const CONFIG = {
  MONGO_URI: process.env.MONGO_URI || 'mongodb+srv://examtracker8_db_user:wYUxSDaWgtlCL2eg@exam-teacker.jwoyij7.mongodb.net/?retryWrites=true&w=majority&appName=exam-teacker',
  BOG_API_KEY: process.env.BOG_API_KEY || 'YOUR_BOG_API_KEY',
  BOG_SECRET: process.env.BOG_SECRET || 'YOUR_BOG_SECRET',
  BOG_SHOP_ID: process.env.BOG_SHOP_ID || 'YOUR_SHOP_ID',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  ADMIN_ID: process.env.ADMIN_PERSONAL_ID || '00000000000',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'ADMIN',
  SUBSCRIPTION_PRICE: 10,
};

// ─── MongoDB connection ───────────────────────────────────────────────────────
let db;

async function connectDB() {
  const client = new MongoClient(CONFIG.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
  });
  await client.connect();
  db = client.db('examtracker');

  // Create indexes for fast lookups
  await db.collection('users').createIndex({ personalId: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 * 30 }); // 30-day session TTL

  console.log('✅ Connected to MongoDB Atlas');
}

// ─── Exam API ────────────────────────────────────────────────────────────────
const BASE_URL = 'https://api-bookings.sa.gov.ge/api/v1/DrivingLicensePracticalExams2';
const PROXY_URL = 'https://rope-regulator-prudishly.ngrok-free.dev';
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

async function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'გაიარეთ ავტორიზაცია' });

  const session = await db.collection('sessions').findOne({ token });
  if (!session) return res.status(401).json({ error: 'სესია ამოიწურა' });

  const user = await db.collection('users').findOne({ personalId: session.personalId });
  if (!user) return res.status(401).json({ error: 'მომხმარებელი ვერ მოიძებნა' });

  req.user = user;
  req.personalId = session.personalId;
  req.token = token;
  next();
}

async function requireSubscription(req, res, next) {
  if (req.personalId === CONFIG.ADMIN_ID) return next();
  if (!req.user.subscriptionActive) {
    return res.status(403).json({ error: 'გამოწერა საჭიროა', code: 'SUBSCRIPTION_REQUIRED' });
  }
  const expiry = req.user.subscriptionExpiry;
  if (expiry && new Date(expiry) < new Date()) {
    await db.collection('users').updateOne(
      { personalId: req.personalId },
      { $set: { subscriptionActive: false } }
    );
    return res.status(403).json({ error: 'გამოწერა ამოიწურა', code: 'SUBSCRIPTION_EXPIRED' });
  }
  next();
}

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
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

    const existing = await db.collection('users').findOne({ personalId });
    if (existing) {
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
    await db.collection('users').insertOne(user);

    const token = generateToken();
    await db.collection('sessions').insertOne({ token, personalId, createdAt: new Date() });

    res.json({
      token,
      user: { personalId, fullName, subscriptionActive: false, isAdmin: personalId === CONFIG.ADMIN_ID }
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'სერვერის შეცდომა' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { personalId, password } = req.body;
    if (!personalId || !password) return res.status(400).json({ error: 'შეავსეთ ყველა ველი' });

    const user = await db.collection('users').findOne({ personalId });
    if (!user) return res.status(401).json({ error: 'მომხმარებელი ვერ მოიძებნა' });

    const hash = crypto.createHash('sha256').update(password).digest('hex');
    if (hash !== user.passwordHash) return res.status(401).json({ error: 'პაროლი არასწორია' });

    const token = generateToken();
    await db.collection('sessions').insertOne({ token, personalId, createdAt: new Date() });

    res.json({
      token,
      user: {
        personalId: user.personalId,
        fullName: user.fullName,
        subscriptionActive: user.subscriptionActive,
        isAdmin: personalId === CONFIG.ADMIN_ID,
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'სერვერის შეცდომა' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await db.collection('sessions').deleteOne({ token: req.token });
  res.json({ ok: true });
});

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
          note: 'BOG API გასაღები არ არის დაყენებული.'
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

    await db.collection('users').updateOne(
      { personalId: req.personalId },
      { $set: { lastPaymentId: order.id } }
    );

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

app.post('/api/payment/callback', express.json(), async (req, res) => {
  res.json({ ok: true });
  const { order_id, status, metadata } = req.body;

  if (status === 'completed' && metadata?.personal_id) {
    await db.collection('users').updateOne(
      { personalId: metadata.personal_id },
      {
        $set: {
          subscriptionActive: true,
          subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          lastPaymentId: order_id,
        }
      }
    );
  }
});

// ─── Admin routes ─────────────────────────────────────────────────────────────

app.get('/api/admin/users', requireAuth, async (req, res) => {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  const users = await db.collection('users')
    .find({}, { projection: { passwordHash: 0, _id: 0 } })
    .toArray();
  res.json(users);
});

app.post('/api/admin/activate', requireAuth, async (req, res) => {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  const { personalId, days } = req.body;

  const expiry = new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000).toISOString();
  const result = await db.collection('users').updateOne(
    { personalId },
    { $set: { subscriptionActive: true, subscriptionExpiry: expiry } }
  );
  if (result.matchedCount === 0) return res.status(404).json({ error: 'მომხმარებელი ვერ მოიძებნა' });
  res.json({ ok: true, expiry });
});

app.post('/api/admin/deactivate', requireAuth, async (req, res) => {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  const { personalId } = req.body;

  const result = await db.collection('users').updateOne(
    { personalId },
    { $set: { subscriptionActive: false, subscriptionExpiry: null } }
  );
  if (result.matchedCount === 0) return res.status(404).json({ error: 'მომხმარებელი ვერ მოიძებნა' });
  res.json({ ok: true });
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  const userCount = await db.collection('users').countDocuments();
  const sessionCount = await db.collection('sessions').countDocuments();
  res.json({
    ok: true,
    uptime: process.uptime(),
    users: userCount,
    sessions: sessionCount,
    timestamp: new Date().toISOString(),
  });
});

// ─── BOG API helper ───────────────────────────────────────────────────────────

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

app.get('/api/all-slots', requireAuth, requireSubscription, async (req, res) => {
  try {
    const categoryCode = req.query.categoryCode || 4;
    const response = await fetch(`${PROXY_URL}/api/all-slots?categoryCode=${categoryCode}`);
    const data = await response.json();

    if (data.hasSlots) {
      const available = data.centers.filter(r => r.availableDates.length > 0);
      const users = await db.collection('users').find({
        subscriptionActive: true,
        telegramLinked: true,
        notificationsEnabled: true,
        telegramChatId: { $exists: true },
      }).toArray();

      for (const user of users) {
        if (
          user.watchedCategories?.includes(categoryCode.toString()) ||
          !user.watchedCategories?.length
        ) {
          const lines = available.map(c =>
            `📍 <b>${c.center}</b>: ${c.availableDates.length} ადგილი`
          ).join('\n');
          await sendTelegram(user.telegramChatId,
            `🚨 <b>გამოცდის ადგილი გამოჩნდა!</b>\n\n${lines}\n\n🔗 დაჯავშნეთ: https://my.sa.gov.ge`
          );
        }
      }
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'გარე სერვისი მიუწვდომელია', centers: [], hasSlots: false, totalAvailable: 0 });
  }
});

// ─── Seed admin ───────────────────────────────────────────────────────────────

async function seedAdmin() {
  const passwordHash = crypto.createHash('sha256').update(CONFIG.ADMIN_PASSWORD).digest('hex');
  await db.collection('users').updateOne(
    { personalId: CONFIG.ADMIN_ID },
    {
      $setOnInsert: {
        personalId: CONFIG.ADMIN_ID,
        fullName: 'Admin',
        phone: '',
        createdAt: new Date().toISOString(),
        subscriptionActive: true,
        subscriptionExpiry: null,
        lastPaymentId: null,
      },
      $set: { passwordHash },
    },
    { upsert: true }
  );
  console.log(`✅ Admin ready — ID: ${CONFIG.ADMIN_ID}`);
}

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

connectDB()
  .then(async () => {
    await seedAdmin();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
