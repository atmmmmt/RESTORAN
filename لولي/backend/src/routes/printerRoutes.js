'use strict';

const router = require('express').Router();
const { protect, requireAdmin, requirePOS } = require('../middleware/auth');
const PrinterSettings = require('../models/PrinterSettings');
const net = require('../services/printerNetwork');

router.use(protect);

/* ── Read config — the cashier's own station needs to know if it's set up ── */
router.get('/settings', requirePOS, async (req, res) => {
  const settings = await PrinterSettings.getSingleton();
  res.json({ success: true, settings });
});

/* ── Change config — IP/port/enabled is a setup decision, admin only ── */
router.put('/settings', requireAdmin, async (req, res) => {
  const allowed = ['cashierIp', 'cashierPort', 'cashierEnabled', 'kitchenIp', 'kitchenPort', 'kitchenEnabled', 'autoPrint'];
  const $set = {};
  for (const k of allowed) if (req.body[k] !== undefined) $set[k] = req.body[k];

  const settings = await PrinterSettings.findOneAndUpdate({}, { $set }, { upsert: true, new: true, runValidators: true });
  res.json({ success: true, settings, message: 'تم حفظ إعدادات الطابعة' });
});

/* ── Test the SAVED config for one station — what the cashier hits from POS
   to check "did the printer fall off the network" without reaching settings
   they can't open. ── */
router.post('/device/test/:station', requirePOS, async (req, res) => {
  const { station } = req.params;
  if (!['cashier', 'kitchen'].includes(station)) {
    return res.status(400).json({ success: false, message: 'محطة غير معروفة' });
  }

  const settings = await PrinterSettings.getSingleton();
  const ip   = settings[`${station}Ip`];
  const port = settings[`${station}Port`] || net.DEFAULT_PORT;

  if (!ip) return res.status(400).json({ success: false, message: 'لم يُضبط عنوان الطابعة بعد' });

  const open = await net.testPort(ip, port, 3000);
  res.json({ success: true, open, message: open ? 'الطابعة متصلة ✓' : 'لا استجابة من الطابعة — تأكد من الشبكة والكبل' });
});

/* ── Ad-hoc probe against a typed-in IP, before it's saved — setup only ── */
router.post('/device/probe', requireAdmin, async (req, res) => {
  const { ip, port } = req.body;
  if (!ip) return res.status(400).json({ success: false, message: 'عنوان IP مطلوب' });
  const open = await net.testPort(ip, Number(port) || net.DEFAULT_PORT, 3000);
  res.json({ success: true, open, message: open ? 'الطابعة متصلة ✓' : 'المنفذ مغلق أو لا توجد طابعة' });
});

/* ── Sweep the subnet for anything that looks like a network printer ── */
router.post('/device/scan', requireAdmin, async (req, res) => {
  const { baseIp, port } = req.body;
  const p = Number(port) || net.DEFAULT_PORT;

  /* A typed base address scans just that subnet; otherwise every subnet the
     machine running this server is connected to. */
  if (baseIp) {
    const ips = await net.scanNetwork(baseIp, p);
    const subnet = baseIp.split('.').slice(0, 3).join('.');
    return res.json({ success: true, subnets: [subnet], found: ips.map(ip => ({ ip, subnet })),
      message: ips.length ? `تم العثور على ${ips.length} طابعة` : 'لم يُعثر على طابعات' });
  }
  const { subnets, found } = await net.scanAll(p);
  res.json({ success: true, subnets, found,
    message: found.length ? `تم العثور على ${found.length} طابعة` : 'لم يُعثر على طابعات' });
});

/* ── Print a rendered ticket straight to a station's printer ──
   Body: { width, height, data } — data is base64 of the packed 1-bit rows.
   `ip`/`port` may be passed by an admin to test an unsaved address. */
router.post('/print/:station', requirePOS, async (req, res) => {
  const { station } = req.params;
  if (!['cashier', 'kitchen'].includes(station)) {
    return res.status(400).json({ success: false, message: 'محطة غير معروفة' });
  }
  const width = Number(req.body.width);
  const height = Number(req.body.height);
  if (!width || !height || width > 832 || height > 12000 || !req.body.data) {
    return res.status(400).json({ success: false, message: 'بيانات الفاتورة غير صالحة' });
  }
  const bits = Buffer.from(String(req.body.data), 'base64');
  if (bits.length !== Math.ceil(width / 8) * height) {
    return res.status(400).json({ success: false, message: 'حجم صورة الفاتورة غير مطابق' });
  }

  const settings = await PrinterSettings.getSingleton();
  const override = req.user.role === 'admin' && req.body.ip;
  const ip   = override ? String(req.body.ip) : settings[`${station}Ip`];
  const port = Number(override ? req.body.port : settings[`${station}Port`]) || net.DEFAULT_PORT;
  if (!ip) return res.status(400).json({ success: false, message: 'لم يُضبط عنوان طابعة ' + (station === 'kitchen' ? 'المطبخ' : 'الكاشير') });

  try {
    await net.printRaster(ip, port, width, height, bits);
    res.json({ success: true, message: station === 'kitchen' ? 'أُرسلت فاتورة المطبخ ✓' : 'أُرسلت فاتورة الكاشير ✓' });
  } catch (err) {
    res.status(502).json({ success: false, message: err.message });
  }
});

module.exports = router;
