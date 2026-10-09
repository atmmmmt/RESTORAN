'use strict';

const router  = require('express').Router();
const QRCode  = require('qrcode');
const mongoose = require('mongoose');

const { protect, requirePos, requireKitchen, requireRole } = require('../middleware/auth');
const InternalOrder = require('../models/InternalOrder');
const Product       = require('../models/Product');
const SalesCenter   = require('../models/SalesCenter');
const cashService   = require('../services/cashService');
const inventoryService = require('../services/inventoryService');
const CustomerOrder = require('../models/CustomerOrder');
const InvestorSettings = require('../models/InvestorSettings');
const ReturnRecord     = require('../models/ReturnRecord');
const businessDay      = require('../services/businessDay');
const shiftService     = require('../services/shiftService');
const financeService   = require('../services/financeService');

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

const inferKitchenSection = product => {
  if (['pastries','grills','appetizers','drinks','other'].includes(product?.kitchenSection)) {
    return product.kitchenSection;
  }
  const text = `${product?.category || ''} ${product?.name || ''}`.toLowerCase();
  if (/(مشروب|مشروبات|كولا|بيبسي|مياه|ماء|لبن|عيران|عصير)/.test(text)) return 'drinks';
  if (/(مشاوي|مشوي|كباب|شقف|شيش|سودة|جوانح|جناح|لحم مشوي)/.test(text)) return 'grills';
  if (/(مقبلات|مقبل|مازة|سلطة|فتوش|حمص|متبل|بابا غنوج|بطاطا)/.test(text)) return 'appetizers';
  if (/(معجنات|معجن|فطاير|فطائر|منقوش|مناقيش|بيتزا|صفيحة|صفيح|سفيحة|عجين)/.test(text)) return 'pastries';
  return 'other';
};

const boundCenterId = user => user?.centerId ? String(user.centerId) : null;
const canAccessOrder = (user, order) => {
  const assigned = boundCenterId(user);
  return !assigned || String(order.centerId || '') === assigned;
};

function applyCenterScope(req, filter) {
  const assigned = boundCenterId(req.user);
  if (assigned) filter.centerId = assigned;
  else if (req.query.center && req.query.center !== 'all') {
    filter.centerId = req.query.center === 'hq' ? null : req.query.center;
  }
}

function businessDayCenter(req) {
  const assigned = boundCenterId(req.user);
  if (assigned) return assigned;
  const asked = req.query.center;
  return asked && asked !== 'all' && asked !== 'hq' && mongoose.isValidObjectId(asked)
    ? String(asked)
    : null;
}


/* Orders created before the branch switcher existed may have centerId=null.
   Those legacy counter orders belong to the Americans branch. Adopt only the
   requested day's unassigned orders, and only when the active branch is the
   Americans branch. */
async function adoptLegacyAmericansOrders(req, start, end) {
  const centerId = boundCenterId(req.user);
  if (!centerId || !mongoose.isValidObjectId(centerId) || !start || !end) return 0;

  const center = await SalesCenter.findById(centerId).select('name');
  const name = String(center?.name || '');
  if (!/(الأميركان|اميركان|american)/i.test(name)) return 0;

  const result = await InternalOrder.updateMany(
    {
      centerId: null,
      createdAt: { $gte: start, $lt: end },
    },
    { $set: { centerId } }
  );
  return Number(result.modifiedCount || 0);
}

function presentOrder(order, role) {
  const value = order?.toObject ? order.toObject({ virtuals: true }) : { ...order };
  if (['cashier', 'kitchen'].includes(role)) {
    delete value.totalCost;
    delete value.profit;
    value.items = (value.items || []).map(item => {
      const safe = { ...item };
      delete safe.unitCost;
      return safe;
    });
  }
  return value;
}

/* Supervisors run the counter, so staff-level access is right here. */
router.use(protect);

