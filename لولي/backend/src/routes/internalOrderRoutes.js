'use strict';

const router  = require('express').Router();
const QRCode  = require('qrcode');
const mongoose = require('mongoose');

const { protect, requirePOS, requireAdmin } = require('../middleware/auth');
const InternalOrder = require('../models/InternalOrder');
const Product       = require('../models/Product');
const SalesCenter   = require('../models/SalesCenter');
const cashService   = require('../services/cashService');
const cacheService  = require('../services/cacheService');
const CustomerOrder = require('../models/CustomerOrder');
const ProfitShareSettings = require('../models/ProfitShareSettings');
const shiftService = require('../services/shiftService');
const businessDay = require('../services/businessDay');
const financeService = require('../services/financeService');

const STATUSES = InternalOrder.STATUSES;
const CALENDAR_DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const calendarStart = value => CALENDAR_DAY_KEY.test(String(value || ''))
  ? new Date(`${value}T00:00:00+03:00`)
  : null;
const calendarEndExclusive = value => {
  if (!CALENDAR_DAY_KEY.test(String(value || ''))) return null;
  const [y,m,d] = String(value).split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0,10);
  return new Date(`${next}T00:00:00+03:00`);
};


/* "آجل" means the money hasn't arrived yet, so nothing hits the drawer. */
const isPaid = method => method === 'cash' || method === 'card';

async function restoreOrderStock(order) {
  if (order.centerId) {
    const center = await SalesCenter.findById(order.centerId);
    if (!center) throw new Error('الفرع المرتبط بالطلب غير موجود');

    for (const line of order.items) {
      const idx = center.inventory.findIndex(item => String(item.productId) === String(line.productId));
      if (idx >= 0) {
        center.inventory[idx].quantity += Number(line.quantity) || 0;
      } else {
        center.inventory.push({
          productId: line.productId,
          productNameSnapshot: line.name,
          quantity: Number(line.quantity) || 0,
        });
      }
    }
    center.markModified('inventory');
    await center.save();
    return;
  }

  for (const line of order.items) {
    await Product.updateOne({ _id: line.productId }, { $inc: { availableQuantity: line.quantity } });
  }
}

async function consumeOrderStock(order) {
  if (order.centerId) {
    const center = await SalesCenter.findById(order.centerId);
    if (!center) throw new Error('الفرع المرتبط بالطلب غير موجود');

    for (const line of order.items) {
      const idx = center.inventory.findIndex(item => String(item.productId) === String(line.productId));
      if (idx < 0 || Number(center.inventory[idx].quantity) < Number(line.quantity)) {
        throw new Error(`لا توجد كمية كافية من "${line.name}" في مخزون الفرع`);
      }
    }
    for (const line of order.items) {
      const idx = center.inventory.findIndex(item => String(item.productId) === String(line.productId));
      center.inventory[idx].quantity -= Number(line.quantity) || 0;
    }
    center.markModified('inventory');
    await center.save();
    return;
  }

  const applied = [];
  for (const line of order.items) {
    const ok = await Product.findOneAndUpdate(
      { _id: line.productId, availableQuantity: { $gte: line.quantity } },
      { $inc: { availableQuantity: -line.quantity } }
    );
    if (!ok) {
      for (const done of applied) {
        await Product.updateOne({ _id: done.productId }, { $inc: { availableQuantity: done.quantity } });
      }
      throw new Error(`لا توجد كمية كافية من "${line.name}" لإعادة تفعيل الطلب`);
    }
    applied.push(line);
  }
}

/* Supervisors run the counter, so staff-level access is right here. */
router.use(protect, requirePOS);

/* ── GET /api/internal-orders ── */
router.get('/', async (req, res) => {
  const { status, date, startDate, endDate, limit = 100 } = req.query;

  const filter = {};
  if (status && STATUSES.includes(status)) filter.status = status;
  if (startDate || endDate) {
    filter.createdAt = {};
    const start = calendarStart(startDate);
    const end = calendarEndExclusive(endDate);
    if (start && !Number.isNaN(start.getTime())) filter.createdAt.$gte = start;
    if (end && !Number.isNaN(end.getTime())) filter.createdAt.$lt = end;
    if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
  } else if (date) {
    const { start, end } = await businessDay.range(date === 'today' ? undefined : date);
    filter.createdAt = { $gte: start, $lt: end };
  }

  const orders = await InternalOrder.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500));

  res.json({ success: true, orders });
});

