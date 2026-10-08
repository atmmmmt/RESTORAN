const STORAGE_KEY = 'loliz_thermal_printer_v1'

export const defaultPrinterSettings = {
  enabled: false,
  autoPrint: false,
  agentUrl: 'http://127.0.0.1:18181',
  /* 'network' for a printer with its own IP, 'usb' for one reached through
     the Windows spooler by name. The USB models have no address at all. */
  connection: 'network',
  printerIp: '192.168.1.50',
  printerPort: 9100,
  printerName: '',
  paperWidth: 80,
  copies: 1,
  autoCut: true,
  header: 'عجينة وطحينة',
  footer: 'شكراً لزيارتكم',
  showLogo: true,
  logoUrl: '/logo.png',
  /* Printed under the thank-you line. Kept here rather than read from the
     site settings because the till has to print the same ticket with the
     internet down. */
  instagram: '3ajineh.w.t7ineh',

  /* A second printer, for the kitchen. Kept as its own block rather than a
     second copy of the settings screen: the two printers are rarely the same
     kind — the counter's is usually USB on the till, the kitchen's is on the
     network across the room — and the kitchen ticket is a different document
     from the customer's receipt, with no money on it at all. */
  kitchen: {
    enabled: false,
    connection: 'network',
    printerIp: '192.168.1.60',
    printerPort: 9100,
    printerName: '',
    paperWidth: 80,
    autoCut: true,
    copies: 1,
  },
}

/* `kitchen` is merged one level deeper on purpose: a device that saved its
   settings before the kitchen printer existed would otherwise come back with
   no kitchen block at all, and every read of it would throw. */
export function getPrinterSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      ...defaultPrinterSettings, ...stored,
      kitchen: { ...defaultPrinterSettings.kitchen, ...(stored.kitchen || {}) },
    }
  } catch { return { ...defaultPrinterSettings, kitchen: { ...defaultPrinterSettings.kitchen } } }
}

export function savePrinterSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...defaultPrinterSettings, ...settings,
    kitchen: { ...defaultPrinterSettings.kitchen, ...(settings.kitchen || {}) },
  }))
}

const money = value => `${Number(value || 0).toLocaleString('ar-SY')} ل.س`

/* The canvas has to be painted in a font the browser has actually got. Drawing
   before the webfont resolves silently falls back to Arial, whose Arabic is
   thinner still — so the ticket that prints worst is the first one after a
   reload. Never let a slow font hold up a sale for more than a moment. */
function readyFont() {
  if (!document.fonts) return Promise.resolve()
  return Promise.race([
    Promise.all([
      document.fonts.load('700 36px Tajawal', 'عجينة'),
      document.fonts.load('400 24px Tajawal', 'عجينة'),
    ]),
    new Promise(resolve => setTimeout(resolve, 1500)),
  ]).catch(() => {})
}

/* ── Logo ──────────────────────────────────────────────────────
   Loaded once and kept, so a busy counter isn't re-fetching the same
   picture on every ticket. A logo that won't load must never stop a
   sale from printing: the receipt simply starts at the shop name. */
const logoCache = new Map()
function loadLogo(url) {
  if (!url) return Promise.resolve(null)
  if (logoCache.has(url)) return logoCache.get(url)
  const pending = new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
  logoCache.set(url, pending)
  return pending
}

/* ── Canvas → ESC/POS raster ───────────────────────────────── */

/* A grey pixel is a pixel the head will not fire. Canvas anti-aliases every
   glyph edge, so a thin Arabic stem can be almost entirely edge — at the old
   cut-off of 170 those strokes fell through the sieve and the line came out
   as a row of dots. Keeping everything below near-white means a stroke the
   eye can see is a stroke the head prints. */
const INK_CUTOFF = 205

/* No heating command is sent, and none should be.
 *
 * ESC 7 sets the head's heating time on the boards that implement it, and it
 * looked like the cure for a pale ticket. These printers do not implement it:
 * they printed the '7' and took its three parameter bytes as text, and from
 * that point the stream was one byte out — the raster that followed came out
 * as pages of random glyphs on both machines at once.
 *
 * An unrecognised command does not fail quietly here; it destroys everything
 * after it. So the bytes below stay to the commands these printers are known
 * to answer, and darkness is handled where it cannot corrupt anything: fatter
 * strokes on the canvas, a cut-off that keeps them (INK_CUTOFF), and the
 * printer's own density setting in its configuration page.
 */

function toEscPos(canvas, height, settings) {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, height).data
  const bytesPerRow = Math.ceil(canvas.width / 8)
  const raster = new Uint8Array(bytesPerRow * height)
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < canvas.width; px++) {
      const i = (py * canvas.width + px) * 4
      const luminance = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
      if (luminance < INK_CUTOFF && pixels[i + 3] > 32) raster[py * bytesPerRow + (px >> 3)] |= 0x80 >> (px & 7)
    }
  }

  /* Initialise, one raster, feed, cut — and nothing else. Built into a typed
     array rather than a spread of a plain array: a tall day-report is several
     hundred thousand bytes, and spreading that many arguments overflows the
     call stack. */
  const header = [0x1b, 0x40, 0x1d, 0x76, 0x30, 0,
    bytesPerRow & 255, bytesPerRow >> 8, height & 255, height >> 8]
  const tail = settings.autoCut ? [0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x41, 3] : [0x0a, 0x0a, 0x0a]

  const bytes = new Uint8Array(header.length + raster.length + tail.length)
  bytes.set(header, 0)
  bytes.set(raster, header.length)
  bytes.set(tail, header.length + raster.length)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/* Some low-cost ESC/POS boards lose sync when one very tall GS v 0 image is
   sent in a single command. Once that happens the remaining raster bytes are
   interpreted as text and come out as Chinese/random glyphs. Shift reports
   are taller than normal receipts, so send them as a sequence of small raster
   bands while keeping the exact same Arabic canvas rendering. */
