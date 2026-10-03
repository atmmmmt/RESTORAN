/**
 * Draws POS tickets onto a canvas and packs them to the 1-bit format the
 * backend streams to an ESC/POS thermal printer (`GS v 0` raster).
 *
 * Rendering happens here, in the browser, because canvas text shaping handles
 * Arabic joining and RTL correctly and can draw the logo — the printer itself
 * only ever receives dots.
 */
import { formatCurrency, formatShopDateTime, formatShopTime } from './formatters'

/* 80mm paper at 203dpi → 576 printable dots. */
export const PAPER_DOTS = 576
const PAD = 14
const INK = '#000'
const FONT = 'Cairo, Tajawal, Arial, sans-serif'

const ORDER_TYPE_LABEL = { takeaway: 'سفري', dine_in: 'بالمحل', delivery: 'توصيل' }
const PAYMENT_LABEL = { cash: 'نقداً', card: 'بطاقة', unpaid: 'آجل' }

const loadImage = src => new Promise(resolve => {
  if (!src) return resolve(null)
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = src
})

async function ensureFonts() {
  if (!document.fonts?.load) return
  await Promise.all([
    document.fonts.load(`900 40px Cairo`),
    document.fonts.load(`700 24px Cairo`),
    document.fonts.load(`400 20px Cairo`),
  ]).catch(() => {})
}

/** Tiny layout helper: an oversized canvas with a moving y cursor. */
function createPage() {
  const canvas = document.createElement('canvas')
  canvas.width = PAPER_DOTS
  canvas.height = 5000
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = INK
  ctx.strokeStyle = INK
  ctx.direction = 'rtl'
  ctx.textBaseline = 'top'

  let y = PAD
  const right = PAPER_DOTS - PAD
  const left = PAD

  const font = (size, weight = 700) => { ctx.font = `${weight} ${size}px ${FONT}` }

  const wrap = (text, maxWidth) => {
    const words = String(text ?? '').split(/\s+/).filter(Boolean)
    const lines = []
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = w } else line = next
    }
    if (line) lines.push(line)
    return lines.length ? lines : ['']
  }

  return {
    canvas, ctx,
    get y() { return y },
    gap(h) { y += h },
    text(str, { size = 22, weight = 700, align = 'center', lineGap = 1.35, inset = 0 } = {}) {
      font(size, weight)
      const r = right - inset, l = left + inset
      const maxW = r - l
      for (const line of wrap(str, maxW)) {
        ctx.textAlign = align
        const x = align === 'center' ? PAPER_DOTS / 2 : align === 'right' ? r : l
        ctx.fillText(line, x, y)
        y += Math.round(size * lineGap)
      }
    },
    /** name on the right (wrapping), value on the left */
    row(label, value, { size = 22, weight = 700, valueWeight = 800 } = {}) {
      font(size, valueWeight)
      const valueW = value ? ctx.measureText(value).width + 16 : 0
      if (value) { ctx.textAlign = 'left'; ctx.direction = 'ltr'; ctx.fillText(value, left, y); ctx.direction = 'rtl' }
      font(size, weight)
      const lines = wrap(label, right - left - valueW)
      lines.forEach((line, i) => { ctx.textAlign = 'right'; ctx.fillText(line, right, y + i * Math.round(size * 1.35)) })
      y += lines.length * Math.round(size * 1.35) + 4
    },
    line({ dashed = true, width = 2 } = {}) {
      y += 6
      ctx.lineWidth = width
      ctx.setLineDash(dashed ? [8, 6] : [])
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke()
      ctx.setLineDash([])
      y += 10
    },
    box(draw, { padding = 10, width = 3 } = {}) {
      const top = y
      y += padding
      draw()
      y += padding - 4
      ctx.lineWidth = width
      ctx.strokeRect(left, top, right - left, y - top)
      y += 8
    },
    band(str, { size = 30 } = {}) {
      font(size, 900)
      const h = Math.round(size * 1.6)
      ctx.fillRect(left, y, right - left, h)
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.fillText(str, PAPER_DOTS / 2, y + Math.round((h - size * 1.25) / 2))
      ctx.fillStyle = INK
      y += h + 10
    },
    image(img, maxWidth, maxHeight, { circle = false, zoom = 1 } = {}) {
      if (!img) return
      const scale = Math.min(maxWidth / img.width, maxHeight / img.height)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const x = Math.round((PAPER_DOTS - w) / 2)
      if (circle) {
        /* round logo on a square canvas — clip away the corners, and zoom
           slightly past the file's own white margin */
        ctx.save()
        ctx.beginPath()
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2)
        ctx.clip()
        const zw = w * zoom, zh = h * zoom
        ctx.drawImage(img, x - (zw - w) / 2, y - (zh - h) / 2, zw, zh)
        ctx.restore()
      } else {
        ctx.drawImage(img, x, y, w, h)
      }
      y += h + 6
    },
  }
}

