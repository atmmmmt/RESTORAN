'use strict';

const router = require('express').Router();
const { protect, requireAdmin } = require('../middleware/auth');
const authController = require('../controllers/authController');

router.use(protect);

router.get('/', (req, res) => {
  res.json({ success: true, user: req.user });
});

router.put('/', requireAdmin, async (req, res) => {
  const User = require('../models/User');
  const { name, phone } = req.body;
  const user = await User.findById(req.user._id);
  if (name) user.name = name;
  if (phone) user.phone = phone;
  await user.save();
  res.json({ success: true, message: 'تم تحديث الإعدادات.', user });
});

router.put('/password', authController.changePassword);

/* ── Investor cut ──────────────────────────────────────────────
   A share of every order's takings, paid to whoever owns the space, at a
   rate that depends on the order type. Read by the till, the sales lists and
   the printed report, so it is readable by any signed-in staff member and
   writable only by an admin. */
const InvestorSettings = require('../models/InvestorSettings');

const PERCENT_FIELDS = ['takeawayPercent', 'dineInPercent', 'percent'];

router.get('/investor', async (req, res) => {
  const s = await InvestorSettings.getSingleton();
  res.json({ success: true, investor: s.present() });
});

router.put('/investor', requireAdmin, async (req, res) => {
  const s = await InvestorSettings.getSingleton();
  if (req.body.enabled !== undefined) s.enabled = !!req.body.enabled;
  if (req.body.name !== undefined) s.name = String(req.body.name).trim() || 'الأميركان';
  for (const field of PERCENT_FIELDS) {
    if (req.body[field] === undefined) continue;
    const pct = Number(req.body[field]);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ success: false, message: 'النسبة يجب أن تكون بين 0 و 100' });
    }
    s[field] = pct;
  }
  // سفري دائماً يأخذ نفس نسبة التوصيل/الموقع.
  s.takeawayPercent = Number(s.percent || 0);
  await s.save();
  res.json({ success: true, message: 'تم حفظ نسبة الشريك', investor: s.present() });
});

/* ── Opening hours ─────────────────────────────────────────────
   Where one working day ends and the next begins. Every signed-in screen
   needs to know the current day, so reading is open to staff; changing the
   hours is the owner's call. */
const BusinessSettings = require('../models/BusinessSettings');
const businessDay = require('../services/businessDay');

const presentHours = async () => {
  const { day, start, end, openingTime, closingTime } = await businessDay.current();
  return { openingTime, closingTime, currentDay: day, dayStartsAt: start, dayEndsAt: end };
};

router.get('/business-hours', async (req, res) => {
  res.json({ success: true, hours: await presentHours() });
});

router.put('/business-hours', requireAdmin, async (req, res) => {
  const { openingTime, closingTime } = req.body;
  for (const value of [openingTime, closingTime]) {
    if (value !== undefined && !BusinessSettings.TIME.test(String(value))) {
      return res.status(400).json({ success: false, message: 'الوقت يجب أن يكون بصيغة HH:MM' });
    }
  }
  const s = await BusinessSettings.getSingleton();
  if (openingTime !== undefined) s.openingTime = openingTime;
  if (closingTime !== undefined) s.closingTime = closingTime;
  await s.save();
  businessDay.invalidate();
  res.json({ success: true, message: 'تم حفظ ساعات العمل', hours: await presentHours() });
});

module.exports = router;