/* ── GET /api/internal-orders ── */
router.get('/', requireRole('admin', 'supervisor', 'cashier', 'kitchen', 'viewer'), async (req, res) => {
  const { status, date, startDate, endDate, limit = 100 } = req.query;

  const filter = {};
  applyCenterScope(req, filter);
  if (status && STATUSES.includes(status)) filter.status = status;
  if (startDate || endDate) {
    filter.createdAt = {};
    const start = calendarStart(startDate);
    const end = calendarEndExclusive(endDate);
    if (start && !Number.isNaN(start.getTime())) filter.createdAt.$gte = start;
    if (end && !Number.isNaN(end.getTime())) filter.createdAt.$lt = end;
    if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
  } else if (date) {
    const { start, end } = await businessDay.range(date === 'today' ? undefined : date, businessDayCenter(req));
    filter.createdAt = { $gte: start, $lt: end };
  }
  if (req.query.shift && mongoose.isValidObjectId(req.query.shift)) filter.shiftId = req.query.shift;

  if (filter.createdAt?.$gte && filter.createdAt?.$lt) {
    await adoptLegacyAmericansOrders(req, filter.createdAt.$gte, filter.createdAt.$lt);
  }

  const orders = await InternalOrder.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500));

  res.json({ success: true, orders: orders.map(order => presentOrder(order, req.user.role)) });
});

/* ── GET /api/internal-orders/daily-report?date=YYYY-MM-DD ──
   Everything sold that working day — counter orders and website orders — with
   the partner's cut of each at the rate for its order type, for the end-of-day
   printout. Cancelled orders are left out. The day runs on the shop's opening
   hours (Damascus time), so a night past midnight is still one report. Must
   sit above /:key so "daily-report" isn't read as an id. */
