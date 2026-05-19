const { getDb } = require('../db');
const CONFIG = require('../config');

async function getUsers(req, res) {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  const users = await getDb().collection('users')
    .find({}, { projection: { passwordHash: 0, _id: 0 } })
    .toArray();
  res.json(users);
}

async function activateUser(req, res) {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  const { personalId, days } = req.body;

  const expiry = new Date(Date.now() + (days || 30) * 24 * 60 * 60 * 1000).toISOString();
  const result = await getDb().collection('users').updateOne(
    { personalId },
    { $set: { subscriptionActive: true, subscriptionExpiry: expiry } }
  );
  if (result.matchedCount === 0) return res.status(404).json({ error: 'მომხმარებელი ვერ მოიძებნა' });
  res.json({ ok: true, expiry });
}

async function deactivateUser(req, res) {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  const { personalId } = req.body;

  const result = await getDb().collection('users').updateOne(
    { personalId },
    { $set: { subscriptionActive: false, subscriptionExpiry: null } }
  );
  if (result.matchedCount === 0) return res.status(404).json({ error: 'მომხმარებელი ვერ მოიძებნა' });
  res.json({ ok: true });
}

async function getSlotEvents(req, res) {
  if (req.personalId !== CONFIG.ADMIN_ID) return res.status(403).json({ error: 'არ გაქვთ წვდომა' });
  try {
    const events = await getDb().collection('slotEvents')
      .find({})
      .sort({ timestamp: -1 })
      .limit(200)
      .toArray();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: 'სერვერის შეცდომა' });
  }
}

module.exports = { getUsers, activateUser, deactivateUser, getSlotEvents };
