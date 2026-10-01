'use strict';

const BusinessSettings = require('../models/BusinessSettings');

/**
 * The shop's working day, cut on its own opening hours instead of midnight.
 *
 * The day changes halfway through the quiet gap between closing and the next
 * opening (04:00 → 10:00 cuts at 07:00). Cutting right at closing time would
 * throw a table that paid ten minutes late into tomorrow; cutting at opening
 * would do the same to staff ringing up a breakfast order early. The middle of
 * the gap is the one moment nobody is ever selling.
 *
 * All of it is Damascus time (UTC+3, no daylight saving since 2022), whatever
 * the server's own clock is set to.
 */

const SHOP_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const toMinutes = hhmm => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return ((h || 0) * 60 + (m || 0)) % 1440;
};

/** Minutes after midnight at which one working day hands over to the next. */
function cutoffMinutes({ openingTime, closingTime }) {
  const open = toMinutes(openingTime);
  const close = toMinutes(closingTime);
  const gap = (open - close + 1440) % 1440;
  // Open round the clock: the day simply starts at opening time.
  if (gap === 0) return open;
  return (close + Math.floor(gap / 2)) % 1440;
}

let cached = null;
let cachedAt = 0;

async function getHours() {
  if (cached && Date.now() - cachedAt < 30_000) return cached;
  const doc = await BusinessSettings.getSingleton();
  cached = { openingTime: doc.openingTime, closingTime: doc.closingTime };
  cachedAt = Date.now();
  return cached;
}

/** Drop the cache after the hours are edited so the change applies at once. */
function invalidate() { cached = null; cachedAt = 0; }

/** 'YYYY-MM-DD' of the working day a moment belongs to. */
function dayKeyAt(moment, hours) {
  const cutoffMs = cutoffMinutes(hours) * 60 * 1000;
  return new Date(new Date(moment).getTime() + SHOP_OFFSET_MS - cutoffMs).toISOString().slice(0, 10);
}

/** The real instants a working day spans: [start, end). */
function rangeOfKey(dayKey, hours) {
  const cutoffMs = cutoffMinutes(hours) * 60 * 1000;
  const start = new Date(new Date(`${dayKey}T00:00:00Z`).getTime() - SHOP_OFFSET_MS + cutoffMs);
  return { day: dayKey, start, end: new Date(start.getTime() + DAY_MS) };
}

/**
 * Resolve any "which day?" input to a working day.
 * Accepts 'YYYY-MM-DD', a Date, or nothing / 'today' for the day running now.
 */
async function range(input) {
  const hours = await getHours();
  let key;
  if (typeof input === 'string' && DAY_KEY.test(input)) key = input;
  else if (input instanceof Date && !Number.isNaN(input.getTime())) key = dayKeyAt(input, hours);
  else key = dayKeyAt(new Date(), hours);
  return { ...rangeOfKey(key, hours), ...hours };
}

const current = () => range();

module.exports = {
  range, current, getHours, invalidate, dayKeyAt, rangeOfKey, cutoffMinutes, DAY_KEY, SHOP_OFFSET_MS,
};
