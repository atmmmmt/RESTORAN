'use strict';

const router  = require('express').Router();
const QRCode  = require('qrcode');
const mongoose = require('mongoose');

const { protect, requirePos, requireKitchen, requireRole } = require('../middleware/auth');
const InternalOrder = require('../models/InternalOrder');
const Product       = require('../models/Product');
const cashService   = require('../services/cashService');
const inventoryService = require('../services/inventoryService');
const CustomerOrder = require('../models/CustomerOrder');
const InvestorSettings = require('../models/InvestorSettings');
const ReturnRecord     = require('../models/ReturnRecord');
const businessDay      = require('../services/businessDay');
const shiftService     = require('../services/shiftService');

const STATUSES = InternalOrder.STATUSES;

/* "آجل" means the money hasn't arrived yet, so nothing hits the drawer. */
const isPaid = method => method === 'cash' || method === 'card';

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
  const { status, date, limit = 100 } = req.query;

  const filter = {};
  applyCenterScope(req, filter);
  if (status && STATUSES.includes(status)) filter.status = status;
  /* A working day, cut on the shop's opening hours — 'today' is the one
     running now, which after midnight may still be yesterday's date. */
  if (date) {
    const { start, end } = await businessDay.range(date === 'today' ? undefined : date, businessDayCenter(req));
    filter.createdAt = { $gte: start, $lt: end };
  }
  if (req.query.shift && mongoose.isValidObjectId(req.query.shift)) filter.shiftId = req.query.shift;

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
  const { day, start, end } = await businessDay.range(req.query.date, businessDayCenter(req));

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
        investorBase: Number(o.netAmount ?? Math.max((Number(o.total) || 0) - (Number(o.invoiceTaxAmount) || 0), 0)),
        investorPercent: pct,
        investorShare: cut(Number(o.netAmount ?? Math.max((Number(o.total) || 0) - (Number(o.invoiceTaxAmount) || 0), 0)), pct),
      };
    }),
    ...site.map(o => {
      const pct = settings.percentFor('site');
      return {
        kind: 'site', number: 'موقع', at: o.createdAt, orderType: 'site',
        items: [{ name: o.productNameSnapshot, quantity: o.quantity }],
        total: o.totalPrice || 0,
        investorBase: Number(o.netAmount ?? Math.max((Number(o.totalPrice) || 0) - (Number(o.invoiceTaxAmount) || 0), 0)),
        investorPercent: pct,
        investorShare: cut(Number(o.netAmount ?? Math.max((Number(o.totalPrice) || 0) - (Number(o.invoiceTaxAmount) || 0), 0)), pct),
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
  const internalOrders = orders.filter(o => o.kind === 'pos' && o.orderType !== 'delivery');
  const externalOrders = orders.filter(o => o.kind === 'site' || o.orderType === 'delivery');

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
        percent: 20,
        count: internalOrders.length,
        sales: sum(internalOrders, 'total'),
        base: sum(internalOrders, 'investorBase'),
        investorShare: sum(internalOrders, 'investorShare'),
      },
      external: {
        percent: 15,
        count: externalOrders.length,
        sales: sum(externalOrders, 'total'),
        base: sum(externalOrders, 'investorBase'),
        investorShare: sum(externalOrders, 'investorShare'),
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
    if (!centerId && product.availableQuantity < quantity) {
      return res.status(409).json({
        success: false,
        message: `الكمية المتاحة من "${product.name}" هي ${product.availableQuantity} فقط`,
      });
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

  /* 2 — take the stock. Conditional update so two tills can't oversell
         the same last piece: the write only lands if stock is still there. */
  const applied = [];
  for (const line of lines) {
    try {
      await inventoryService.decreaseProductStock(line.productId, line.quantity, centerId);
    } catch (err) {
      // Roll back whatever we already deducted, then report the clash.
      for (const done of applied) {
        await inventoryService.increaseProductStock(done.productId, done.quantity, centerId);
      }
      return res.status(409).json({
        success: false,
        message: err.message || `نفدت الكمية من "${line.name}" أثناء إتمام الطلب`,
      });
    }
    applied.push(line);
  }

  /* 3 — create the order, inside the shift that is running (opening one if
         the cashier hasn't), at the partner's rate for this kind of order. */
  const [shift, investor] = await Promise.all([
    shiftService.ensureOpen(centerId, req.user),
    InvestorSettings.getSingleton(),
  ]);
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
    centerId: mongoose.isValidObjectId(centerId) ? centerId : null,
    orderNumber, qrPayload, qrDataUrl,
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
    stockApplied: true,
    stockMovements: lines.map(line => ({
      itemType: 'product', itemId: line.productId, quantity: line.quantity, nameSnapshot: line.name,
    })),
  });

  /* 4 — money in the drawer. Failing to log cash must not void a sale that
         already happened physically, so this is best-effort and flagged. */
  if (isPaid(paymentMethod) && total > 0) {
    try {
      await cashService.createTransaction(
        'sale_income', total, 'in',
        `طلب داخلي ${orderNumber} — ${lines.length} صنف`,
        'InternalOrder', order._id, order.centerId
      );
      order.cashPosted = true;
      await order.save();
    } catch (err) {
      console.error(`⚠️  تعذّر تسجيل نقدية الطلب ${orderNumber}:`, err.message);
    }
  }

  res.status(201).json({ success: true, order: presentOrder(order, req.user.role), message: `تم إنشاء الطلب ${orderNumber}` });
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

  // Un-cancelling takes it out again.
  if (order.status === 'cancelled' && status !== 'cancelled' && !order.stockApplied) {
    const movements = order.stockMovements?.length
      ? order.stockMovements
      : order.items.map(line => ({ itemType: 'product', itemId: line.productId, quantity: line.quantity, nameSnapshot: line.name }));
    const reapplied = [];
    for (const movement of movements) {
      try {
        if (movement.itemType === 'ingredient') {
          await inventoryService.decreaseIngredientStock(movement.itemId, movement.quantity, order.centerId);
        } else {
          await inventoryService.decreaseProductStock(movement.itemId, movement.quantity, order.centerId);
        }
        reapplied.push(movement);
      } catch (err) {
        for (const done of reapplied) {
          if (done.itemType === 'ingredient') await inventoryService.increaseIngredientStock(done.itemId, done.quantity, 0, order.centerId);
          else await inventoryService.increaseProductStock(done.itemId, done.quantity, order.centerId);
        }
        return res.status(409).json({
          success: false,
          message: err.message || `لا توجد كمية كافية من "${movement.nameSnapshot}" لإعادة تفعيل الطلب`,
        });
      }
    }
    order.stockApplied = true;

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
