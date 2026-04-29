# 🚗 გამოცდის ტრეკერი v2.0

Georgian Driving License Exam Slot Tracker with Auth, Subscriptions & Telegram Alerts.

## Features
- 🔐 Auth with Georgian personal ID (პირადი ნომერი)
- 💳 10 GEL/month subscription via BOG payment
- 📱 Telegram account linking & instant alerts
- 🔍 Auto-check every 60 seconds
- 📋 All categories: B auto, B manual, C, D, A

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Set up Telegram Webhook
After deploying, run this once to register your webhook:
```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -d "url=https://your-app.railway.app/webhook/telegram"
```

### 4. Run locally
```bash
npm run dev
```

### 5. Deploy to Railway
```bash
# Push to GitHub, then connect repo to Railway
# Set environment variables in Railway dashboard
```

---

## BOG Payment Setup

1. Register at https://developers.bog.ge
2. Create a shop and get your API Key + Secret
3. Add callback URL: `https://your-app.railway.app/api/payment/callback`
4. Set `BOG_API_KEY`, `BOG_SECRET`, `BOG_SHOP_ID` in your `.env`

**Without BOG credentials**, the app automatically falls back to **manual bank transfer mode** — users see your bank account details and you activate their subscription manually from the admin panel.

---

## Admin Panel

Login with the personal ID set in `ADMIN_PERSONAL_ID`.

**Manually activate a subscription:**
```bash
curl -X POST https://your-app.railway.app/api/admin/activate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"personalId": "USER_PERSONAL_ID", "days": 30}'
```

**List all users:**
```bash
curl https://your-app.railway.app/api/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## Production Notes

⚠️ The current version uses **in-memory storage** — data resets on server restart.

For production, replace `db` in `server.js` with a real database:
- **SQLite** — simple, single file, free
- **PostgreSQL** — Railway provides free PostgreSQL
- **MongoDB Atlas** — free tier available

---

## File Structure
```
exam-tracker/
├── server.js          # Express server, auth, Telegram, BOG payment
├── public/
│   └── index.html     # Full frontend (login, register, tracker, account)
├── package.json
├── .env.example
└── README.md
```
