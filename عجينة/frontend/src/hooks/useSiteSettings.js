import { useEffect, useState } from 'react'
import { tenantHeader } from '../services/api'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'

/**
 * Public site settings (WhatsApp number, Instagram link, …), fetched once per
 * page load and shared by every component that asks — the footer, the
 * WhatsApp buttons and the coming-soon page would otherwise each make their
 * own request for the same document.
 */
let cached  = null
let pending = null

export function loadSiteSettings() {
  pending ||= fetch(`${API_URL}/site-settings`, { headers: tenantHeader })
    .then(r => r.json())
    .then(d => (cached = d?.settings || {}))
    .catch(() => ({}))
  return pending
}

export function useSiteSettings() {
  const [settings, setSettings] = useState(cached || {})

  useEffect(() => {
    if (cached) return
    let alive = true
    loadSiteSettings().then(s => { if (alive) setSettings(s) })
    return () => { alive = false }
  }, [])

  return settings
}
