const crypto = require('crypto');
const { getDb } = require('../db');
const CONFIG = require('../config');

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function register(req, res) {
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

    const db = getDb();
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
}

async function login(req, res) {
  try {
    const { personalId, password } = req.body;
    if (!personalId || !password) return res.status(400).json({ error: 'შეავსეთ ყველა ველი' });

    const db = getDb();
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
}

async function logout(req, res) {
  await getDb().collection('sessions').deleteOne({ token: req.token });
  res.json({ ok: true });
}

function me(req, res) {
  const u = req.user;
  res.json({
    personalId: u.personalId,
    fullName: u.fullName,
    phone: u.phone,
    subscriptionActive: u.subscriptionActive,
    subscriptionExpiry: u.subscriptionExpiry,
    isAdmin: u.personalId === CONFIG.ADMIN_ID,
    preferences: u.preferences || null,
  });
}

async function updatePreferences(req, res) {
  try {
    const { earliestDate, city, category, categoryCode } = req.body;
    if (!earliestDate || !city || !category) {
      return res.status(400).json({ error: 'შეავსეთ ყველა ველი' });
    }
    await getDb().collection('users').updateOne(
      { personalId: req.personalId },
      { $set: { preferences: { earliestDate, city, category, categoryCode: categoryCode || '4' } } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Preferences error:', err.message);
    res.status(500).json({ error: 'სერვერის შეცდომა' });
  }
}

module.exports = { register, login, logout, me, updatePreferences };
