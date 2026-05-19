const { getDb } = require('../db');
const { trackSlotChanges } = require('../services/slotService');

const BASE_URL = 'https://api-bookings.sa.gov.ge/api/v1/DrivingLicensePracticalExams2';
const PROXY_URL = 'https://rope-regulator-prudishly.ngrok-free.dev';
const EXAM_HEADERS = {
  'Origin': 'https://my.sa.gov.ge',
  'Referer': 'https://my.sa.gov.ge/',
  'Accept': 'application/json',
  'Accept-Language': 'ka',
};

async function getCenters(req, res) {
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
}

async function getAllSlots(req, res) {
  try {
    const categoryCode = (req.query.categoryCode || 4).toString();
    const response = await fetch(`${PROXY_URL}/api/all-slots?categoryCode=${categoryCode}`);
    const data = await response.json();

    await trackSlotChanges(data, categoryCode);

    if (data.hasSlots) {
      const db = getDb();
      const available = data.centers.filter(r => r.availableDates.length > 0);
      const users = await db.collection('users').find({
        subscriptionActive: true,
        telegramLinked: true,
        notificationsEnabled: true,
        telegramChatId: { $exists: true },
      }).toArray();

      for (const user of users) {
        if (
          user.watchedCategories?.includes(categoryCode) ||
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
}

module.exports = { getCenters, getAllSlots };