/** Crop to content and convert to packed 1-bit rows (Floyd–Steinberg for the logo's tones). */
function toRaster(page) {
  const height = Math.min(page.y + PAD, page.canvas.height)
  const width = PAPER_DOTS
  const { data } = page.ctx.getImageData(0, 0, width, height)

  const lum = new Float32Array(width * height)
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    const v = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
    /* Snap near-white paper and near-black ink so only true mid-tones (the
       logo's browns) get dithered — otherwise off-white turns to grey dust. */
    lum[i] = v > 215 ? 255 : v < 70 ? 0 : v
  }

  const bytesPerRow = Math.ceil(width / 8)
  const bits = new Uint8Array(bytesPerRow * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const v = lum[i]
      const black = v < 128
      const err = v - (black ? 0 : 255)
      if (black) bits[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7)
      if (x + 1 < width) lum[i + 1] += err * 7 / 16
      if (y + 1 < height) {
        if (x > 0) lum[i + width - 1] += err * 3 / 16
        lum[i + width] += err * 5 / 16
        if (x + 1 < width) lum[i + width + 1] += err * 1 / 16
      }
    }
  }

  let bin = ''
  for (let i = 0; i < bits.length; i += 0x8000) bin += String.fromCharCode(...bits.subarray(i, i + 0x8000))
  return { width, height, data: btoa(bin), get previewUrl() { return previewFromBits(bits, width, height) } }
}

/** What will actually come out of the printer — for on-screen checks. */
function previewFromBits(bits, width, height) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const img = c.getContext('2d').createImageData(width, height)
  const bytesPerRow = Math.ceil(width / 8)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = bits[y * bytesPerRow + (x >> 3)] & (0x80 >> (x & 7))
      const p = (y * width + x) * 4
      img.data[p] = img.data[p + 1] = img.data[p + 2] = on ? 0 : 255
      img.data[p + 3] = 255
    }
  }
  c.getContext('2d').putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

const dateTime = formatShopDateTime

export async function renderCashierTicket(t, { logoUrl = '/brand/luliz-logo-round.png' } = {}) {
  await ensureFonts()
  const logo = await loadImage(logoUrl)
  const p = createPage()

  p.image(logo, 230, 230)
  p.text('فاتورة مبيع', { size: 22, weight: 700 })
  p.text(t.orderNumber, { size: 34, weight: 900 })
  p.text(dateTime(t.createdAt), { size: 20, weight: 400 })
  const meta = [ORDER_TYPE_LABEL[t.orderType], PAYMENT_LABEL[t.paymentMethod]].filter(Boolean).join(' · ')
  if (meta) p.text(meta, { size: 20, weight: 700 })
  if (t.customerName) p.text(`الزبون: ${t.customerName}`, { size: 20, weight: 700 })
  if (t.fulfillmentType === 'scheduled' && t.scheduledFor) p.text(`موعد التسليم: ${dateTime(t.scheduledFor)}`, { size: 20, weight: 800 })

  p.line({ dashed: false, width: 3 })
  for (const it of t.items) {
    const modNames = (it.modifiers || []).map(m => m.name).join('، ')
    p.row(`${it.name}${modNames ? ` (${modNames})` : ''}  × ${it.quantity}`, formatCurrency(it.lineTotal), { size: 23 })
  }
  p.line()
  if (t.discount > 0) {
    p.row('المجموع', formatCurrency((t.subtotal ?? t.total + t.discount)), { size: 21, weight: 400 })
    p.row('الخصم', `−${formatCurrency(t.discount)}`, { size: 21, weight: 400 })
  }
  p.gap(4)
  p.band(`الإجمالي  ${formatCurrency(t.total)}`, { size: 30 })

  if (t.notes) p.box(() => p.text(`ملاحظات: ${t.notes}`, { size: 20, weight: 700, align: 'right', inset: 12 }))

  p.gap(6)
  p.text('شكراً لاختياركم لوليز ♥', { size: 24, weight: 800 })
  p.text('loliz-taste.com', { size: 18, weight: 400 })
  return toRaster(p)
}

