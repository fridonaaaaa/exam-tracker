const { getDb } = require('../db');

async function health(req, res) {
  const db = getDb();
  const userCount = await db.collection('users').countDocuments();
  const sessionCount = await db.collection('sessions').countDocuments();
  res.json({
    ok: true,
    uptime: process.uptime(),
    users: userCount,
    sessions: sessionCount,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { health };