/* ── GET /api/internal-orders/daily-report?date=YYYY-MM-DD ──
   Everything sold that day — counter orders and website orders — with the
   investor's cut of each one, for the end-of-day printout. Cancelled orders
   are left out. Must sit above /:idOrNumber so "daily-report" isn't read as an id. */
router.get('/daily-report', async (req, res) => {
  const day = CALENDAR_DAY_KEY.test(String(req.query.date || ''))
    ? String(req.query.date)
    : new Date(Date.now() + businessDay.SHOP_OFFSET_MS).toISOString().slice(0, 10);
  const start = calendarStart(day);
  const end = calendarEndExclusive(day);

  const [settings, pos, site] = await Promise.all([
    ProfitShareSettings.getSingleton(),
    InternalOrder.find({ createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } }).sort({ createdAt: 1 }),
    CustomerOrder.find({ createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } }).sort({ createdAt: 1 }),
  ]);

  const inv = settings.investor || {};
  const invOn = inv.enabled !== false;
  const deliveryPct = invOn ? Number(inv.deliveryPercent ?? 15.5) : 0;
  const internalPct = invOn ? Number(inv.internalPercent ?? 20.5) : 0;
  const rateForPos = orderType => orderType === 'dine_in' ? internalPct : deliveryPct;
  const share = (amount, pct) => Math.round((amount || 0) * pct / 100);
  const grossOf = order => Number(order.total || 0) || 0;
  const siteGrossOf = order => Number(order.totalPrice || order.totalAmount || 0) || 0;

  const orders = [
    ...pos.map(o => ({
      kind: 'pos', number: o.orderNumber, at: o.createdAt, orderType: o.orderType,
      paymentMethod: o.paymentMethod, customerName: o.customerName || '',
      items: o.items.map(i => ({ name: i.name, quantity: i.quantity })),
      total: o.total || 0,
      investorBase: grossOf(o),
      investorPercent: rateForPos(o.orderType),
      investorShare: share(grossOf(o), rateForPos(o.orderType)),
    })),
    ...site.map(o => ({
      kind: 'site', number: 'موقع', at: o.createdAt, orderType: 'site',
      paymentMethod: '', customerName: o.customerName || '',
      items: [{ name: o.productNameSnapshot, quantity: o.quantity }],
      total: o.totalPrice || o.totalAmount || 0,
      investorBase: siteGrossOf(o),
      investorPercent: deliveryPct,
      investorShare: share(siteGrossOf(o), deliveryPct),
    })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  const sum = (list, k) => list.reduce((s, o) => s + (o[k] || 0), 0);
  const posList = orders.filter(o => o.kind === 'pos');
  const siteList = orders.filter(o => o.kind === 'site');
  const deliveryList = orders.filter(o => o.kind === 'site' || o.orderType === 'takeaway' || o.orderType === 'delivery');
  const internalList = orders.filter(o => o.kind === 'pos' && o.orderType === 'dine_in');

  res.json({
    success: true,
    date: day,
    investor: {
      enabled: invOn,
      name: inv.name || 'الأميركان',
      deliveryPercent: deliveryPct,
      takeawayPercent: deliveryPct,
      internalPercent: internalPct,
      // legacy aliases for old print layouts
      posPercent: internalPct,
      sitePercent: deliveryPct,
    },
    orders,
    totals: {
      count: orders.length,
      sales: sum(orders, 'total'),
      // New operational split requested by Luliz. Historical and today's
      // orders are recalculated live into these two buckets.
      internal: { percent: internalPct, count: internalList.length, sales: sum(internalList, 'total'), base: sum(internalList, 'investorBase'), investorShare: sum(internalList, 'investorShare') },
      external: { percent: deliveryPct, count: deliveryList.length, sales: sum(deliveryList, 'total'), base: sum(deliveryList, 'investorBase'), investorShare: sum(deliveryList, 'investorShare') },
      delivery: { percent: deliveryPct, count: deliveryList.length, sales: sum(deliveryList, 'total'), base: sum(deliveryList, 'investorBase'), investorShare: sum(deliveryList, 'investorShare') },
      // Legacy buckets kept for backwards compatibility.
      pos: { count: posList.length, sales: sum(posList, 'total'), investorShare: sum(posList, 'investorShare') },
      site: { count: siteList.length, sales: sum(siteList, 'total'), investorShare: sum(siteList, 'investorShare') },
      investorShare: sum(orders, 'investorShare'),
    },
  });
});