export async function renderKitchenTicket(t) {
  await ensureFonts()
  const p = createPage()

  p.band('طلب مطبخ', { size: 34 })
  p.text(t.orderNumber, { size: 46, weight: 900 })
  const time = formatShopTime(t.createdAt)
  p.text(`${ORDER_TYPE_LABEL[t.orderType] || ''} · ${time}`, { size: 24, weight: 800 })
  p.text(
    t.fulfillmentType === 'scheduled' && t.scheduledFor ? `⏰ موعد التسليم: ${dateTime(t.scheduledFor)}` : 'فوري',
    { size: 24, weight: 900 },
  )
  if (t.customerName) p.text(`الزبون: ${t.customerName}`, { size: 22, weight: 700 })

  p.line({ dashed: false, width: 4 })
  for (const it of t.items) {
    const modNames = (it.modifiers || []).map(m => m.name).join('، ')
    p.row(it.name, `${it.quantity}×`, { size: 32, weight: 800, valueWeight: 900 })
    if (modNames) p.text(`⤷ ${modNames}`, { size: 22, weight: 800, align: 'right' })
    p.line()
  }
  if (t.notes) p.box(() => p.text(`ملاحظات: ${t.notes}`, { size: 26, weight: 900, align: 'right', inset: 12 }), { width: 4 })
  p.gap(10)
  return toRaster(p)
}

/**
 * End-of-day printout: every order of the day with the investor's cut of each,
 * then the totals. `r` is the /internal-orders/daily-report response.
 */
export async function renderDailyReport(r, { logoUrl = '/brand/luliz-logo-round.png' } = {}) {
  await ensureFonts()
  const logo = await loadImage(logoUrl)
  const p = createPage()
  const inv = r.investor || {}
  const invOn = inv.enabled !== false

  p.image(logo, 150, 150)
  p.band('طلبات اليوم', { size: 30 })
  p.text(`طُبعت: ${formatShopDateTime(new Date().toISOString())}`, { size: 18, weight: 400 })
  p.text(`طلبات يوم ${formatShopDateTime(`${r.date}T12:00:00`).split(' · ')[0]}`, { size: 22, weight: 900 })
  p.line({ dashed: false, width: 3 })

  if (!r.orders?.length) {
    p.text('لا توجد طلبات بهاليوم', { size: 24, weight: 800 })
  }

  for (const o of r.orders || []) {
    const type = o.kind === 'site' ? 'موقع' : (ORDER_TYPE_LABEL[o.orderType] || '')
    p.text(`${o.number}  ·  ${type}  ·  ${formatShopTime(o.at)}`, { size: 20, weight: 900, align: 'right' })
    for (const it of o.items) p.text(`${it.name} × ${it.quantity}`, { size: 19, weight: 400, align: 'right' })
    p.row('المبلغ', formatCurrency(o.total), { size: 20, weight: 700 })
    if (invOn) p.row(`${inv.name} ${o.investorPercent}%`, formatCurrency(o.investorShare), { size: 20, weight: 800 })
    p.line()
  }

  const t = r.totals || {}
  p.gap(4)
  p.row('عدد الطلبات', String(t.count || 0), { size: 22, weight: 800 })
  if (t.pos?.count) p.row(`الكاشير (${t.pos.count})`, formatCurrency(t.pos.sales), { size: 21, weight: 700 })
  if (t.site?.count) p.row(`الموقع (${t.site.count})`, formatCurrency(t.site.sales), { size: 21, weight: 700 })
  p.band(`إجمالي المبيعات  ${formatCurrency(t.sales || 0)}`, { size: 26 })

  if (invOn) {
    p.box(() => {
      p.text(`نسبة ${inv.name}`, { size: 24, weight: 900 })
      if (t.internal?.count) p.row(`داخلي / سفري ${inv.internalPercent}%`, formatCurrency(t.internal.investorShare), { size: 21, weight: 700 })
      if (t.delivery?.count) p.row(`توصيل ${inv.deliveryPercent}%`, formatCurrency(t.delivery.investorShare), { size: 21, weight: 700 })
      p.row('المجموع', formatCurrency(t.investorShare || 0), { size: 26, weight: 900, valueWeight: 900 })
    }, { width: 4 })
  }
  p.gap(10)
  return toRaster(p)
}