function toEscPosBanded(canvas, height, settings, bandHeight = 192) {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, height).data
  const bytesPerRow = Math.ceil(canvas.width / 8)
  const chunks = [new Uint8Array([0x1b, 0x40])] // ESC @ once

  for (let y0 = 0; y0 < height; y0 += bandHeight) {
    const h = Math.min(bandHeight, height - y0)
    const raster = new Uint8Array(bytesPerRow * h)

    for (let row = 0; row < h; row++) {
      const py = y0 + row
      for (let px = 0; px < canvas.width; px++) {
        const i = (py * canvas.width + px) * 4
        const luminance = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
        if (luminance < INK_CUTOFF && pixels[i + 3] > 32) {
          raster[row * bytesPerRow + (px >> 3)] |= 0x80 >> (px & 7)
        }
      }
    }

    chunks.push(new Uint8Array([
      0x1d, 0x76, 0x30, 0,
      bytesPerRow & 255, bytesPerRow >> 8,
      h & 255, h >> 8,
    ]))
    chunks.push(raster)
    // A single LF between bands keeps clone printers synchronized without
    // adding a visible blank section.
    chunks.push(new Uint8Array([0x0a]))
  }

  chunks.push(new Uint8Array(
    settings.autoCut
      ? [0x0a, 0x0a, 0x1d, 0x56, 0x41, 3]
      : [0x0a, 0x0a, 0x0a]
  ))

  const total = chunks.reduce((sum, part) => sum + part.length, 0)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const part of chunks) {
    bytes.set(part, offset)
    offset += part.length
  }

  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/**
 * A small drawing kit over the receipt canvas. Everything below is written
 * in terms of these, which is what keeps the two printouts looking like they
 * came from the same shop.
 */
function painter(ctx, width) {
  const PAD = 22

  /* A thermal head reproduces a fat stroke and drops a hairline one, and
     Arabic at receipt sizes is mostly hairline. Every glyph is therefore
     painted twice — filled, then outlined — which widens each stroke by
     about half a dot on each side and is the difference between a line you
     can read across the counter and a line of grey speckle. */
  const MIN_SIZE = 21
  function ink(text, x, y, maxWidth, size) {
    ctx.fillText(text, x, y, maxWidth)
    /* Only the small sizes are helped. A heading is already several dots
       wide at every stroke, and outlining it too was what closed up the
       counters inside the Arabic letters and made the whole ticket read as
       one heavy block. */
    if (size >= 30) return
    ctx.lineWidth = 0.5
    ctx.lineJoin = 'round'
    ctx.strokeStyle = ctx.fillStyle
    ctx.strokeText(text, x, y, maxWidth)
  }

  const api = {
    y: 16,
    font(size, bold) { ctx.font = `${bold ? '700' : '400'} ${size}px Tajawal, Cairo, Arial, Tahoma, sans-serif` },

    /** One line of text. */
    line(text, { size = 24, bold = false, align = 'center', gap = 12, color = '#000' } = {}) {
      size = Math.max(size, MIN_SIZE)
      api.font(size, bold)
      ctx.fillStyle = color
      ctx.textAlign = align
      const x = align === 'right' ? width - PAD : align === 'left' ? PAD : width / 2
      ink(String(text), x, api.y, width - PAD * 2, size)
      api.y += size + gap
      return api
    },

    /** Label on the right, value on the left — the shape of every total. */
    pair(label, value, { size = 23, bold = false, color = '#000' } = {}) {
      size = Math.max(size, MIN_SIZE)
      api.font(size, bold)
      ctx.fillStyle = color
      ctx.textAlign = 'right'
      ink(String(label), width - PAD, api.y, width * 0.58, size)
      ctx.textAlign = 'left'
      ink(String(value), PAD, api.y, width * 0.36, size)
      api.y += size + 12
      return api
    },

    /** The headline figure. Drawn as a framed line rather than white-on-black:
        a full-black bar is the heaviest row a receipt can ask for, and an
        under-powered head answers it by printing nothing at all. */
    banner(label, value, { size = 30 } = {}) {
      const top = api.y - 8
      const height = size + 26
      api.font(size, true)
      ctx.fillStyle = '#000'
      ctx.textAlign = 'right'
      ink(String(label), width - PAD - 10, api.y + 5, width * 0.5, size)
      ctx.textAlign = 'left'
      ink(String(value), PAD + 10, api.y + 5, width * 0.45, size)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 4
      ctx.strokeRect(PAD - 6, top, width - (PAD - 6) * 2, height)
      api.y += height + 10
      return api
    },

    rule(weight = 2) {
      ctx.fillStyle = '#000'
      api.y += 6
      ctx.fillRect(PAD, api.y, width - PAD * 2, weight)
      api.y += weight + 12
      return api
    },

    /** Dashed separator — lighter than a rule, for inside a section. */
    dashes() {
      ctx.fillStyle = '#000'
      api.y += 6
      /* Three dots tall, not two: a two-dot dash is the first thing a tired
         head drops, and a separator that vanishes takes the receipt's
         structure with it. */
      for (let x = PAD; x < width - PAD; x += 16) ctx.fillRect(x, api.y, 10, 3)
      api.y += 15
      return api
    },

    /** A hairline frame around whatever the callback draws. */
    box(draw, { padding = 12 } = {}) {
      const top = api.y
      api.y += padding
      draw()
      api.y += padding - 12
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.strokeRect(PAD - 4, top, width - (PAD - 4) * 2, api.y - top)
      api.y += 12
      return api
    },

    space(px = 8) { api.y += px; return api },
  }
  return api
}

function newCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000'; ctx.textBaseline = 'top'; ctx.direction = 'rtl'
  return { canvas, ctx }
}

/* The logo is a colour drawing — brick fill, brown outline, cream highlights —
   and a head that only knows "dot" or "no dot" turns mid-tones into speckle.
   It is reduced to clean line art on its own, at its own cut-off, so the page
   threshold never has to make that judgement on a photograph. Cached per size,
   since the same mark heads every ticket of the day. */
const lineArtCache = new Map()
function toLineArt(image, w, h) {
  const key = `${image.src}|${w}x${h}`
  const hit = lineArtCache.get(key)
  if (hit) return hit

  const flat = document.createElement('canvas')
  flat.width = w; flat.height = h
  const fctx = flat.getContext('2d', { willReadFrequently: true })
  fctx.fillStyle = '#fff'; fctx.fillRect(0, 0, w, h)
  fctx.drawImage(image, 0, 0, w, h)
  const data = fctx.getImageData(0, 0, w, h)
  const d = data.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
    const on = d[i + 3] > 32 && lum < 150
    d[i] = d[i + 1] = d[i + 2] = on ? 0 : 255
    d[i + 3] = 255
  }
  fctx.putImageData(data, 0, 0)
  lineArtCache.set(key, flat)
  return flat
}

/** The shop's masthead — logo and name — shared by both printouts. */
function drawHeader(ctx, p, width, settings, logo) {
  if (logo && settings.showLogo !== false) {
    const maxHeight = 240
    const scale = Math.min((width - 40) / logo.width, maxHeight / logo.height)
    const w = Math.round(logo.width * scale)
    const h = Math.round(logo.height * scale)
    ctx.drawImage(toLineArt(logo, w, h), Math.round((width - w) / 2), p.y, w, h)
    p.y += h + 14
  }
  p.line(settings.header, { size: 36, bold: true, gap: 10 })
}

const ORDER_TYPE_LABEL = { takeaway: 'سفري', dine_in: 'بالمحل', delivery: 'توصيل', site: 'موقع' }
const PAYMENT_LABEL    = { cash: 'نقداً', card: 'بطاقة', unpaid: 'آجل' }

/* "الخصم (10%) — شركة التوصيل": the rate and the reason when there is one. */
export const discountLabel = order => {
  let label = 'الخصم'
  if (order.discountType === 'percent' && order.discountPercent > 0) label += ` (${order.discountPercent}%)`
  if (order.discountReason) label += ` — ${order.discountReason}`
  return label
}

const DAMASCUS_OFFSET_MS = 3 * 60 * 60 * 1000
const shopTime = iso => {
  const d = new Date(new Date(iso).getTime() + DAMASCUS_OFFSET_MS)
  let h = d.getUTCHours()
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  const suffix = h < 12 ? 'ص' : 'م'
  h = h % 12 || 12
  return `${h}:${m} ${suffix}`
}

/* ── The customer's receipt ────────────────────────────────── */
function drawReceipt(order, settings, { duplicate = false, logo = null } = {}) {
  const width = Number(settings.paperWidth) === 58 ? 384 : 576
  const items = order.items || []
  /* Generous on purpose. This is the canvas the ticket is drawn on, not the
     paper: whatever is left over is trimmed at the end, but anything that
     runs past it is simply lost — which is how the closing line came to be
     cut off the moment the logo grew. */
  const height = 1750 + items.length * 110 + (order.notes ? 160 : 0)
  const { canvas, ctx } = newCanvas(width, height)
  const p = painter(ctx, width)

  drawHeader(ctx, p, width, settings, logo)
  p.rule(3)

  if (duplicate) p.line('— نسخة مكررة —', { size: 22, bold: true })

  /* Who, when, and which ticket — framed so the eye finds it first. */
  p.box(() => {
    p.line(order.orderNumber || 'فاتورة', { size: 30, bold: true, gap: 8 })
    p.line(new Date(order.createdAt || Date.now()).toLocaleDateString('ar-EG', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }) + ' — ' + shopTime(order.createdAt || Date.now()), { size: 19, gap: 8 })
    const tags = [ORDER_TYPE_LABEL[order.orderType], PAYMENT_LABEL[order.paymentMethod]].filter(Boolean)
    if (tags.length) p.line(tags.join(' · '), { size: 20, bold: true, gap: 4 })
  })

  if (order.customerName) p.line(`الزبون: ${order.customerName}`, { size: 21, bold: true, align: 'right' })
  if (order.fulfillmentType === 'scheduled' && order.scheduledFor) {
    p.line(`موعد التسليم: ${new Date(order.scheduledFor).toLocaleString('ar-EG', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    })}`, { size: 21, bold: true, align: 'right' })
  }

  p.dashes()
  p.pair('الصنف', 'المبلغ', { size: 20, bold: true })
  p.dashes()

  for (const item of items) {
    p.pair(
      `${item.name} × ${item.quantity}`,
      money(item.lineTotal ?? item.unitPrice * item.quantity),
      { size: 23, bold: true }
    )
    if (item.quantity > 1) {
      p.line(`${money(item.unitPrice)} للقطعة`, { size: 17, align: 'right', gap: 8 })
    }
    if (item.notes) p.line(`— ${item.notes}`, { size: 17, align: 'right', gap: 8 })
  }

  /* No separator before the total. The framed box is its own boundary, and a
     dashed rule directly above it only drew a second line beside the first. */
  if (order.subtotal !== undefined && order.discount > 0) {
    p.space(6)
    p.pair('المجموع', money(order.subtotal))
    p.pair(discountLabel(order), `− ${money(order.discount)}`)
  }
  const invoiceBase = Number(order.netAmount ?? Math.max((Number(order.subtotal || 0) - Number(order.discount || 0)), 0))
  p.space(4)
  p.pair('قيمة المأكولات والمشروبات', money(invoiceBase), { size: 21, bold: true })
  p.pair('إنفاق استهلاكي (5%)', money(order.consumptionTaxAmount || 0), { size: 21, bold: true })
  p.pair('إدارة محلية (5%)', money(order.localAdminAmount || 0), { size: 21, bold: true })
  p.banner('الإجمالي', money(order.total))

  /* The partner's cut belongs on the end-of-day report, not on the
     customer's ticket — it is the shop's arrangement, not their business. */

  if (order.createdByName) p.line(`الكاشير: ${order.createdByName}`, { size: 19, align: 'right', gap: 8 })

  if (order.notes) {
    p.space(6)
    /* Label and note on one line. A short note under a heading of its own
       spent two lines of paper saying what fits in one. */
    p.box(() => {
      p.line(`ملاحظات: ${order.notes}`, { size: 21, bold: true, align: 'right', gap: 4 })
    })
  }

  p.space(10)
  p.rule(3)
  p.line(settings.footer, { size: 26, bold: true, gap: 8 })
  p.line('منكبر بمحبتكم', { size: 20, gap: 10 })
  if (settings.instagram) {
    p.line('زوروا الانستغرام تبعنا', { size: 20, gap: 4 })
    /* The handle carries the @ and stays unbolded: it is the one line on the
       ticket someone will copy character by character, and a heavy stroke at
       this size closes the gaps in a latin string. */
    /* Isolated left-to-right. The canvas draws this ticket right-to-left, so
       a bare handle has its "@" carried to the far end of the line — the one
       character that has to lead. */
    p.line(`⁦@${String(settings.instagram).replace(/^@/, '')}⁩`, { size: 22, gap: 10 })
  }

  return { canvas, height: Math.min(canvas.height, p.y + 24) }
}

