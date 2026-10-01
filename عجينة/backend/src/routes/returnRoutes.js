'use strict';

const router   = require('express').Router();
const mongoose = require('mongoose');

const { protect, requirePos, requireRole } = require('../middleware/auth');
const ReturnRecord   = require('../models/ReturnRecord');
const InternalOrder  = require('../models/InternalOrder');
const cashService    = require('../services/cashService');
const inventoryService = require('../services/inventoryService');
const businessDay    = require('../services/businessDay');

const boundCenterId = user => (user?.centerId ? String(user.centerId) : null);

function applyCenterScope(req, filter) {
  const assigned = boundCenterId(req.user);
  if (assigned) filter.centerId = assigned;
  else if (req.query.center && req.query.center !== 'all') {
    filter.centerId = req.query.center === 'hq' ? null : req.query.center;
  }
}

/* The order's own discount, spread over the lines, so a returned line gives
   back what the customer actually paid for it rather than the list price. */
const paidRatio = order => {
  const subtotal = Number(order.subtotal) || 0;
  if (subtotal <= 0) return 1;
  return (Number(order.total) || 0) / subtotal;
};

router.use(protect);

/* ── GET /api/returns ── */
router.get('/', requireRole('admin', 'supervisor', 'cashier', 'viewer'), async (req, res) => {
  const { date, limit = 100 } = req.query;

  const filter = {};
  applyCenterScope(req, filter);
  if (date) {
    const { start, end } = await businessDay.range(date === 'today' ? undefined : date);
    filter.createdAt = { $gte: start, $lt: end };
  }

  const returns = await ReturnRecord.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500));

  const totals = returns.reduce(
    (acc, r) => ({
      count: acc.count + 1,
      refunded: acc.refunded + (r.refundAmount || 0),
      items: acc.items + r.items.reduce((s, i) => s + i.quantity, 0),
    }),
    { count: 0, refunded: 0, items: 0 }
  );

  res.json({ success: true, returns, totals });
});

/* ── GET /api/returns/order/:key ──
   The order as the returns desk needs to see it: every line with how much of
   it is still returnable after earlier returns against the same order. */
router.get('/order/:key', requireRole('admin', 'supervisor', 'cashier'), async (req, res) => {
  const { key } = req.params;
  const order = mongoose.isValidObjectId(key)
    ? await InternalOrder.findById(key)
    : await InternalOrder.findOne({ orderNumber: key.trim() });

  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

  const assigned = boundCenterId(req.user);
  if (assigned && String(order.centerId || '') !== assigned) {
    return res.status(403).json({ success: false, message: 'هذا الطلب تابع لفرع آخر' });
  }
  if (order.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'الطلب ملغى أصلاً — لا يوجد ما يُرجَع' });
  }

  const previous = await ReturnRecord.find({ orderId: order._id });
  const returnedByProduct = new Map();
  for (const record of previous) {
    for (const item of record.items) {
      const id = String(item.productId);
      returnedByProduct.set(id, (returnedByProduct.get(id) || 0) + item.quantity);
    }
  }

  const ratio = paidRatio(order);
  res.json({
    success: true,
    order: {
      _id: order._id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customerName: order.customerName,
      paymentMethod: order.paymentMethod,
      total: order.total,
      discount: order.discount,
      items: order.items.map(line => {
        const returned = returnedByProduct.get(String(line.productId)) || 0;
        return {
          productId: line.productId,
          name: line.name,
          unitPrice: line.unitPrice,
          refundUnitPrice: Math.round(line.unitPrice * ratio),
          quantity: line.quantity,
          returned,
          returnable: Math.max(line.quantity - returned, 0),
        };
      }),
    },
  });
});

