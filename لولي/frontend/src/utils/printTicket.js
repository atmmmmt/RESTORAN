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

const AGENT_URL = 'http://localhost:9123'
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

async function viaAgent(body) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(`${AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const data = await res.json().catch(() => ({}))
    return { reached: true, ok: res.ok && data.success, message: data.message }
  } catch {
    return { reached: false } // program not running on this device
  } finally {
    clearTimeout(timer)
  }
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

  try {
    const r = await printerAPI.print(station, { width, height, data, ...(target ? { ip, port } : {}) })
    return r.data.message
  } catch (e) {
    throw new Error(`${e.message || 'تعذّرت الطباعة'} — تأكد إن «برنامج الطباعة» شغّال على هاد الجهاز`)
  }
}