const rasterReceipt = (order, settings, opts) => {
  const { canvas, height } = drawReceipt(order, settings, opts)
  return toEscPos(canvas, height, settings)
}

/* ── The kitchen's ticket ──────────────────────────────────────
   There is one physical printer in the kitchen. A mixed order is split into
   independent preparation slips so each station can take only its own paper. */
const KITCHEN_SECTIONS = {
  pastries:   'قسم المعجنات',
  grills:     'قسم المشاوي',
  appetizers: 'قسم المقبلات / المازة',
  drinks:     'قسم المشروبات',
  other:      'قسم أخرى',
}

function inferKitchenSection(item) {
  if (KITCHEN_SECTIONS[item?.kitchenSection]) return item.kitchenSection
  const text = `${item?.categorySnapshot || item?.category || ''} ${item?.name || ''}`.toLowerCase()
  if (/(مشروب|مشروبات|كولا|بيبسي|مياه|ماء|لبن|عيران|عصير)/.test(text)) return 'drinks'
  if (/(مشاوي|مشوي|كباب|شقف|شيش|سودة|جوانح|جناح|لحم مشوي)/.test(text)) return 'grills'
  if (/(مقبلات|مقبل|مازة|سلطة|فتوش|حمص|متبل|بابا غنوج|بطاطا)/.test(text)) return 'appetizers'
  if (/(معجنات|معجن|فطاير|فطائر|منقوش|مناقيش|بيتزا|صفيحة|صفيح|سفيحة|عجين)/.test(text)) return 'pastries'
  return 'other'
}

