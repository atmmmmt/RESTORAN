/* Stale-While-Revalidate cache — data from localStorage instantly,
   then fetches fresh in background and updates state. */

const VERSION = 'v1'

function key(name) { return `aj_cache_${VERSION}_${name}` }

export function readCache(name) {
  try {
    const raw = localStorage.getItem(key(name))
    if (!raw) return null
    const { data, ts, ttl } = JSON.parse(raw)
    if (Date.now() - ts > ttl) return null
    return data
  } catch {
    return null
  }
}

export function writeCache(name, data, ttl = 5 * 60 * 1000) {
  try {
    localStorage.setItem(key(name), JSON.stringify({ data, ts: Date.now(), ttl }))
  } catch {
    /* storage full — ignore */
  }
}

/* Returns { data, stale } and revalidates in background.
   onUpdate(freshData) is called when fresh data arrives. */
export async function swr(name, fetcher, { ttl = 5 * 60 * 1000, onUpdate } = {}) {
  const cached = readCache(name)

  if (cached) {
    /* Serve stale immediately, revalidate in background */
    Promise.resolve().then(async () => {
      try {
        const fresh = await fetcher()
        writeCache(name, fresh, ttl)
        if (onUpdate) onUpdate(fresh)
      } catch { /* network error — keep stale */ }
    })
    return { data: cached, stale: true }
  }

  /* No cache — must wait for network */
  const fresh = await fetcher()
  writeCache(name, fresh, ttl)
  return { data: fresh, stale: false }
}
