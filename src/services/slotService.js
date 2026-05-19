const { getDb } = require('../db');

const slotStateCache = {};

async function trackSlotChanges(data, categoryCode) {
  if (!data.centers) return;

  const db = getDb();
  const prev = slotStateCache[categoryCode] || {};
  const curr = {};
  const eventsToLog = [];

  for (const c of data.centers) {
    const dates = c.availableDates
      .map(d => d.bookingDate || d.examDate || d.date || JSON.stringify(d))
      .filter(Boolean);
    curr[c.center] = dates;
    const prevDates = prev[c.center] || [];
    const prevSet = new Set(prevDates);
    const currSet = new Set(dates);
    for (const d of currSet) {
      if (!prevSet.has(d)) eventsToLog.push({ type: 'opened', center: c.center, slotDate: d });
    }
    for (const d of prevSet) {
      if (!currSet.has(d)) eventsToLog.push({ type: 'booked', center: c.center, slotDate: d });
    }
  }

  slotStateCache[categoryCode] = curr;

  if (eventsToLog.length > 0) {
    await db.collection('slotEvents').insertMany(
      eventsToLog.map(e => ({ ...e, categoryCode, timestamp: new Date() }))
    );
  }
}

module.exports = { trackSlotChanges };
