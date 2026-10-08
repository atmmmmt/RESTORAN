/**
 * Sends a rendered ticket (see ticketRenderer) to a station's printer.
 *
 * Route 1 — the print program on this device (print-agent, localhost:9123).
 * This is the one that works in the shop: the live server is in the cloud and
 * can't reach a printer on the shop's network, but the cashier's own laptop can.
 *
 * Route 2 — the backend (/api/printer/print). Works when the backend itself
 * sits on the printer's network, e.g. running locally while testing.
 */
import { printerAPI } from '../services/api'

const AGENT_URLS = ['http://localhost:9123', 'http://127.0.0.1:9123']
const STATION_LABEL = { cashier: 'الكاشير', kitchen: 'المطبخ' }

let settingsCache = null

export async function getPrinterSettings({ refresh = false } = {}) {
  if (!settingsCache || refresh) {
    const r = await printerAPI.getSettings()
    settingsCache = r.data.settings || {}
  }
  return settingsCache
}

export function setPrinterSettingsCache(settings) {
  settingsCache = settings
}

async function callAgent(path, options = {}) {
  for (const base of AGENT_URLS) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3500)
    try {
      const res = await fetch(`${base}${path}`, {
        mode: 'cors',
        targetAddressSpace: 'loopback',
        cache: 'no-store',
        ...options,
        signal: ctrl.signal,
      })
      const data = await res.json().catch(() => ({}))
      return { reached: true, ok: res.ok, data }
    } catch {
      // Try the second loopback spelling.
    } finally {
      clearTimeout(timer)
    }
  }
  return { reached: false, ok: false, data: {} }
}

export async function testLocalPrinter(station = 'cashier') {
  const s = await getPrinterSettings({ refresh: true })
  if (!s[`${station}Enabled`]) throw new Error(`طابعة ${STATION_LABEL[station]} غير مفعّلة`)
  const ip = s[`${station}Ip`]
  const port = s[`${station}Port`] || 9100
  if (!ip) throw new Error(`لم يُضبط عنوان طابعة ${STATION_LABEL[station]}`)

  const health = await callAgent('/health')
  if (!health.reached || !health.ok || !health.data?.success) {
    throw new Error('برنامج طباعة لوليز شغّال على الجهاز لكن الصفحة لا تستطيع الوصول له — أغلق Chrome وافتحه بعد تشغيل start-print-agent.bat')
  }

  const probe = await callAgent('/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, port }),
  })
  if (!probe.reached || !probe.ok) throw new Error('تعذّر فحص الطابعة من برنامج الطباعة')
  return probe.data
}

async function viaAgent(body) {
  for (const base of AGENT_URLS) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4500)
    try {
      const res = await fetch(`${base}/print`, {
        method: 'POST',
        mode: 'cors',
        targetAddressSpace: 'loopback',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      const data = await res.json().catch(() => ({}))
      return { reached: true, ok: res.ok && data.success, message: data.message }
    } catch {
      // Try the other loopback spelling. Some Windows/Chrome setups treat
      // localhost and 127.0.0.1 differently.
    } finally {
      clearTimeout(timer)
    }
  }
  return { reached: false }
}

/**
 * @param station 'cashier' | 'kitchen'
 * @param raster  { width, height, data } (previewUrl is ignored)
 * @param target  optional { ip, port } — print to an unsaved address (setup test)
 */
export async function printToStation(station, raster, target) {
  const { width, height, data } = raster
  let ip = target?.ip
  let port = target?.port
  if (!ip) {
    const s = await getPrinterSettings()
    if (!s[`${station}Enabled`]) throw new Error(`طابعة ${STATION_LABEL[station]} غير مفعّلة من الإعدادات`)
    ip = s[`${station}Ip`]
    port = s[`${station}Port`]
  }
  if (!ip) throw new Error(`لم يُضبط عنوان طابعة ${STATION_LABEL[station]}`)

  const agent = await viaAgent({ ip, port: port || 9100, width, height, data })
  if (agent.reached) {
    if (!agent.ok) throw new Error(agent.message || 'تعذّرت الطباعة')
    return `أُرسلت فاتورة ${STATION_LABEL[station]} ✓`
  }

  throw new Error('برنامج طباعة لوليز غير متصل بالصفحة — شغّل start-print-agent.bat ثم أغلق Chrome وافتحه من جديد')
}
