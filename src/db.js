const { MongoClient } = require('mongodb');
const CONFIG = require('./config');

let db;

async function connectDB() {
  const client = new MongoClient(CONFIG.MONGO_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
  });
  await client.connect();
  db = client.db('examtracker');

  await db.collection('users').createIndex({ personalId: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 * 30 });

  console.log('✅ Connected to MongoDB Atlas');
}

function getDb() {
  return db;
}

module.exports = { connectDB, getDb };