router.get('/daily-report', requireRole('admin', 'supervisor', 'cashier', 'viewer'), async (req, res) => {
  // Daily print is a calendar-day document, independent of cashier shifts.
  // This intentionally includes orders rung before the first shift opened.
  const day = CALENDAR_DAY_KEY.test(String(req.query.date || ''))
    ? String(req.query.date)
    : new Date(Date.now() + businessDay.SHOP_OFFSET_MS).toISOString().slice(0, 10);
  const start = calendarStart(day);
  const end = calendarEndExclusive(day);

  await adoptLegacyAmericansOrders(req, start, end);

  const posFilter = { createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } };
  applyCenterScope(req, posFilter);
  const siteFilter = { createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } };
  if (posFilter.centerId !== undefined) siteFilter.centerId = posFilter.centerId;

  const returnFilter = { createdAt: { $gte: start, $lt: end } };
  if (posFilter.centerId !== undefined) returnFilter.centerId = posFilter.centerId;

  const [settings, pos, site, refunds] = await Promise.all([
    InvestorSettings.getSingleton(),
    InternalOrder.find(posFilter).sort({ createdAt: 1 }),
    CustomerOrder.find(siteFilter).sort({ createdAt: 1 }),
    ReturnRecord.find(returnFilter).sort({ createdAt: 1 }),
  ]);

  const { rateOf, cut } = shiftService;

  const orders = [
    ...pos.map(o => {
      const pct = rateOf(o, settings);
      return {
        kind: 'pos', number: o.orderNumber, at: o.createdAt, orderType: o.orderType,
        items: (o.items || []).map(i => ({ name: i.name, quantity: i.quantity })),
        discount: o.discount || 0,
        total: o.total || 0,
        paymentMethod: o.paymentMethod || '',
        investorBase: Number(o.total || 0),
        investorPercent: pct,
        investorShare: cut(Number(o.total || 0), pct),
      };
    }),
    ...site.map(o => {
      const pct = settings.percentFor('site');
      return {
        kind: 'site', number: 'موقع', at: o.createdAt, orderType: 'site',
        items: [{ name: o.productNameSnapshot, quantity: o.quantity }],
        total: o.totalPrice || 0,
        paymentMethod: o.paymentMethod || '',
        investorBase: Number(o.totalPrice || 0),
        investorPercent: pct,
        investorShare: cut(Number(o.totalPrice || 0), pct),
      };
    }),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  const sum = (list, k) => list.reduce((s, o) => s + (o[k] || 0), 0);

  /* Money handed back that day. The gross figure is what was rung up; the
     net is what actually stayed in the till. Each refund comes off the
     partner's cut at the rate its own order was sold at — nobody owes a
     share of a refunded order. */
  const refundOrderIds = [...new Set(refunds.map(r => String(r.orderId)))];
  const refundOrders = refundOrderIds.length
    ? await InternalOrder.find({ _id: { $in: refundOrderIds } }).select('orderType investorPercent')
    : [];
  const refundOrderById = new Map(refundOrders.map(o => [String(o._id), o]));

  const returns = refunds.map(r => {
    const source = refundOrderById.get(String(r.orderId));
    const pct = source ? rateOf(source, settings) : 0;
    return {
      number: r.returnNumber, orderNumber: r.orderNumber, at: r.createdAt,
      orderType: source?.orderType || '',
      items: (r.items || []).map(i => ({ name: i.name, quantity: i.quantity })),
      amount: r.refundAmount || 0,
      refundMethod: r.refundMethod || '',
      investorShare: cut(r.refundAmount, pct),
    };
  });

  /* One line per order type: what was sold that way, at what rate, and what
     the partner is owed on it once refunds are taken off. */
  const byType = ['takeaway', 'dine_in', 'delivery', 'site'].map(type => {
    const sold = orders.filter(o => o.orderType === type);
    const back = returns.filter(r => r.orderType === type);
    const sales = sum(sold, 'total');
    const refunded = sum(back, 'amount');
    return {
      orderType: type,
      percent: settings.percentFor(type),
      count: sold.length,
      sales,
      refunded,
      netSales: sales - refunded,
      investorShare: sum(sold, 'investorShare') - sum(back, 'investorShare'),
    };
  }).filter(line => line.count > 0 || line.refunded > 0);

  const grossSales    = sum(orders, 'total');
  const refundedTotal = sum(returns, 'amount');
  const netSales      = grossSales - refundedTotal;
  const internalOrders = orders.filter(o => o.kind === 'pos' && o.orderType === 'dine_in');
  const externalOrders = orders.filter(o => o.kind === 'site' || o.orderType === 'takeaway' || o.orderType === 'delivery');
  const internalReturns = returns.filter(r => r.orderType === 'dine_in');
  const externalReturns = returns.filter(r => r.orderType === 'takeaway' || r.orderType === 'delivery' || r.orderType === 'site');
  const internalCash = internalOrders.filter(o => o.paymentMethod === 'cash');
  const externalCash = externalOrders.filter(o => o.paymentMethod === 'cash');
  const internalCashRefunds = internalReturns.filter(r => r.refundMethod === 'cash');
  const externalCashRefunds = externalReturns.filter(r => r.refundMethod === 'cash');

  res.json({
    success: true,
    date: day,
    range: { start, end },
    investor: settings.present(),
    orders,
    returns,
    byType,
    totals: {
      count: orders.length,
      posCount: orders.filter(o => o.kind === 'pos').length,
      siteCount: orders.filter(o => o.kind === 'site').length,
      sales: grossSales,
      discounts: sum(orders, 'discount'),
      returnCount: returns.length,
      refunded: refundedTotal,
      netSales,
      internal: {
        percent: settings.percentFor('dine_in'),
        count: internalOrders.length,
        sales: sum(internalOrders, 'total'),
        refunded: sum(internalReturns, 'amount'),
        total: sum(internalOrders, 'total') - sum(internalReturns, 'amount'),
        cash: sum(internalCash, 'total') - sum(internalCashRefunds, 'amount'),
        base: sum(internalOrders, 'investorBase') - sum(internalReturns, 'amount'),
        investorShare: sum(internalOrders, 'investorShare') - sum(internalReturns, 'investorShare'),
      },
      external: {
        percent: settings.percentFor('takeaway'),
        count: externalOrders.length,
        sales: sum(externalOrders, 'total'),
        refunded: sum(externalReturns, 'amount'),
        total: sum(externalOrders, 'total') - sum(externalReturns, 'amount'),
        cash: sum(externalCash, 'total') - sum(externalCashRefunds, 'amount'),
        base: sum(externalOrders, 'investorBase') - sum(externalReturns, 'amount'),
        investorShare: sum(externalOrders, 'investorShare') - sum(externalReturns, 'investorShare'),
      },
      investorShare: sum(orders, 'investorShare') - sum(returns, 'investorShare'),
    },
  });
});

