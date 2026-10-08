'use strict';

const router = require('express').Router();
const mongoose = require('mongoose');

const { protect, requirePos, requireRole } = require('../middleware/auth');
const CashierShift = require('../models/CashierShift');
const InternalOrder = require('../models/InternalOrder');
const ReturnRecord = require('../models/ReturnRecord');
const shiftService = require('../services/shiftService');
const businessDay = require('../services/businessDay');

/* Same branch rule as the orders: a branch cashier only ever sees and runs
   their own branch's drawer; head office picks one (or its own, by default). */
const centerOf = req => {
  if (req.user?.centerId) return String(req.user.centerId);
  const asked = req.body?.centerId ?? req.query.center;
  return asked && asked !== 'hq' && mongoose.isValidObjectId(asked) ? String(asked) : null;
};

const canSee = (req, shift) => !req.user?.centerId || String(shift.centerId || '') === String(req.user.centerId);

async function present(shift) {
  if (!shift) return null;
  const value = shift.toObject();
  if (shift.status === 'open') {
    const live = await shiftService.summarize(shift);
    value.summary = live.summary;
    value.expectedCash = live.expectedCash;
  }
  return value;
}

router.use(protect);

/* ── GET /api/shifts/current ── the open shift (or null) and the working day. */
router.get('/current', requireRole('admin', 'supervisor', 'cashier', 'viewer'), async (req, res) => {
  const centerId = centerOf(req);
  const [shift, day] = await Promise.all([shiftService.getOpen(centerId), businessDay.current(centerId)]);
  res.json({
    success: true,
    shift: await present(shift),
    businessDay: { day: day.day, start: day.start, end: day.end, openingTime: day.openingTime, closingTime: day.closingTime },
  });
});

/* ── GET /api/shifts ── recent shifts, newest first. */
router.get('/', requireRole('admin', 'supervisor', 'cashier', 'viewer'), async (req, res) => {
  const filter = {};
  if (req.user?.centerId) {
    filter.centerId = req.user.centerId;
  } else if (req.query.center && req.query.center !== 'all') {
    filter.centerId = req.query.center === 'hq' ? null : req.query.center;
  }

  if (req.query.day && businessDay.DAY_KEY.test(req.query.day)) filter.businessDay = req.query.day;
  if (['open', 'closed'].includes(req.query.status)) filter.status = req.query.status;

  if (req.query.from || req.query.to) {
    filter.openedAt = {};
    if (req.query.from) {
      const from = new Date(`${req.query.from}T00:00:00`);
      if (!Number.isNaN(from.getTime())) filter.openedAt.$gte = from;
    }
    if (req.query.to) {
      const to = new Date(`${req.query.to}T00:00:00`);
      if (!Number.isNaN(to.getTime())) {
        to.setDate(to.getDate() + 1);
        filter.openedAt.$lt = to;
      }
    }
    if (!Object.keys(filter.openedAt).length) delete filter.openedAt;
  }

  const cashier = String(req.query.cashier || '').trim();
  if (cashier) {
    const safe = cashier.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { openedByName: { $regex: safe, $options: 'i' } },
      { closedByName: { $regex: safe, $options: 'i' } },
    ];
  }

  const shifts = await CashierShift.find(filter)
    .sort({ openedAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 100, 500));
  res.json({ success: true, shifts });
});

router.post('/open', requirePos, async (req, res) => {
  const shift = await shiftService.open(centerOf(req), req.user, req.body.openingCash);
  res.status(201).json({ success: true, shift: await present(shift), message: `تم فتح الوردية رقم ${shift.number}` });
});

/* ── POST /api/shifts/close ── { countedCash, notes } — the "تصفير". */
router.post('/close', requirePos, async (req, res) => {
  const shift = await shiftService.close(centerOf(req), req.user, req.body);
  const diff = shift.difference;
  const note = diff === 0 ? 'الدرج مطابق' : diff > 0 ? `زيادة ${diff}` : `نقص ${Math.abs(diff)}`;
  res.json({ success: true, shift: shift.toObject(), message: `تم إغلاق الوردية رقم ${shift.number} — ${note}` });
});

/* ── GET /api/shifts/:id ── */
router.get('/:id', requireRole('admin', 'supervisor', 'cashier', 'viewer'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ success: false, message: 'الوردية غير موجودة' });
  }

  const shift = await CashierShift.findById(req.params.id);
  if (!shift) return res.status(404).json({ success: false, message: 'الوردية غير موجودة' });
  if (!canSee(req, shift)) return res.status(403).json({ success: false, message: 'هذه الوردية تابعة لفرع آخر' });

  const value = await present(shift);
  const until = shift.closedAt || new Date();

  const [orders, returns] = await Promise.all([
    InternalOrder.find({ shiftId: shift._id })
      .sort({ createdAt: 1 })
      .select('orderNumber createdAt status orderType paymentMethod customerName total subtotal discount items'),
    ReturnRecord.find({
      centerId: shift.centerId || null,
      createdAt: { $gte: shift.openedAt, $lte: until },
    })
      .sort({ createdAt: 1 })
      .select('number orderNumber createdAt refundAmount refundMethod items reason'),
  ]);

  res.json({
    success: true,
    shift: value,
    details: {
      orders: orders.map(order => order.toObject()),
      returns: returns.map(item => item.toObject()),
    },
  });
});

module.exports = router;
