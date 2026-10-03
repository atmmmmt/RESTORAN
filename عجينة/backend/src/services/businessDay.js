'use strict';

const BusinessSettings = require('../models/BusinessSettings');
const SalesCenter = require('../models/SalesCenter');

/**
 * Working-day helper in Damascus time.
 *
 * Head office uses BusinessSettings. A branch uses its own opening/closing
 * hours from SalesCenter. A night that crosses midnight stays one work day.
 */
const SHOP_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const toMinutes = hhmm => {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return ((h || 0) * 60 + (m || 0)) % 1440;
};

function cutoffMinutes({ openingTime, closingTime }) {
  const open = toMinutes(openingTime);
  const close = toMinutes(closingTime);
  const gap = (open - close + 1440) % 1440;
  if (gap === 0) return open;
  return (close + Math.floor(gap / 2)) % 1440;
}

const cache = new Map();
const CACHE_MS = 30_000;
const cacheKey = centerId => centerId ? String(centerId) : 'hq';

async function getHours(centerId = null) {
  const key = cacheKey(centerId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  let value;
  if (centerId) {
    const center = await SalesCenter.findById(centerId).select('openingTime closingTime');
    if (center) {
      value = {
        openingTime: center.openingTime || '10:00',
        closingTime: center.closingTime || '04:00',
      };
    }
  }

  if (!value) {
    const doc = await BusinessSettings.getSingleton();
    value = { openingTime: doc.openingTime, closingTime: doc.closingTime };
  }

  cache.set(key, { value, at: Date.now() });
  return value;
}

function invalidate(centerId = undefined) {
  if (centerId === undefined) cache.clear();
  else cache.delete(cacheKey(centerId));
}

function dayKeyAt(moment, hours) {
  const cutoffMs = cutoffMinutes(hours) * 60 * 1000;
  return new Date(new Date(moment).getTime() + SHOP_OFFSET_MS - cutoffMs).toISOString().slice(0, 10);
}

function rangeOfKey(dayKey, hours) {
  const cutoffMs = cutoffMinutes(hours) * 60 * 1000;
  const start = new Date(new Date(`${dayKey}T00:00:00Z`).getTime() - SHOP_OFFSET_MS + cutoffMs);
  return { day: dayKey, start, end: new Date(start.getTime() + DAY_MS) };
}

async function range(input, centerId = null) {
  const hours = await getHours(centerId);
  let key;
  if (typeof input === 'string' && DAY_KEY.test(input)) key = input;
  else if (input instanceof Date && !Number.isNaN(input.getTime())) key = dayKeyAt(input, hours);
  else key = dayKeyAt(new Date(), hours);
  return { ...rangeOfKey(key, hours), ...hours };
}

const current = centerId => range(undefined, centerId);

module.exports = {
  range, current, getHours, invalidate, dayKeyAt, rangeOfKey, cutoffMinutes, DAY_KEY, SHOP_OFFSET_MS,
};