/* ── GET /api/internal-orders/:idOrNumber ── */
router.get('/:key', async (req, res) => {
  const { key } = req.params;
  const order = mongoose.isValidObjectId(key)
    ? await InternalOrder.findById(key)
    : await InternalOrder.findOne({ orderNumber: key });

  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  res.json({ success: true, order });
});

/* ── POST /api/internal-orders ── */
router.post('/', async (req, res) => {
  const {
    items, discount = 0, customerName = '', customerPhone = '',
    orderType = 'takeaway', paymentMethod = 'cash', notes = '',
    fulfillmentType = 'asap', scheduledFor = null,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'أضف صنفاً واحداً على الأقل' });
  }

  /* Validate the requested time before anything is written or stock moves. */
  let dueAt = null;
  if (fulfillmentType === 'scheduled') {
    if (!scheduledFor) {
      return res.status(400).json({ success: false, message: 'اختر موعد الطلب' });
    }
    dueAt = new Date(scheduledFor);
    if (Number.isNaN(dueAt.getTime())) {
      return res.status(400).json({ success: false, message: 'الموعد غير صحيح' });
    }
    // A minute of slack so a "now"-ish pick isn't rejected on a slow click.
    if (dueAt.getTime() < Date.now() - 60_000) {
      return res.status(400).json({ success: false, message: 'الموعد في الماضي — اختر وقتاً قادماً' });
    }
  }

  /* 1 — resolve products and validate stock before touching anything */
  const ids = [...new Set(items.map(i => i.productId))];
  const products = await Product.find({ _id: { $in: ids } });
  const byId = new Map(products.map(p => [String(p._id), p]));

  const lines = [];
  for (const item of items) {
    const product = byId.get(String(item.productId));
    if (!product) {
      return res.status(400).json({ success: false, message: `صنف غير موجود في القائمة` });
    }

    const quantity = Number(item.quantity) || 0;
    if (quantity < 1) {
      return res.status(400).json({ success: false, message: `الكمية غير صحيحة لـ ${product.name}` });
    }
    if (product.availableQuantity < quantity) {
      return res.status(409).json({
        success: false,
        message: `الكمية المتاحة من "${product.name}" هي ${product.availableQuantity} فقط`,
      });
    }

    /* Price is derived from the product + its selected modifiers here, on
       the server, never taken from the client — otherwise a tampered
       request could ring up any price it likes. */
    const requestedModifierIds = Array.isArray(item.modifierIds) ? item.modifierIds.map(String) : [];
    const chosenModifiers = (product.modifiers || []).filter(
      m => m.isActive && requestedModifierIds.includes(String(m._id))
    );
    const modifiersPriceDelta = chosenModifiers.reduce((s, m) => s + (m.priceDelta || 0), 0);
    const modifiersCostDelta  = chosenModifiers.reduce((s, m) => s + (m.costDelta || 0), 0);

    const unitPrice = Math.max(0, (Number(product.directPrice) || 0) + modifiersPriceDelta);
    const unitCost  = Math.max(0, (Number(product.calculatedCost) || 0) + modifiersCostDelta);
    lines.push({
      productId: product._id,
      name:      product.name,
      unitPrice,
      unitCost,
      modifiers: chosenModifiers.map(m => ({ name: m.name, priceDelta: m.priceDelta || 0, costDelta: m.costDelta || 0 })),
      quantity,
      lineTotal: unitPrice * quantity,
      notes:     item.notes || '',
    });
  }

  const subtotal  = lines.reduce((s, l) => s + l.lineTotal, 0);
  const disc      = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total     = subtotal - disc;
  const totalCost = lines.reduce((s, l) => s + l.unitCost * l.quantity, 0);
  const profit    = total - totalCost;

  /* 2 — take the stock. Conditional update so two tills can't oversell
         the same last piece: the write only lands if stock is still there. */
  const applied = [];
  for (const line of lines) {
    const ok = await Product.findOneAndUpdate(
      { _id: line.productId, availableQuantity: { $gte: line.quantity } },
      { $inc: { availableQuantity: -line.quantity } },
      { new: true }
    );
    if (!ok) {
      // Roll back whatever we already deducted, then report the clash.
      for (const done of applied) {
        await Product.updateOne({ _id: done.productId }, { $inc: { availableQuantity: done.quantity } });
      }
      return res.status(409).json({
        success: false,
        message: `نفدت الكمية من "${line.name}" أثناء إتمام الطلب`,
      });
    }
    applied.push(line);
  }

  /* 3 — create the order inside the currently open cashier shift.
     If the cashier starts selling without explicitly opening one, a zero-float
     shift is opened automatically so no sale can escape shift accounting. */
  const shift = await shiftService.ensureOpen(null, req.user);
  const orderNumber = await InternalOrder.nextOrderNumber();
  const qrPayload   = orderNumber;

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 320, margin: 1,
      color: { dark: '#352017', light: '#FFFFFF' },
    });
  } catch { /* a missing QR must not block the sale */ }

  const order = await InternalOrder.create({
    shiftId: shift?._id || null,
    orderNumber, qrPayload, qrDataUrl,
    items: lines,
    subtotal, discount: disc, total, totalCost, profit,
    customerName, customerPhone, orderType, paymentMethod, notes,
    fulfillmentType: dueAt ? 'scheduled' : 'asap',
    scheduledFor: dueAt || undefined,
    status: 'new',
    timeline: [{ status: 'new', at: new Date(), by: req.user.name }],
    createdBy: req.user._id,
    createdByName: req.user.name,
    stockApplied: true,
  });

  /* 4 — money in the drawer. Failing to log cash must not void a sale that
         already happened physically, so this is best-effort and flagged. */
  if (isPaid(paymentMethod) && order.total > 0) {
    try {
      await cashService.createTransaction(
        'sale_income', order.total, 'in',
        `طلب داخلي ${orderNumber} — ${lines.length} صنف`,
        'InternalOrder', order._id
      );
      order.cashPosted = true;
      await order.save();
    } catch (err) {
      console.error(`⚠️  تعذّر تسجيل نقدية الطلب ${orderNumber}:`, err.message);
    }
  }

  cacheService.invalidate('products:'); // stock changed — storefront must drop sold-out items now
  res.status(201).json({ success: true, order, message: `تم إنشاء الطلب ${orderNumber}` });
});