function splitKitchenItems(items = []) {
  const groups = new Map()
  for (const item of items) {
    const key = inferKitchenSection(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }
  return [...groups.entries()].map(([key, groupedItems]) => ({
    key,
    label: KITCHEN_SECTIONS[key] || KITCHEN_SECTIONS.other,
    items: groupedItems,
  }))
}

function drawKitchenTicket(order, settings, sectionLabel = 'المطبخ') {
  const kitchen = settings.kitchen
  const width = Number(kitchen.paperWidth) === 58 ? 384 : 576
  const items = order.items || []
  const notes = items.filter(i => i.notes).length
  const { canvas, ctx } = newCanvas(width, 900 + items.length * 110 + notes * 46 + (order.notes ? 140 : 0))
  const p = painter(ctx, width)

  p.line(sectionLabel, { size: 34, bold: true, gap: 6 })
  p.rule(4)

  p.line(order.orderNumber || 'طلب', { size: 34, bold: true, gap: 6 })
  const tags = [ORDER_TYPE_LABEL[order.orderType], shopTime(order.createdAt || Date.now())].filter(Boolean)
  p.line(tags.join('  ·  '), { size: 24, bold: true, gap: 6 })
  if (order.customerName) p.line(order.customerName, { size: 24, bold: true, gap: 6 })
  if (order.fulfillmentType === 'scheduled' && order.scheduledFor) {
    p.line(`موعد: ${new Date(order.scheduledFor).toLocaleString('ar-EG', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    })}`, { size: 24, bold: true, gap: 6 })
  }
  p.rule(4)

  for (const item of items) {
    p.pair(item.name, `× ${item.quantity}`, { size: 30, bold: true })
    if (item.notes) p.line(`← ${item.notes}`, { size: 24, bold: true, align: 'right', gap: 10 })
    p.dashes()
  }

  if (order.notes) {
    p.space(4)
    p.box(() => {
      p.line(`ملاحظات الطلب: ${order.notes}`, { size: 24, bold: true, align: 'right', gap: 4 })
    })
  }

  p.space(8)
  p.line(`${items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0)} قطعة لهذا القسم`, { size: 24, bold: true, gap: 10 })

  return { canvas, height: Math.min(canvas.height, p.y + 24) }
}

/**
 * One physical printer, many independent slips. The requests are deliberately
 * awaited in sequence so cheap USB/LAN print buffers are not flooded.
 */
export async function printKitchenTicket(order) {
  const settings = getPrinterSettings()
  const kitchen = settings.kitchen
  if (!kitchen.enabled) throw new Error('طابعة المطبخ غير مفعّلة')
  if (kitchen.connection === 'usb' && !kitchen.printerName) throw new Error('اختر طابعة المطبخ من الإعدادات')
  await readyFont()

  const groups = splitKitchenItems(order.items || [])
  if (!groups.length) throw new Error('الطلب لا يحتوي أصنافاً للطباعة')

  const printed = []
  for (const group of groups) {
    const { canvas, height } = drawKitchenTicket({ ...order, items: group.items }, settings, group.label)
    const response = await fetch(`${settings.agentUrl.replace(/\/$/, '')}/print`, {
      method: 'POST',
      mode: 'cors',
      targetAddressSpace: 'loopback',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...printerTarget(kitchen),
        copies: Math.max(1, Math.min(5, Number(kitchen.copies) || 1)),
        dataBase64: toEscPosBanded(canvas, height, kitchen),
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.message || `تعذّرت طباعة ${group.label}`)
    printed.push(group.label)
  }

  return {
    success: true,
    printedSections: printed,
    printerId: printerLabel(kitchen),
  }
}

/* Where the ticket is going, in the shape the agent expects. */
function printerTarget(settings) {
  return settings.connection === 'usb'
    ? { connection: 'usb', printerName: settings.printerName }
    : { connection: 'network', host: settings.printerIp, port: Number(settings.printerPort) }
}

const printerLabel = settings => settings.connection === 'usb'
  ? settings.printerName
  : `${settings.printerIp}:${settings.printerPort}`

/* A made-up order, so the receipt printer can be proved from the settings
   screen without ringing up a sale to find out. */
export const sampleOrder = () => ({
  orderNumber: 'تجربة',
  createdAt: new Date().toISOString(),
  orderType: 'dine_in',
  paymentMethod: 'cash',
  items: [{ name: 'صنف تجريبي', quantity: 2, unitPrice: 250, lineTotal: 500 }],
  total: 500,
})

/** Printer names the agent's machine knows about — for the settings page. */
export async function listAgentPrinters(settings = getPrinterSettings()) {
  let response
  try {
    response = await fetch(`${settings.agentUrl.replace(/\/$/, '')}/printers`, {
      mode: 'cors',
      targetAddressSpace: 'loopback',
    })
  } catch {
    throw new Error('وكيل الطباعة لا يعمل على هذا الجهاز — شغّل start-print-agent.bat')
  }
  /* An agent from before USB support has no /printers at all, and its bare
     "Not found" sends people looking at the printer instead of at the agent
     they never replaced. Name the actual problem. */
  if (response.status === 404) {
    throw new Error('نسخة وكيل الطباعة قديمة ولا تدعم USB — انسخ مجلد print-agent الجديد وأعد تشغيله')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'تعذّر قراءة قائمة الطابعات')
  return result.printers || []
}

export async function printThermalReceipt(order, { duplicate = false } = {}) {
  const settings = getPrinterSettings()
  if (!settings.enabled) throw new Error('الطابعة الحرارية غير مفعّلة')
  if (settings.connection === 'usb' && !settings.printerName) throw new Error('اختر طابعة USB من الإعدادات')
  await readyFont()
  const logo = settings.showLogo === false ? null : await loadLogo(settings.logoUrl)
  const response = await fetch(`${settings.agentUrl.replace(/\/$/, '')}/print`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...printerTarget(settings),
      copies: Math.max(1, Math.min(5, Number(settings.copies) || 1)),
      dataBase64: rasterReceipt(order, settings, { duplicate, logo }),
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'تعذّر الاتصال بالطابعة')
  return { ...result, printerId: printerLabel(settings) }
}

/* ── End-of-day report: every order of the day, the returns, and the
      partner's cut of what actually stayed in the till ── */
function drawDailyReport(report, settings, logo) {
  const width = Number(settings.paperWidth) === 58 ? 384 : 576
  const inv = report.investor || {}
  const orders = report.orders || []
  const returns = report.returns || []
  const itemLines = orders.reduce((s, o) => s + (o.items?.length || 0), 0)
  const { canvas, ctx } = newCanvas(
    width,
    1100 + orders.length * 160 + itemLines * 34 + returns.length * 110
  )
  const p = painter(ctx, width)

  drawHeader(ctx, p, width, settings, logo)
  p.rule(3)
  p.line('تقرير طلبات اليوم', { size: 30, bold: true, gap: 8 })
  p.line(report.date, { size: 21, gap: 6 })
  if (report.range?.start) {
    p.line(`من ${shopTime(report.range.start)} حتى ${shopTime(report.range.end)}`, { size: 18 })
  }
  p.rule(2)

  if (!orders.length) p.line('لا توجد طلبات بهذا اليوم', { size: 24, bold: true })

  for (const o of orders) {
    p.line(`${o.number} · ${ORDER_TYPE_LABEL[o.orderType] || ''} · ${shopTime(o.at)}`,
      { size: 22, bold: true, align: 'right', gap: 8 })
    for (const it of o.items || []) p.line(`${it.name} × ${it.quantity}`, { size: 19, align: 'right', gap: 8 })
    p.pair('المبلغ', money(o.total), { size: 22, bold: true })
    p.dashes()
  }

  if (returns.length) {
    p.space(4)
    p.line('المرتجعات', { size: 26, bold: true, gap: 10 })
    p.dashes()
    for (const r of returns) {
      p.line(`${r.number} · طلب ${r.orderNumber} · ${shopTime(r.at)}`,
        { size: 20, bold: true, align: 'right', gap: 8 })
      for (const it of r.items || []) p.line(`${it.name} × ${it.quantity}`, { size: 18, align: 'right', gap: 6 })
      p.pair('المبلغ المُعاد', `− ${money(r.amount)}`, { size: 21, bold: true })
      p.dashes()
    }
  }

  const t = report.totals || {}
  p.rule(3)
  p.pair('عدد الطلبات', t.count || 0, { size: 24, bold: true })
  p.pair('إجمالي المبيعات', money(t.sales), { size: 24, bold: true })
  if (t.refunded > 0) {
    p.pair(`المرتجعات (${t.returnCount || 0})`, `− ${money(t.refunded)}`, { size: 23, bold: true })
  }
  p.banner('صافي المبيعات', money(t.netSales ?? t.sales), { size: 28 })

  const byType = report.byType || []
  if (inv.enabled !== false && (t.investorShare || byType.some(l => l.investorShare))) {
    p.space(4)
    p.line(`نسبة ${inv.name}`, { size: 24, bold: true, gap: 10 })
    if (t.internal?.count) {
      p.pair(`بالمحل 20% من ${money(t.internal.base)}`, money(t.internal.investorShare), { size: 21, bold: true })
    }
    if (t.external?.count) {
      p.pair(`سفري / توصيل 15% من ${money(t.external.base)}`, money(t.external.investorShare), { size: 21, bold: true })
    }
    p.banner('المستحق', money(t.investorShare), { size: 28 })
    p.space(4)
    p.pair('الباقي للمحل', money((t.netSales ?? t.sales ?? 0) - (t.investorShare || 0)), { size: 23, bold: true })
  }

  p.space(10)
  p.rule(3)
  p.line(settings.footer, { size: 22, bold: true, gap: 8 })
  p.line(`طُبع ${new Date().toLocaleString('ar-EG')}`, { size: 17, gap: 10 })

  return { canvas, height: Math.min(canvas.height, p.y + 24) }
}

const rasterDailyReport = (report, settings, logo) => {
  const { canvas, height } = drawDailyReport(report, settings, logo)
  // Daily reports can be much taller than a normal receipt. Sending one huge
  // GS v 0 raster makes some clone ESC/POS boards lose sync and print the
  // remaining image bytes as random/Chinese-looking characters. Use the same
  // safe banded raster path as the shift-close report.
  return toEscPosBanded(canvas, height, settings)
}

export async function printThermalDailyReport(report) {
  const settings = getPrinterSettings()
  if (!settings.enabled) throw new Error('الطابعة الحرارية غير مفعّلة')
  if (settings.connection === 'usb' && !settings.printerName) throw new Error('اختر طابعة USB من الإعدادات')
  await readyFont()
  const logo = settings.showLogo === false ? null : await loadLogo(settings.logoUrl)
  const response = await fetch(`${settings.agentUrl.replace(/\/$/, '')}/print`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...printerTarget(settings), copies: 1,
      dataBase64: rasterDailyReport(report, settings, logo),
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'تعذّر الاتصال بالطابعة')
  return result
}


/* ── Finance statement ──────────────────────────────────────── */
function drawFinancialReport(report, settings, logo, mode = 'combined') {
  const validMode = ['finance', 'americans', 'combined'].includes(mode) ? mode : 'combined'
  const width = Number(settings.paperWidth) === 58 ? 384 : 576
  const rows = report.rows || []
  const totals = report.totals || {}
  const period = report.period || {}
  const investor = report.investor || {}
  const investorName = investor.name || 'الأميركان'
  const internalPercent = investor.internalPercent ?? 20
  const deliveryPercent = investor.deliveryPercent ?? 15
  const taxOf = x => Number(x?.taxTotal ?? (Number(x?.consumptionTax || 0) + Number(x?.localAdministration || 0)))
  const obligationsOf = x => Number(x?.obligationsTotal ?? (taxOf(x) + Number(x?.investorShare || 0)))
  const { canvas, ctx } = newCanvas(width, 1500 + rows.length * 390)
  const p = painter(ctx, width)

  drawHeader(ctx, p, width, settings, logo)
  p.rule(3)
  p.line(
    validMode === 'finance' ? 'فاتورة المالية والضرائب'
      : validMode === 'americans' ? `فاتورة ${investorName}`
        : 'فاتورة المالية والأميركان',
    { size: 30, bold: true, gap: 6 }
  )
  p.line(
    validMode === 'finance' ? 'الضرائب والتفاصيل المالية فقط'
      : validMode === 'americans' ? 'مستحقات الأميركان فقط'
        : 'نسخة مشتركة للمالية والأميركان',
    { size: 20, bold: true, gap: 8 }
  )

  if (period.start && period.end) {
    const from = new Date(period.start).toLocaleDateString('ar-EG')
    const to = new Date(new Date(period.end).getTime() - 1).toLocaleDateString('ar-EG')
    p.box(() => {
      p.pair('من تاريخ', from, { size: 20, bold: true })
      p.pair('إلى تاريخ', to, { size: 20, bold: true })
    }, { padding: 10 })
  }

  if (!rows.length) p.line('لا توجد مبيعات ضمن الفترة', { size: 24, bold: true })

  for (const row of rows) {
    if (row.manual && validMode === 'americans') continue
    p.rule(2)
    p.line(row.pointOfSale || 'نقطة بيع', { size: 25, bold: true, align: 'right', gap: 7 })
    if (!row.manual) p.pair('عدد الفواتير', String(row.ordersCount || 0), { size: 20 })
    p.pair('المبيعات قبل الضريبة', money(row.foodAndBeverageValue), { size: 21, bold: true })

    if (validMode === 'combined') {
      p.space(4)
      p.pair('إجمالي الضريبة', money(taxOf(row)), { size: 20, bold: true })
      p.pair(`إجمالي ${investorName}`, money(row.investorShare), { size: 20, bold: true })
      p.banner('إجمالي الالتزامات', money(obligationsOf(row)), { size: 26 })
      p.pair('الإجمالي مع الضريبة', money(row.grandTotal), { size: 20, bold: true })
      continue
    }

    if (validMode === 'finance') {
      p.space(5)
      p.line('المالية والضرائب', { size: 23, bold: true, gap: 6 })
      p.pair('إنفاق استهلاكي (5%)', money(row.consumptionTax), { size: 20 })
      p.pair('إدارة محلية (5%)', money(row.localAdministration), { size: 20 })
      p.banner('إجمالي الضريبة', money(taxOf(row)), { size: 25 })
      p.pair('الإجمالي مع الضريبة', money(row.grandTotal), { size: 21, bold: true })
    }

    if (validMode === 'americans') {
      p.space(5)
      p.line(`نسبة ${investorName}`, { size: 23, bold: true, gap: 6 })
      p.pair(`بالمحل ${internalPercent}%`, money(row.investorInternal), { size: 20 })
      p.pair(`سفري / توصيل ${deliveryPercent}%`, money(row.investorExternal), { size: 20 })
      p.banner(`إجمالي ${investorName}`, money(row.investorShare), { size: 25 })
    }
  }

  p.rule(4)
  p.line('الإجمالي العام', { size: 28, bold: true, gap: 10 })
  p.pair('المبيعات قبل الضريبة', money(totals.foodAndBeverageValue), { size: 22, bold: true })

  if (validMode !== 'americans') {
    p.space(6)
    p.line('المالية والضرائب', { size: 25, bold: true, gap: 6 })
    p.pair('إنفاق استهلاكي (5%)', money(totals.consumptionTax), { size: 21 })
    p.pair('إدارة محلية (5%)', money(totals.localAdministration), { size: 21 })
    p.banner('إجمالي الضريبة', money(taxOf(totals)), { size: 27 })
    p.pair('الإجمالي مع الضريبة', money(totals.grandTotal), { size: 22, bold: true })
  }

  if (validMode !== 'finance') {
    p.space(6)
    p.line(`نسبة ${investorName}`, { size: 25, bold: true, gap: 6 })
    p.pair(`بالمحل ${internalPercent}%`, money(totals.investorInternal), { size: 21 })
    p.pair(`سفري / توصيل ${deliveryPercent}%`, money(totals.investorExternal), { size: 21 })
    p.banner(`إجمالي ${investorName}`, money(totals.investorShare), { size: 27 })
  }

  if (validMode === 'combined') {
    p.space(8)
    p.banner('إجمالي الالتزامات', money(obligationsOf(totals)), { size: 30 })
  }

  p.space(8)
  p.rule(2)
  p.line(`طُبع ${new Date().toLocaleString('ar-EG')}`, { size: 18, gap: 8 })
  return { canvas, height: Math.min(canvas.height, p.y + 24) }
}

const rasterFinancialReport = (report, settings, logo, mode = 'combined') => {
  const { canvas, height } = drawFinancialReport(report, settings, logo, mode)
  return toEscPos(canvas, height, settings)
}

export async function getThermalFinancialReportPreview(report, mode = 'combined') {
  const settings = getPrinterSettings()
  await readyFont()
  const logo = settings.showLogo === false ? null : await loadLogo(settings.logoUrl)
  const { canvas, height } = drawFinancialReport(report, settings, logo, mode)
  const cropped = document.createElement('canvas')
  cropped.width = canvas.width
  cropped.height = height
  cropped.getContext('2d').drawImage(canvas, 0, 0, canvas.width, height, 0, 0, canvas.width, height)
  return cropped.toDataURL('image/png')
}

export async function printThermalFinancialReport(report, mode = 'combined') {
  const settings = getPrinterSettings()
  if (!settings.enabled) throw new Error('الطابعة الحرارية غير مفعّلة')
  if (settings.connection === 'usb' && !settings.printerName) throw new Error('اختر طابعة USB من الإعدادات')
  await readyFont()
  const logo = settings.showLogo === false ? null : await loadLogo(settings.logoUrl)
  let response
  try {
    response = await fetch(`${settings.agentUrl.replace(/\/$/, '')}/print`, {
      method: 'POST',
      mode: 'cors',
      targetAddressSpace: 'loopback',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...printerTarget(settings), copies: 1,
        dataBase64: rasterFinancialReport(report, settings, logo, mode),
      }),
    })
  } catch {
    throw new Error('وكيل الطباعة لا يعمل على هذا الجهاز — شغّل برنامج الطباعة')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'تعذّر الاتصال بطابعة الفواتير')
  return { ...result, printerId: printerLabel(settings) }
}

