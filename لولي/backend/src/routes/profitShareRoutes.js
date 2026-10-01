'use strict';

const router = require('express').Router();
const dayjs = require('dayjs');
const { protect, requireAdmin } = require('../middleware/auth');
const ProfitShareSettings = require('../models/ProfitShareSettings');
const { computeProfitLoss } = require('../controllers/reportController');

router.use(protect, requireAdmin);

/* GET /api/profit-shares — the configured partners and their percentages */
router.get('/', async (req, res) => {
  const settings = await ProfitShareSettings.getSingleton();
  res.json({ success: true, partners: settings.partners, investor: settings.investor });
});

/* PUT /api/profit-shares — replace the partner list */
router.put('/', async (req, res) => {
  const partners = Array.isArray(req.body.partners) ? req.body.partners : null;
  if (!partners) {
    return res.status(400).json({ success: false, message: 'قائمة الشركاء مطلوبة.' });
  }

  const cleaned = [];
  for (const p of partners) {
    const name = String(p?.name || '').trim();
    const percent = Number(p?.percent);
    if (!name) return res.status(400).json({ success: false, message: 'اسم كل شريك مطلوب.' });
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return res.status(400).json({ success: false, message: `نسبة "${name}" يجب أن تكون بين 0 و 100.` });
    }
    cleaned.push({ name, percent });
  }

  const total = cleaned.reduce((sum, p) => sum + p.percent, 0);
  if (total > 100.0001) {
    return res.status(400).json({ success: false, message: `مجموع النسب ${total}% — لا يمكن أن يتجاوز 100%.` });
  }

  const settings = await ProfitShareSettings.getSingleton();
  settings.partners = cleaned;
  await settings.save();
  res.json({ success: true, partners: settings.partners, message: 'تم حفظ النسب بنجاح' });
});

/* PUT /api/profit-shares/investor — the investor's cut of takings */
router.put('/investor', async (req, res) => {
  const { enabled, name, posPercent, sitePercent } = req.body || {};
  const pct = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null; };
  if (posPercent !== undefined && pct(posPercent) === null) return res.status(400).json({ success: false, message: 'نسبة الكاشير يجب أن تكون بين 0 و 100.' });
  if (sitePercent !== undefined && pct(sitePercent) === null) return res.status(400).json({ success: false, message: 'نسبة الموقع يجب أن تكون بين 0 و 100.' });

  const settings = await ProfitShareSettings.getSingleton();
  const inv = settings.investor || {};
  if (enabled !== undefined) inv.enabled = !!enabled;
  if (name !== undefined && String(name).trim()) inv.name = String(name).trim();
  if (posPercent !== undefined) inv.posPercent = pct(posPercent);
  if (sitePercent !== undefined) inv.sitePercent = pct(sitePercent);
  settings.investor = inv;
  settings.markModified('investor');
  await settings.save();
  res.json({ success: true, investor: settings.investor, message: 'تم حفظ نسبة الشريك' });
});

/* GET /api/profit-shares/monthly?year=2026&month=9
   Net profit for that calendar month and each partner's cut of it. */
router.get('/monthly', async (req, res) => {
  const year = Number(req.query.year) || dayjs().year();
  const month = Number(req.query.month) || dayjs().month() + 1;
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const startDate = start.format('YYYY-MM-DD');
  const endDate = start.endOf('month').format('YYYY-MM-DD');

  const [settings, report] = await Promise.all([
    ProfitShareSettings.getSingleton(),
    computeProfitLoss(startDate, endDate),
  ]);

  const netProfit = report.netProfit;
  /* A losing month is reported, but nobody is owed a share of a loss here. */
  const distributable = Math.max(0, netProfit);
  const shares = settings.partners.map(p => ({
    name: p.name,
    percent: p.percent,
    amount: Math.round(distributable * p.percent / 100),
  }));
  const allocatedPercent = settings.partners.reduce((s, p) => s + p.percent, 0);

  res.json({
    success: true,
    year,
    month,
    period: { startDate, endDate },
    report,
    netProfit,
    shares,
    allocatedPercent,
    unallocated: Math.round(distributable * (100 - allocatedPercent) / 100),
  });
});

module.exports = router;