/* ── PUT /api/internal-orders/:id — edit an existing POS order ── */
router.put('/:id', async (req, res) => {
  const order = await InternalOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  if (order.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'الطلب الملغى للعرض فقط. أعد تفعيله قبل تعديله.' });
  }

  const {
    items,
    discount = order.discount,
    customerName = order.customerName || '',
    customerPhone = order.customerPhone || '',
    orderType = order.orderType,
    paymentMethod = order.paymentMethod,
    notes = order.notes || '',
    fulfillmentType = order.fulfillmentType || 'asap',
    scheduledFor = order.scheduledFor || null,
  } = req.body;

  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ success: false, message: 'أضف صنفاً واحداً على الأقل' });
  }
  if (!['dine_in','takeaway','delivery'].includes(orderType)) {
    return res.status(400).json({ success: false, message: 'نوع الطلب غير صحيح' });
  }
  if (!['cash','card','unpaid'].includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: 'طريقة الدفع غير صحيحة' });
  }

  let dueAt = null;
  if (fulfillmentType === 'scheduled') {
    dueAt = new Date(scheduledFor);
    if (!scheduledFor || Number.isNaN(dueAt.getTime())) {
      return res.status(400).json({ success: false, message: 'موعد الطلب غير صحيح' });
    }
  }

  const ids = [...new Set(items.map(i => String(i.productId || '')))].filter(Boolean);
  const products = await Product.find({ _id: { $in: ids } });
  const byId = new Map(products.map(p => [String(p._id), p]));
  const oldByProduct = new Map((order.items || []).map(i => [String(i.productId), i]));

  const lines = [];
  for (const item of items) {
    const product = byId.get(String(item.productId));
    if (!product) return res.status(400).json({ success: false, message: 'أحد الأصناف لم يعد موجوداً' });
    const quantity = Number(item.quantity) || 0;
    if (quantity < 1) return res.status(400).json({ success: false, message: `الكمية غير صحيحة لـ ${product.name}` });

    const oldLine = oldByProduct.get(String(product._id));
    const modifiers = oldLine?.modifiers?.map(m => m.toObject ? m.toObject() : { ...m }) || [];
    const unitPrice = oldLine ? Number(oldLine.unitPrice) || 0 : Number(product.directPrice) || 0;
    const unitCost = oldLine ? Number(oldLine.unitCost) || 0 : Number(product.calculatedCost) || 0;
    lines.push({
      productId: product._id,
      name: product.name,
      unitPrice,
      unitCost,
      modifiers,
      quantity,
      lineTotal: unitPrice * quantity,
      notes: String(item.notes ?? oldLine?.notes ?? '').trim(),
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const restaurantAmount = subtotal - disc;
  const totalCost = lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
  const quote = await financeService.quote(restaurantAmount, order.centerId);

  const oldTotal = Number(order.total) || 0;
  const oldCashPosted = Boolean(order.cashPosted);
  const oldItems = (order.items || []).map(item => item.toObject ? item.toObject() : { ...item });

  if (order.stockApplied) {
    await restoreOrderStock(order);
    order.items = lines;
    try {
      await consumeOrderStock(order);
    } catch (err) {
      order.items = oldItems;
      try { await consumeOrderStock(order); } catch {}
      return res.status(409).json({ success: false, message: err.message || 'المخزون لا يكفي لتنفيذ التعديل' });
    }
  }

  order.items = lines;
  order.subtotal = subtotal;
  order.discount = disc;
  order.netAmount = quote.baseAmount;
  order.invoiceTaxPercent = quote.invoiceTaxPercent;
  order.invoiceTaxAmount = quote.invoiceTaxAmount;
  order.consumptionTaxPercent = quote.consumptionTaxPercent;
  order.consumptionTaxAmount = quote.consumptionTaxAmount;
  order.localAdminPercent = quote.localAdminPercent;
  order.localAdminAmount = quote.localAdminAmount;
  order.total = quote.customerTotal;
  order.totalCost = totalCost;
  order.profit = quote.baseAmount - totalCost;
  order.customerName = String(customerName || '').trim();
  order.customerPhone = String(customerPhone || '').trim();
  order.orderType = orderType;
  order.paymentMethod = paymentMethod;
  order.notes = String(notes || '').trim();
  order.fulfillmentType = fulfillmentType === 'scheduled' ? 'scheduled' : 'asap';
  order.scheduledFor = dueAt || undefined;
  order.timeline.push({ status: order.status, at: new Date(), by: `${req.user.name} — تعديل الطلب` });

  await order.save();

  let cashWarning = '';
  try {
    const newPaid = isPaid(paymentMethod);
    if (oldCashPosted && newPaid) {
      const delta = Number(order.total) - oldTotal;
      if (delta > 0.009) {
        await cashService.createTransaction('sale_income', delta, 'in', `فرق تعديل طلب ${order.orderNumber}`, 'InternalOrder', order._id, order.centerId);
      } else if (delta < -0.009) {
        await cashService.createTransaction('adjustment', Math.abs(delta), 'out', `إرجاع فرق تعديل طلب ${order.orderNumber}`, 'InternalOrder', order._id, order.centerId);
      }
      order.cashPosted = true;
    } else if (oldCashPosted && !newPaid) {
      await cashService.createTransaction('adjustment', oldTotal, 'out', `تحويل طلب ${order.orderNumber} إلى آجل`, 'InternalOrder', order._id, order.centerId);
      order.cashPosted = false;
    } else if (!oldCashPosted && newPaid) {
      await cashService.createTransaction('sale_income', order.total, 'in', `تحصيل طلب ${order.orderNumber} بعد التعديل`, 'InternalOrder', order._id, order.centerId);
      order.cashPosted = true;
    }
    await order.save();
  } catch (err) {
    cashWarning = ' — تم تعديل الطلب لكن تعذّر تسجيل فرق الكاش، راجع سجل الصندوق';
    console.error(`⚠️ تعذّر تسجيل فرق تعديل ${order.orderNumber}:`, err.message);
  }

  cacheService.invalidate('products:');
  res.json({
    success: true,
    order,
    message: `تم تعديل الطلب وإعادة احتساب المخزون والمالية${cashWarning}`,
  });
});

/* ── PUT /api/internal-orders/:id/status ── */
router.put('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'الحالة غير صحيحة' });
  }

  const order = await InternalOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  if (order.status === status) {
    return res.json({ success: true, order, message: 'الحالة كما هي' });
  }

  // Cancelling puts the stock back — into the same branch it came from.
  if (status === 'cancelled' && order.stockApplied) {
    await restoreOrderStock(order);
    order.stockApplied = false;
  }

  // …and takes the money back out. A reversal entry, not a deletion, so the
  // cash journal still shows what happened.
  if (status === 'cancelled' && order.cashPosted) {
    try {
      await cashService.createTransaction(
        'adjustment', order.total, 'out',
        `إلغاء طلب داخلي ${order.orderNumber}`,
        'InternalOrder', order._id
      );
      order.cashPosted = false;
    } catch (err) {
      console.error(`⚠️  تعذّر عكس نقدية الطلب ${order.orderNumber}:`, err.message);
    }
  }

  // Un-cancelling takes it out again from the same branch/HQ inventory.
  if (order.status === 'cancelled' && status !== 'cancelled' && !order.stockApplied) {
    try {
      await consumeOrderStock(order);
    } catch (err) {
      return res.status(409).json({ success: false, message: err.message });
    }
    order.stockApplied = true;

    // Re-post the revenue that the cancellation reversed.
    if (isPaid(order.paymentMethod) && order.total > 0 && !order.cashPosted) {
      try {
        await cashService.createTransaction(
          'sale_income', order.total, 'in',
          `إعادة تفعيل طلب داخلي ${order.orderNumber}`,
          'InternalOrder', order._id
        );
        order.cashPosted = true;
      } catch (err) {
        console.error(`⚠️  تعذّر إعادة تسجيل نقدية ${order.orderNumber}:`, err.message);
      }
    }
  }

  order.status = status;
  order.timeline.push({ status, at: new Date(), by: req.user.name });
  await order.save();

  const labels = {
    new: 'جديد', preparing: 'قيد التجهيز', ready: 'تم التجهيز',
    delivered: 'تم التسليم', cancelled: 'ملغى',
  };
  cacheService.invalidate('products:');
  res.json({ success: true, order, message: `الطلب الآن: ${labels[status]}` });
});