/* ── Shift close ("تصفير الوردية") ─────────────────────────────
   What the drawer should hold, what was counted, and the difference — the
   slip the cashier signs and hands over with the cash. */
function drawShiftReport(shift, settings, logo) {
  const width = Number(settings.paperWidth) === 58 ? 384 : 576
  const s = shift.summary || {}
  const byType = s.byType || []
  const { canvas, ctx } = newCanvas(width, 1700 + byType.length * 50 + (shift.notes ? 140 : 0))
  const p = painter(ctx, width)

  drawHeader(ctx, p, width, settings, logo)
  p.rule(3)
  p.line(`تقرير إغلاق الوردية رقم ${shift.number}`, { size: 28, bold: true, gap: 8 })
  if (shift.businessDay) p.line(shift.businessDay, { size: 20, gap: 6 })
  p.pair('فُتحت', `${shopTime(shift.openedAt)} · ${shift.openedByName || '—'}`, { size: 20 })
  if (shift.closedAt) p.pair('أُغلقت', `${shopTime(shift.closedAt)} · ${shift.closedByName || '—'}`, { size: 20 })
  p.rule(2)

  p.pair('عدد الطلبات', s.ordersCount || 0, { size: 22, bold: true })
  if (s.cancelledCount) p.pair('طلبات ملغاة', s.cancelledCount, { size: 20 })
  for (const line of byType) {
    p.pair(`${ORDER_TYPE_LABEL[line.orderType] || line.orderType} (${line.count})`, money(line.total), { size: 20 })
  }
  p.dashes()
  if (s.discounts > 0) p.pair('الخصومات', `− ${money(s.discounts)}`, { size: 20 })
  p.pair('المبيعات', money(s.sales), { size: 23, bold: true })
  p.pair('نقداً', money(s.cashSales), { size: 20 })
  p.pair('بطاقة', money(s.cardSales), { size: 20 })
  if (s.unpaidSales > 0) p.pair('آجل', money(s.unpaidSales), { size: 20 })
  if (s.returnCount > 0) {
    p.pair(`مرتجعات نقدية (${s.returnCount})`, `− ${money(s.cashRefunds)}`, { size: 20 })
    if (s.cardRefunds > 0) p.pair('مرتجعات بطاقة', `− ${money(s.cardRefunds)}`, { size: 20 })
  }
  p.pair('صافي المبيعات', money(s.netSales), { size: 23, bold: true })

  p.rule(2)
  p.line('الدرج', { size: 24, bold: true, gap: 8 })
  p.pair('رصيد الافتتاح', money(shift.openingCash), { size: 21 })
  p.pair('+ مبيعات نقدية', money(s.cashSales), { size: 21 })
  if (s.cashRefunds > 0) p.pair('− مرتجعات نقدية', money(s.cashRefunds), { size: 21 })
  p.banner('المفروض بالدرج', money(shift.expectedCash), { size: 26 })
  if (shift.countedCash !== null && shift.countedCash !== undefined) {
    p.space(4)
    p.pair('المعدود فعلياً', money(shift.countedCash), { size: 23, bold: true })
    const diff = Number(shift.difference) || 0
    p.pair(diff === 0 ? 'الفرق' : diff > 0 ? 'زيادة' : 'نقص',
      diff === 0 ? 'مطابق' : money(Math.abs(diff)), { size: 23, bold: true })
  }

  if (shift.notes) {
    p.space(6)
    p.box(() => p.line(`ملاحظات: ${shift.notes}`, { size: 20, bold: true, align: 'right', gap: 4 }))
  }

  p.space(24)
  p.pair('توقيع الكاشير', '............', { size: 20 })
  p.space(10)
  p.pair('توقيع المستلم', '............', { size: 20 })
  p.space(10)
  p.rule(3)
  p.line(`طُبع ${new Date().toLocaleString('ar-EG')}`, { size: 17, gap: 10 })

  return { canvas, height: Math.min(canvas.height, p.y + 24) }
}

