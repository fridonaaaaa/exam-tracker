const app = require('./src/app');
const { connectDB } = require('./src/db');
const { seedAdmin } = require('./src/models/users');

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
