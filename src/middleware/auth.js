const { getDb } = require('../db');
const CONFIG = require('../config');

async function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'გაიარეთ ავტორიზაცია' });

  const db = getDb();
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
    await getDb().collection('users').updateOne(
      { personalId: req.personalId },
      { $set: { subscriptionActive: false } }
    );
    return res.status(403).json({ error: 'გამოწერა ამოიწურა', code: 'SUBSCRIPTION_EXPIRED' });
  }
  next();
}

module.exports = { requireAuth, requireSubscription };