export async function printThermalShiftReport(shift) {
  const settings = getPrinterSettings()
  if (!settings.enabled) throw new Error('الطابعة الحرارية غير مفعّلة')
  if (settings.connection === 'usb' && !settings.printerName) throw new Error('اختر طابعة USB من الإعدادات')
  await readyFont()
  const logo = settings.showLogo === false ? null : await loadLogo(settings.logoUrl)
  const { canvas, height } = drawShiftReport(shift, settings, logo)
  const response = await fetch(`${settings.agentUrl.replace(/\/$/, '')}/print`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...printerTarget(settings), copies: 1, dataBase64: toEscPosBanded(canvas, height, settings) }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.message || 'تعذّر الاتصال بالطابعة')
  return result
}

export async function testPrintAgent(settings = getPrinterSettings()) {
  let response
  try {
    response = await fetch(`${settings.agentUrl.replace(/\/$/, '')}/health`, {
      mode: 'cors',
      targetAddressSpace: 'loopback',
    })
  } catch {
    /* A blocked request and a stopped program look identical from here, so
       the message names the thing the person can actually check. */
    throw new Error('برنامج الطباعة شغّال لكن Chrome يمنع الوصول المحلي. من إعدادات الموقع فعّل «الوصول إلى الشبكة المحلية / Loopback network» ثم حدّث الصفحة.')
  }
  if (!response.ok) throw new Error('برنامج الطباعة يرد بخطأ')
  return response.json()
}




