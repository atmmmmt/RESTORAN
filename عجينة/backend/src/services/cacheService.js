'use strict';

/**
 * Bounded LRU + TTL in-memory cache — no external dependencies.
 *
 * Guarantees:
 *  - Never exceeds MAX_ENTRIES keys (oldest entry evicted when full).
 *  - Stale entries are removed on read (lazy expiry).
 *  - Map insertion-order is used to track LRU (delete + re-insert on get).
 */
const MAX_ENTRIES = 200;
const store = new Map(); // key → { data, expiresAt }

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  // Move to end (most-recently-used)
  store.delete(key);
  store.set(key, entry);
  return entry.data;
}

function set(key, data, ttlMs) {
  // Evict oldest entry when at capacity
  if (store.size >= MAX_ENTRIES && !store.has(key)) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

function del(key) {
  store.delete(key);
}

/** Remove every key whose name starts with `prefix` */
function invalidate(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

function flush() {
  store.clear();
}

module.exports = { get, set, del, invalidate, flush };