/* ── GET /api/internal-orders/:idOrNumber ── */
router.get('/:key', requireRole('admin', 'supervisor', 'cashier', 'kitchen', 'viewer'), async (req, res) => {
  const { key } = req.params;
  const order = mongoose.isValidObjectId(key)
    ? await InternalOrder.findById(key)
    : await InternalOrder.findOne({ orderNumber: key });

  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  if (!canAccessOrder(req.user, order)) return res.status(403).json({ success: false, message: 'هذا الطلب تابع لفرع آخر' });
  res.json({ success: true, order: presentOrder(order, req.user.role) });
});

/* ── POST /api/internal-orders ── */
router.post('/', requirePos, async (req, res) => {
  const {
    items, discount = 0, discountType = 'amount', discountPercent = 0, discountReason = '',
    customerName = '', customerPhone = '',
    orderType = 'takeaway', paymentMethod = 'cash', notes = '',
    fulfillmentType = 'asap', scheduledFor = null, centerId: requestedCenterId = null,
  } = req.body;
  const centerId = boundCenterId(req.user) || requestedCenterId;

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
    const unitPrice = Number(item.unitPrice ?? product.directPrice) || 0;
    const unitCost  = Number(product.calculatedCost) || 0;
    lines.push({
      productId: product._id,
      name:      product.name,
      unitPrice,
      unitCost,
      quantity,
      lineTotal: unitPrice * quantity,
      notes:     item.notes || '',
      categorySnapshot: product.category || '',
      kitchenSection: inferKitchenSection(product),
    });
  }

  const subtotal  = lines.reduce((s, l) => s + l.lineTotal, 0);
  /* A percentage is worked out here, from prices the server trusts, rather
     than taken from the till as an amount. */
  const byPercent = discountType === 'percent';
  const pct       = byPercent ? Math.min(Math.max(Number(discountPercent) || 0, 0), 100) : 0;
  const requested = byPercent ? Math.round(subtotal * pct / 100) : Number(discount) || 0;
  const disc      = Math.min(Math.max(requested, 0), subtotal);
  const total     = subtotal - disc;
  const totalCost = lines.reduce((s, l) => s + l.unitCost * l.quantity, 0);
  const profit    = total - totalCost;

  /* 2 — never make the cashier wait for advisory stock bookkeeping.
     The sale is saved first; stock is reconciled immediately after the HTTP
     response in a best-effort post-processing task. */

  /* 3 — create the order, inside the shift that is running (opening one if
         the cashier hasn't), at the partner's rate for this kind of order. */
  const [shift, investor] = await Promise.all([
    shiftService.ensureOpen(centerId, req.user),
    InvestorSettings.getSingleton(),
  ]);
  const orderNumber = await InternalOrder.nextOrderNumber();
  const qrPayload   = orderNumber;

  const order = await InternalOrder.create({
    centerId: mongoose.isValidObjectId(centerId) ? centerId : null,
    orderNumber, qrPayload, qrDataUrl: '',
    items: lines,
    subtotal, discount: disc, total, totalCost, profit,
    discountType: byPercent && disc > 0 ? 'percent' : 'amount',
    discountPercent: byPercent && disc > 0 ? pct : 0,
    discountReason: disc > 0 ? String(discountReason || '').trim().slice(0, 80) : '',
    investorPercent: investor.percentFor(orderType),
    shiftId: shift?._id || null,
    customerName, customerPhone, orderType, paymentMethod, notes,
    fulfillmentType: dueAt ? 'scheduled' : 'asap',
    scheduledFor: dueAt || undefined,
    status: 'new',
    timeline: [{ status: 'new', at: new Date(), by: req.user.name }],
    createdBy: req.user._id,
    createdByName: req.user.name,
    stockApplied: false,
    stockMovements: [],
  });

  /* 4 — answer the cashier immediately. Stock + drawer bookkeeping are
         intentionally outside the response path so a slow database operation
         can never freeze the "تأكيد الطلب" button. */
  res.status(201).json({
    success: true,
    order: presentOrder(order, req.user.role),
    message: `تم إنشاء الطلب ${orderNumber}`,
  });

  setImmediate(async () => {
    try {
      const current = await InternalOrder.findById(order._id).select('status centerId');
      // QR is presentation metadata, not part of accepting the sale. Generate
      // it after the cashier already got the successful response.
      try {
        const qrDataUrl = await QRCode.toDataURL(qrPayload, {
          width: 320,
          margin: 1,
          color: { dark: '#352017', light: '#FFFFFF' },
        });
        await InternalOrder.updateOne(
          { _id: order._id },
          { $set: { qrDataUrl } }
        );
      } catch {}


      if (!current || current.status === 'cancelled') return;

      const stockTask = (async () => {
        const results = await Promise.allSettled(
          lines.map(line =>
            inventoryService.decreaseProductStock(line.productId, line.quantity, centerId)
          )
        );

        const applied = lines.filter((line, index) => results[index]?.status === 'fulfilled');
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.warn(
              `⚠️  تم بيع "${lines[index].name}" بدون خصم مخزون: ${result.reason?.message || result.reason}`
            );
          }
        });

        if (applied.length) {
          await InternalOrder.updateOne(
            { _id: order._id, status: { $ne: 'cancelled' } },
            {
              $set: {
                stockApplied: true,
                stockMovements: applied.map(line => ({
                  itemType: 'product',
                  itemId: line.productId,
                  quantity: line.quantity,
                  nameSnapshot: line.name,
                })),
              },
            }
          );
        }
      })();

      const cashTask = (async () => {
        if (!isPaid(paymentMethod) || total <= 0) return;
        try {
          await cashService.createTransaction(
            'sale_income',
            total,
            'in',
            `طلب داخلي ${orderNumber} — ${lines.length} صنف`,
            'InternalOrder',
            order._id,
            order.centerId
          );
          await InternalOrder.updateOne(
            { _id: order._id, status: { $ne: 'cancelled' } },
            { $set: { cashPosted: true } }
          );
        } catch (err) {
          console.error(`⚠️  تعذّر تسجيل نقدية الطلب ${orderNumber}:`, err.message);
        }
      })();

      await Promise.allSettled([stockTask, cashTask]);
    } catch (err) {
      console.error(`⚠️  تعذّرت المعالجة اللاحقة للطلب ${orderNumber}:`, err.message);
    }
  });
});

