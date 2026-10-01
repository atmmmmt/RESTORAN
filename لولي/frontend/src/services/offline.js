/**
 * Offline layer for the dashboard.
 *
 * Two halves:
 *  • a read cache — the last successful GET per URL, replayed when the
 *    network is gone so pages still render real data instead of blanking out;
 *  • a write queue — mutations made while offline are parked in IndexedDB and
 *    replayed in order once the connection returns.
 *
 * Both live in IndexedDB rather than localStorage because a busy shift can
 * produce more data than the 5 MB localStorage ceiling allows.
 */

const DB_NAME    = 'loliz-offline'
const DB_VERSION = 1
const STORE_QUEUE = 'queue'
const STORE_CACHE = 'cache'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB غير مدعوم'))

    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })

  return dbPromise
}

function tx(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const objectStore = transaction.objectStore(store)
    const request = fn(objectStore)
    transaction.oncomplete = () => resolve(request?.result)
    transaction.onerror    = () => reject(transaction.error)
    transaction.onabort    = () => reject(transaction.error)
  }))
}

/* ── Read cache ─────────────────────────────────────────── */

/* Deliberately excludes baseURL. Keying on it means every cached read is
   lost the moment the API host changes (dev → prod, or a config edit), which
   is exactly when the cache is most wanted. Path + params identify a
   resource well enough within one app. */
const cacheKey = config => {
  const params = config.params ? JSON.stringify(config.params) : ''
  return `${config.url}${params}`
}

export async function cacheResponse(config, data) {
  try {
    await tx(STORE_CACHE, 'readwrite', s => s.put({ key: cacheKey(config), data, at: Date.now() }))
  } catch { /* cache is a nicety, never fatal */ }
}

export async function readCache(config) {
  try {
    const row = await tx(STORE_CACHE, 'readonly', s => s.get(cacheKey(config)))
    return row || null
  } catch {
    return null
  }
}

export async function clearCache() {
  try { await tx(STORE_CACHE, 'readwrite', s => s.clear()) } catch { /* noop */ }
}

/* ── Write queue ────────────────────────────────────────── */

export async function enqueue(config) {
  const entry = {
    method:  (config.method || 'post').toLowerCase(),
    url:     config.url,
    baseURL: config.baseURL,
    params:  config.params || null,
    data:    config.data ? safeParse(config.data) : null,
    at:      Date.now(),
  }
  await tx(STORE_QUEUE, 'readwrite', s => s.add(entry))
  notify()
  return entry
}

function safeParse(data) {
  if (typeof data !== 'string') return data
  try { return JSON.parse(data) } catch { return data }
}

export async function queuedItems() {
  try {
    return (await tx(STORE_QUEUE, 'readonly', s => s.getAll())) || []
  } catch {
    return []
  }
}

export async function queueSize() {
  return (await queuedItems()).length
}

async function removeItem(id) {
  await tx(STORE_QUEUE, 'readwrite', s => s.delete(id))
}

/* A drain must never overlap itself. Two concurrent drains replay the same
   entry twice, and for a cash entry that means the money is recorded twice.
   The `online` event and the on-load drain can easily fire together. */
let draining = false

/** Header that marks a replay, so the interceptor never re-queues it. */
export const REPLAY_HEADER = 'X-Replayed-Offline'

/**
 * Replay every queued mutation, oldest first.
 *
 * A request that fails for a *server* reason (4xx) is dropped — retrying it
 * would fail forever. A network failure stops the drain so ordering holds and
 * the entry survives for the next reconnect.
 */
export async function flushQueue(client) {
  if (draining) return { sent: 0, failed: 0, skipped: true }
  draining = true

  try {
    const items = (await queuedItems()).sort((a, b) => a.at - b.at)
    if (!items.length) return { sent: 0, failed: 0 }

    let sent = 0, failed = 0

    for (const item of items) {
      try {
        await client.request({
          method: item.method,
          url:    item.url,
          params: item.params || undefined,
          data:   item.data || undefined,
          headers: { [REPLAY_HEADER]: '1' },
        })
        await removeItem(item.id)
        sent++
      } catch (err) {
        const status = err?.response?.status
        if (status && status >= 400 && status < 500) {
          // The server rejected it on its merits — keeping it would block the queue.
          await removeItem(item.id)
          failed++
        } else {
          break   // still offline / server down — try again on the next reconnect
        }
      }
    }

    notify()
    return { sent, failed }
  } finally {
    draining = false
  }
}

/* ── Subscribers (for the status pill in the layout) ────── */

const listeners = new Set()

export function onQueueChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

async function notify() {
  const size = await queueSize()
  for (const fn of listeners) {
    try { fn(size) } catch { /* a broken listener must not stop the rest */ }
  }
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** Distinguish "no network" from "server said no". */
export const isNetworkError = err => !err?.response && err?.code !== 'ERR_CANCELED'
