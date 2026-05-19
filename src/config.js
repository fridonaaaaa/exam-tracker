module.exports = {
  MONGO_URI: process.env.MONGO_URI || 'mongodb+srv://examtracker8_db_user:wYUxSDaWgtlCL2eg@exam-teacker.jwoyij7.mongodb.net/?retryWrites=true&w=majority&appName=exam-teacker',
  BOG_API_KEY: process.env.BOG_API_KEY || 'YOUR_BOG_API_KEY',
  BOG_SECRET: process.env.BOG_SECRET || 'YOUR_BOG_SECRET',
  BOG_SHOP_ID: process.env.BOG_SHOP_ID || 'YOUR_SHOP_ID',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  ADMIN_ID: process.env.ADMIN_PERSONAL_ID || '00000000000',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin1234',
  SUBSCRIPTION_PRICE: 10,
};
