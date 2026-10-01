'use strict';

const router = require('express').Router();
const mongoose = require('mongoose');

const { protect, requirePos, requireRole } = require('../middleware/auth');
const CashierShift = require('../models/CashierShift');
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
  const [shift, day] = await Promise.all([shiftService.getOpen(centerOf(req)), businessDay.current()]);
  res.json({
    success: true,
    shift: await present(shift),
    businessDay: { day: day.day, start: day.start, end: day.end, openingTime: day.openingTime, closingTime: day.closingTime },
  });
});

/* ── GET /api/shifts ── recent shifts, newest first. */
router.get('/', requireRole('admin', 'supervisor', 'cashier', 'viewer'), async (req, res) => {
  const filter = {};
  if (req.user?.centerId) filter.centerId = req.user.centerId;
  else if (req.query.center && req.query.center !== 'all') {
    filter.centerId = req.query.center === 'hq' ? null : req.query.center;
  } else filter.centerId = null;
  if (req.query.day && businessDay.DAY_KEY.test(req.query.day)) filter.businessDay = req.query.day;

  const shifts = await CashierShift.find(filter)
    .sort({ openedAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 30, 200));
  res.json({ success: true, shifts });
});

/* ── POST /api/shifts/open ── { openingCash } */
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
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: 'الوردية غير موجودة' });
  const shift = await CashierShift.findById(req.params.id);
  if (!shift) return res.status(404).json({ success: false, message: 'الوردية غير موجودة' });
  if (!canSee(req, shift)) return res.status(403).json({ success: false, message: 'هذه الوردية تابعة لفرع آخر' });
  res.json({ success: true, shift: await present(shift) });
});

module.exports = router;