/* ── PUT /api/internal-orders/:id — edit an existing POS order ── */
router.put('/:id', requirePos, async (req, res) => {
  const order = await InternalOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  if (!canAccessOrder(req.user, order)) return res.status(403).json({ success: false, message: 'هذا الطلب تابع لفرع آخر' });
  if (order.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'الطلب الملغى للعرض فقط. أعد تفعيله قبل تعديله.' });
  }

  const {
    items,
    discount = order.discount,
    discountType = order.discountType || 'amount',
    discountPercent = order.discountPercent || 0,
    discountReason = order.discountReason || '',
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
    const unitPrice = oldLine ? Number(oldLine.unitPrice) || 0 : Number(product.directPrice) || 0;
    const unitCost = oldLine ? Number(oldLine.unitCost) || 0 : Number(product.calculatedCost) || 0;
    lines.push({
      productId: product._id,
      name: product.name,
      unitPrice,
      unitCost,
      quantity,
      lineTotal: unitPrice * quantity,
      notes: String(item.notes ?? oldLine?.notes ?? '').trim(),
      categorySnapshot: product.category || oldLine?.categorySnapshot || '',
      kitchenSection: product.kitchenSection || oldLine?.kitchenSection || inferKitchenSection(product),
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const byPercent = discountType === 'percent';
  const pct = byPercent ? Math.min(Math.max(Number(discountPercent) || 0, 0), 100) : 0;
  const requestedDiscount = byPercent ? Math.round(subtotal * pct / 100) : Math.max(Number(discount) || 0, 0);
  const disc = Math.min(requestedDiscount, subtotal);
  const restaurantAmount = subtotal - disc;
  const totalCost = lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
  const quote = await financeService.quote(restaurantAmount, order.centerId);
  const investor = await InvestorSettings.getSingleton();

  const oldTotal = Number(order.total) || 0;
  const oldPayment = order.paymentMethod;
  const oldCashPosted = Boolean(order.cashPosted);
  const oldItems = (order.items || []).map(item => item.toObject ? item.toObject() : { ...item });
  const oldMovements = order.stockMovements?.length
    ? order.stockMovements.map(m => m.toObject ? m.toObject() : { ...m })
    : oldItems.map(line => ({
        itemType: 'product',
        itemId: line.productId,
        quantity: line.quantity,
        nameSnapshot: line.name,
      }));

  if (order.stockApplied) {
    for (const movement of oldMovements) {
      try {
        if (movement.itemType === 'ingredient') {
          await inventoryService.increaseIngredientStock(movement.itemId, movement.quantity, 0, order.centerId);
        } else {
          await inventoryService.increaseProductStock(movement.itemId, movement.quantity, order.centerId);
        }
      } catch {}
    }
  }

  const newlyApplied = [];
  for (const line of lines) {
    try {
      await inventoryService.decreaseProductStock(line.productId, line.quantity, order.centerId);
      newlyApplied.push(line);
    } catch (err) {
      console.warn(`⚠️  تم تعديل الطلب وبيع "${line.name}" بدون خصم مخزون: ${err.message}`);
    }
  }
  order.stockApplied = newlyApplied.length > 0;
  order.stockMovements = newlyApplied.map(line => ({
    itemType: 'product',
    itemId: line.productId,
    quantity: line.quantity,
    nameSnapshot: line.name,
  }));

  order.items = lines;
  order.subtotal = subtotal;
  order.discount = disc;
  order.discountType = byPercent && disc > 0 ? 'percent' : 'amount';
  order.discountPercent = byPercent && disc > 0 ? pct : 0;
  order.discountReason = disc > 0 ? String(discountReason || '').trim().slice(0, 80) : '';
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
  order.investorPercent = investor.percentFor(orderType);
  order.customerName = String(customerName || '').trim();
  order.customerPhone = String(customerPhone || '').trim();
  order.orderType = orderType;
  order.paymentMethod = paymentMethod;
  order.notes = String(notes || '').trim();
  order.fulfillmentType = fulfillmentType === 'scheduled' ? 'scheduled' : 'asap';
  order.scheduledFor = dueAt || undefined;
  order.stockMovements = lines.map(line => ({
    itemType: 'product',
    itemId: line.productId,
    quantity: line.quantity,
    nameSnapshot: line.name,
  }));
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

  res.json({
    success: true,
    order: presentOrder(order, req.user.role),
    message: `تم تعديل الطلب وإعادة احتساب المخزون والمالية${cashWarning}`,
  });
});

/* ── PUT /api/internal-orders/:id/status ── */
router.put('/:id/status', requireKitchen, async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'الحالة غير صحيحة' });
  }
  if (req.user.role === 'kitchen' && status === 'cancelled') {
    return res.status(403).json({ success: false, message: 'إلغاء الطلب يحتاج كاشيراً أو إدارة.' });
  }

  const order = await InternalOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  if (!canAccessOrder(req.user, order)) return res.status(403).json({ success: false, message: 'هذا الطلب تابع لفرع آخر' });
  if (order.status === status) {
    return res.json({ success: true, order: presentOrder(order, req.user.role), message: 'الحالة كما هي' });
  }

  // Cancelling puts the stock back — but only once.
  if (status === 'cancelled' && order.stockApplied) {
    const movements = order.stockMovements?.length
      ? order.stockMovements
      : order.items.map(line => ({ itemType: 'product', itemId: line.productId, quantity: line.quantity }));
    for (const movement of movements) {
      if (movement.itemType === 'ingredient') {
        await inventoryService.increaseIngredientStock(movement.itemId, movement.quantity, 0, order.centerId);
      } else {
        await inventoryService.increaseProductStock(movement.itemId, movement.quantity, order.centerId);
      }
    }
    order.stockApplied = false;
  }

  // …and takes the money back out. A reversal entry, not a deletion, so the
  // cash journal still shows what happened.
  if (status === 'cancelled' && order.cashPosted) {
    try {
      await cashService.createTransaction(
        'adjustment', order.total, 'out',
        `إلغاء طلب داخلي ${order.orderNumber}`,
        'InternalOrder', order._id, order.centerId
      );
      order.cashPosted = false;
    } catch (err) {
      console.error(`⚠️  تعذّر عكس نقدية الطلب ${order.orderNumber}:`, err.message);
    }
  }

  // Un-cancelling is also allowed regardless of current stock.
  if (order.status === 'cancelled' && status !== 'cancelled' && !order.stockApplied) {
    const requestedMovements = order.items.map(line => ({
      itemType: 'product',
      itemId: line.productId,
      quantity: line.quantity,
      nameSnapshot: line.name,
    }));
    const reapplied = [];
    for (const movement of requestedMovements) {
      try {
        if (movement.itemType === 'ingredient') {
          await inventoryService.decreaseIngredientStock(movement.itemId, movement.quantity, order.centerId);
        } else {
          await inventoryService.decreaseProductStock(movement.itemId, movement.quantity, order.centerId);
        }
        reapplied.push(movement);
      } catch (err) {
        console.warn(`⚠️  أعيد تفعيل الطلب بدون خصم مخزون "${movement.nameSnapshot || ''}": ${err.message}`);
      }
    }
    order.stockApplied = reapplied.length > 0;
    order.stockMovements = reapplied;

    // Re-post the revenue that the cancellation reversed.
    if (isPaid(order.paymentMethod) && order.total > 0 && !order.cashPosted) {
      try {
        await cashService.createTransaction(
          'sale_income', order.total, 'in',
          `إعادة تفعيل طلب داخلي ${order.orderNumber}`,
          'InternalOrder', order._id, order.centerId
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
  res.json({ success: true, order: presentOrder(order, req.user.role), message: `الطلب الآن: ${labels[status]}` });
});

router.post('/:id/print-result', requirePos, async (req, res) => {
  const order = await InternalOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
  if (!canAccessOrder(req.user, order)) return res.status(403).json({ success: false, message: 'هذا الطلب تابع لفرع آخر' });
  const success = req.body.success !== false;
  order.printStatus = success ? 'printed' : 'failed';
  order.printerId = String(req.body.printerId || '').slice(0, 160);
  order.lastPrintedBy = req.user?.name || '';
  if (success) {
    order.printedAt = new Date();
    order.printCount += 1;
  }
  await order.save();
  res.json({ success: true, printStatus: order.printStatus, printCount: order.printCount });
});

/* ── Today's counters for the POS header ── */
router.get('/stats/today', requireRole('admin', 'supervisor', 'cashier', 'kitchen', 'viewer'), async (req, res) => {
  const { day, start, end } = await businessDay.current(businessDayCenter(req));

  const statsFilter = { createdAt: { $gte: start, $lt: end } };
  applyCenterScope(req, statsFilter);
  const orders = await InternalOrder.find(statsFilter);
  const active = orders.filter(o => o.status !== 'cancelled');

  const stats = {
    count:     active.length,
    revenue:   active.reduce((s, o) => s + o.total, 0),
    unpaid:    active.filter(o => o.paymentMethod === 'unpaid').reduce((s, o) => s + o.total, 0),
    new:       orders.filter(o => o.status === 'new').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready:     orders.filter(o => o.status === 'ready').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };
  if (!['cashier', 'kitchen'].includes(req.user.role)) {
    stats.cost = active.reduce((s, o) => s + (o.totalCost || 0), 0);
    stats.profit = active.reduce((s, o) => s + (o.profit || 0), 0);
  }
  res.json({
    success: true,
    day,
    stats,
  });
});

module.exports = router;
