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
    response = await fetch(`${settings.agentUrl.replace(/\/$/, '')}/printers`)
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    response = await fetch(`${settings.agentUrl.replace(/\/$/, '')}/health`)
  } catch {
    throw new Error('لا يمكن الوصول لبرنامج الطباعة — تأكد أن start-print-agent.bat شغال على نفس جهاز الكاشير')
  }
  if (!response.ok) throw new Error('برنامج الطباعة يرد بخطأ')
  return response.json()
}