/* ── POST /api/returns ── */
router.post('/', requirePos, async (req, res) => {
  const { orderId, items, restock = true, reason = '', refundMethod } = req.body;

  if (!mongoose.isValidObjectId(orderId)) {
    return res.status(400).json({ success: false, message: 'اختر الطلب أولاً' });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ success: false, message: 'حدّد صنفاً واحداً على الأقل للإرجاع' });
  }

  const order = await InternalOrder.findById(orderId);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });

  const assigned = boundCenterId(req.user);
  if (assigned && String(order.centerId || '') !== assigned) {
    return res.status(403).json({ success: false, message: 'هذا الطلب تابع لفرع آخر' });
  }
  if (order.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'الطلب ملغى — لا يوجد ما يُرجَع' });
  }

  /* What is still returnable, counting everything already brought back. */
  const previous = await ReturnRecord.find({ orderId: order._id });
  const alreadyReturned = new Map();
  for (const record of previous) {
    for (const item of record.items) {
      const id = String(item.productId);
      alreadyReturned.set(id, (alreadyReturned.get(id) || 0) + item.quantity);
    }
  }

  const ratio = paidRatio(order);
  const lines = [];
  for (const wanted of items) {
    const quantity = Number(wanted.quantity) || 0;
    if (quantity <= 0) continue;

    const line = order.items.find(l => String(l.productId) === String(wanted.productId));
    if (!line) {
      return res.status(400).json({ success: false, message: 'صنف غير موجود في هذا الطلب' });
    }

    const remaining = line.quantity - (alreadyReturned.get(String(line.productId)) || 0);
    if (quantity > remaining) {
      return res.status(400).json({
        success: false,
        message: `المتبقي للإرجاع من "${line.name}" هو ${remaining} فقط`,
      });
    }

    const refundUnit = Math.round(line.unitPrice * ratio);
    lines.push({
      productId: line.productId,
      name: line.name,
      unitPrice: refundUnit,
      quantity,
      lineTotal: refundUnit * quantity,
    });
  }

  if (!lines.length) {
    return res.status(400).json({ success: false, message: 'حدّد كمية للإرجاع' });
  }

  const refundAmount = lines.reduce((s, l) => s + l.lineTotal, 0);

  /* An unpaid ("آجل") order has no money to give back — the return just
     cancels what was owed. */
  const method = refundMethod || (order.paymentMethod === 'unpaid' ? 'none' : order.paymentMethod);
  const wantsRestock = restock !== false;

  /* Stock goes back first: if it fails, nothing has been recorded yet. */
  const restored = [];
  if (wantsRestock) {
    try {
      for (const line of lines) {
        // eslint-disable-next-line no-await-in-loop
        await inventoryService.increaseProductStock(line.productId, line.quantity, order.centerId);
        restored.push(line);
      }
    } catch (err) {
      for (const done of restored) {
        // eslint-disable-next-line no-await-in-loop
        await inventoryService.decreaseProductStock(done.productId, done.quantity, order.centerId).catch(() => {});
      }
      return res.status(409).json({ success: false, message: err.message || 'تعذّرت إعادة الكمية للمخزون' });
    }
  }

  const returnNumber = await ReturnRecord.nextReturnNumber();
  const record = await ReturnRecord.create({
    centerId: order.centerId || null,
    returnNumber,
    orderId: order._id,
    orderNumber: order.orderNumber,
    items: lines,
    refundAmount,
    refundMethod: method,
    restocked: wantsRestock,
    reason: String(reason || '').slice(0, 300),
    createdBy: req.user._id,
    createdByName: req.user.name,
  });

  /* Money out of the drawer — best effort, exactly like the sale that put it
     in: a failed journal entry must not undo a refund already handed over. */
  if (method !== 'none' && refundAmount > 0) {
    try {
      await cashService.createTransaction(
        'adjustment', refundAmount, 'out',
        `مرتجع ${returnNumber} — طلب ${order.orderNumber}`,
        'ReturnRecord', record._id, order.centerId
      );
      record.cashPosted = true;
      await record.save();
    } catch (err) {
      console.error(`⚠️  تعذّر تسجيل نقدية المرتجع ${returnNumber}:`, err.message);
    }
  }

  res.status(201).json({
    success: true,
    return: record,
    message: `تم تسجيل المرتجع ${returnNumber}`,
  });
});

module.exports = router;
