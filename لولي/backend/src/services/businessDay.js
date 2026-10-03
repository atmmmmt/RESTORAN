'use strict';

const BusinessSettings = require('../models/BusinessSettings');

const SHOP_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const toMinutes = hhmm => {
  const [h,m] = String(hhmm || '0:0').split(':').map(Number);
  return ((h || 0) * 60 + (m || 0)) % 1440;
};

function cutoffMinutes({ openingTime, closingTime }) {
  const open = toMinutes(openingTime);
  const close = toMinutes(closingTime);
  const gap = (open - close + 1440) % 1440;
  if (gap === 0) return open;
  return (close + Math.floor(gap / 2)) % 1440;
}

let cached = null;
let cachedAt = 0;
async function getHours() {
  if (cached && Date.now() - cachedAt < 30000) return cached;
  const doc = await BusinessSettings.getSingleton();
  cached = { openingTime: doc.openingTime, closingTime: doc.closingTime };
  cachedAt = Date.now();
  return cached;
}
function invalidate() { cached = null; cachedAt = 0; }

function dayKeyAt(moment, hours) {
  const cutoffMs = cutoffMinutes(hours) * 60 * 1000;
  return new Date(new Date(moment).getTime() + SHOP_OFFSET_MS - cutoffMs).toISOString().slice(0,10);
}
function rangeOfKey(dayKey, hours) {
  const cutoffMs = cutoffMinutes(hours) * 60 * 1000;
  const start = new Date(new Date(`${dayKey}T00:00:00Z`).getTime() - SHOP_OFFSET_MS + cutoffMs);
  return { day: dayKey, start, end: new Date(start.getTime() + DAY_MS) };
}
async function range(input) {
  const hours = await getHours();
  let key;
  if (typeof input === 'string' && DAY_KEY.test(input)) key = input;
  else if (input instanceof Date && !Number.isNaN(input.getTime())) key = dayKeyAt(input,hours);
  else key = dayKeyAt(new Date(),hours);
  return { ...rangeOfKey(key,hours), ...hours };
}
const current = () => range();

module.exports = { range,current,getHours,invalidate,dayKeyAt,rangeOfKey,cutoffMinutes,DAY_KEY,SHOP_OFFSET_MS };
