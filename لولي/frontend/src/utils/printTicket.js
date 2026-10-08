/**
 * Luliz printing — browser never talks to localhost.
 *
 * Flow:
 * dashboard -> HTTPS backend print queue -> Luliz Print Agent on cashier laptop
 * -> printer IP:9100.
 */
import { printerAPI } from '../services/api'

const STATION_LABEL = { cashier: 'الكاشير', kitchen: 'المطبخ' }
const PRINT_DEVICE_ID = 'luliz-main'

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

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function submitPrintJob(payload) {
  const queued = await printerAPI.queuePrintJob({
    deviceId: PRINT_DEVICE_ID,
    payload,
  })

  const jobId = queued?.data?.jobId
  if (!jobId) throw new Error('تعذّر إنشاء مهمة الطباعة')

  for (let i = 0; i < 30; i++) {
    await wait(400)

    const status = await printerAPI.getPrintJob(jobId)
    const job = status?.data?.job

    if (job?.status === 'done') return job.result || {}

    if (job?.status === 'failed') {
      throw new Error(job?.result?.message || 'فشلت الطباعة على جهاز لوليز')
    }
  }

  throw new Error('برنامج طباعة لوليز لم يستلم المهمة خلال 12 ثانية — تأكد أن Luliz Print Agent مفتوح على اللابتوب')
}

export async function testLocalPrinter(station = 'cashier') {
  const s = await getPrinterSettings({ refresh: true })

  if (!s[`${station}Enabled`]) {
    throw new Error(`طابعة ${STATION_LABEL[station]} غير مفعّلة`)
  }

  const ip = s[`${station}Ip`]
  const port = s[`${station}Port`] || 9100

  if (!ip) throw new Error(`لم يُضبط عنوان طابعة ${STATION_LABEL[station]}`)

  const result = await submitPrintJob({
    op: 'probe',
    ip,
    port,
  })

  return {
    success: true,
    open: result.open === true,
    message: result.message || (result.open ? 'الطابعة متصلة وجاهزة ✓' : 'الطابعة غير متصلة'),
  }
}

/**
 * @param station 'cashier' | 'kitchen'
 * @param raster  { width, height, data }
 * @param target  optional { ip, port } for setup test
 */
export async function printToStation(station, raster, target) {
  const { width, height, data } = raster

  let ip = target?.ip
  let port = target?.port

  if (!ip) {
    const s = await getPrinterSettings()

    if (!s[`${station}Enabled`]) {
      throw new Error(`طابعة ${STATION_LABEL[station]} غير مفعّلة من الإعدادات`)
    }

    ip = s[`${station}Ip`]
    port = s[`${station}Port`]
  }

  if (!ip) throw new Error(`لم يُضبط عنوان طابعة ${STATION_LABEL[station]}`)

  const result = await submitPrintJob({
    op: 'print',
    ip,
    port: port || 9100,
    width,
    height,
    data,
  })

  return result.message || `أُرسلت فاتورة ${STATION_LABEL[station]} ✓`
}