/* ── Today's counters for the POS header ── */
router.get('/stats/today', async (req, res) => {
  const { start, end } = await businessDay.current();
  const orders = await InternalOrder.find({ createdAt: { $gte: start, $lt: end } });
  const active = orders.filter(o => o.status !== 'cancelled');

  res.json({
    success: true,
    stats: {
      count:     active.length,
      revenue:   active.reduce((s, o) => s + o.total, 0),
      cost:      active.reduce((s, o) => s + (o.totalCost || 0), 0),
      profit:    active.reduce((s, o) => s + (o.profit || 0), 0),
      unpaid:    active.filter(o => o.paymentMethod === 'unpaid')
                       .reduce((s, o) => s + o.total, 0),
      new:       orders.filter(o => o.status === 'new').length,
      preparing: orders.filter(o => o.status === 'preparing').length,
      ready:     orders.filter(o => o.status === 'ready').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
    },
  });
});

/* ── DELETE /api/internal-orders/:id — admin only ──
   Removes an order entirely (e.g. entered by mistake or a test). Its effects
   are undone first — stock goes back and the cash income is reversed with a
   journal entry — so deleting never leaves the books or stock wrong. */
router.delete('/:id', requireAdmin, async (req, res) => {
  const order = await InternalOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

  if (order.stockApplied) {
    await restoreOrderStock(order);
  }

  if (order.cashPosted) {
    await cashService.createTransaction(
      'adjustment', order.total, 'out',
      `حذف طلب داخلي ${order.orderNumber}`,
      'InternalOrder', order._id
    );
  }

  await order.deleteOne();
  cacheService.invalidate('products:');
  res.json({ success: true, message: `تم حذف الطلب ${order.orderNumber}` });
});

module.exports = router;
