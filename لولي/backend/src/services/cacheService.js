'use strict';

/**
 * Bounded LRU + TTL in-memory cache — no external dependencies.
 *
 * Guarantees:
 *  - Never exceeds MAX_ENTRIES keys (oldest entry evicted when full).
 *  - Stale entries are removed on read (lazy expiry).
 *  - Map insertion-order is used to track LRU (delete + re-insert on get).
 */
const { currentTenant } = require('../tenancy/context');

const MAX_ENTRIES = 200;
const store = new Map(); // key → { data, expiresAt }

/**
 * Two brands share this process, so a bare key like `products:public` would
 * let whichever brand asked first serve its catalogue to the other one. Every
 * key is namespaced by the calling brand instead; callers stay unaware.
 */
const scoped = key => `${currentTenant() || 'global'}:${key}`;

function get(key) {
  const entry = store.get(scoped(key));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(scoped(key));
    return null;
  }
  // Move to end (most-recently-used)
  store.delete(scoped(key));
  store.set(scoped(key), entry);
  return entry.data;
}

function set(key, data, ttlMs) {
  const k = scoped(key);
  // Evict oldest entry when at capacity
  if (store.size >= MAX_ENTRIES && !store.has(k)) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(k, { data, expiresAt: Date.now() + ttlMs });
}

function del(key) {
  store.delete(scoped(key));
}

/** Remove every key whose name starts with `prefix`, within this brand only. */
function invalidate(prefix) {
  const scopedPrefix = scoped(prefix);
  for (const key of store.keys()) {
    if (key.startsWith(scopedPrefix)) store.delete(key);
  }
}

function flush() {
  store.clear();
}

module.exports = { get, set, del, invalidate, flush };
