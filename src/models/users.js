const crypto = require('crypto');
const { getDb } = require('../db');
const CONFIG = require('../config');

async function seedAdmin() {
  const passwordHash = crypto.createHash('sha256').update(CONFIG.ADMIN_PASSWORD).digest('hex');
  await getDb().collection('users').updateOne(
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

module.exports = { seedAdmin };
