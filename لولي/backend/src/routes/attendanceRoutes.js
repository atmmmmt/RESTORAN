'use strict';

const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const dayjs  = require('dayjs');

const { protect, requireAdmin, requireStaff } = require('../middleware/auth');
const User               = require('../models/User');
const Employee           = require('../models/Employee');
const AttendanceLog      = require('../models/AttendanceLog');
const AttendanceSettings = require('../models/AttendanceSettings');
const zk       = require('../services/zktecoService');
const service  = require('../services/attendanceService');

/* ══════════════════════════════════════════════════════════════
   SSE stream — must be declared BEFORE the global auth middleware
   because EventSource cannot send an Authorization header; the
   token rides in the query string instead.
   ══════════════════════════════════════════════════════════════ */
router.get('/stream', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    // Watching punches arrive is a read — a supervisor needs it to follow
    // the day as it happens. The stream never accepts input.
    if (!user || user.isActive === false || !['admin', 'supervisor'].includes(user.role)) {
      return res.status(403).end();
    }
  } catch {
    return res.status(401).end();
  }

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection:      'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ }
  };

  /* Resolve the punch to a known employee so the toast can name them. */
  const unsubscribe = zk.onPunch(async raw => {
    const pin = String(raw?.user_id ?? raw?.userId ?? raw?.uid ?? '').trim();
    const at  = raw?.record_time ?? raw?.timestamp ?? raw?.time ?? new Date();

    let employee = null;
    try {
      if (pin) employee = await Employee.findOne({ devicePin: pin });
    } catch { /* keep streaming even if the lookup fails */ }

    // Persist immediately so the board is correct without waiting for a sync.
    if (pin) {
      const when = new Date(at);
      const date = service.toDateKey(when);
      try {
        await AttendanceLog.create({
          employeeId:   employee?._id,
          employeeName: employee?.name || `موظف ${pin}`,
          devicePin:    pin,
          timestamp:    when,
          date,
          source:       'device',
        });
        await service.recomputeDirections(date, employee?._id);
      } catch (err) {
        if (err?.code !== 11000) console.error('SSE punch save failed:', err.message);
      }
    }

    send('punch', {
      devicePin: pin,
      employeeId: employee?._id || null,
      name: employee?.name || `موظف ${pin}`,
      at,
    });
  });

  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* closed */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

/* Signed-in staff from here down. Each route then states its own level:
   a supervisor may READ the board so they can work out the day's wages,
   but every write — device control, enrolment, punches, settings — stays
   with the admin. */
router.use(protect);

/* ── Settings ──────────────────────────────────────────────── */

router.get('/settings', requireStaff, async (req, res) => {
  const settings = await AttendanceSettings.getSingleton();
  res.json({
    success: true,
    settings,
    driverAvailable: zk.driverAvailable(),
    device: zk.status(),
  });
});

router.put('/settings', requireAdmin, async (req, res) => {
  const allowed = [
    'deviceIp', 'devicePort', 'deviceTimeout',
    'workStartTime', 'workEndTime', 'graceMinutes',
    'autoSyncEnabled', 'autoSyncSeconds',
  ];
  const $set = {};
  for (const k of allowed) if (req.body[k] !== undefined) $set[k] = req.body[k];

  const settings = await AttendanceSettings.findOneAndUpdate({}, { $set }, { upsert: true, new: true, runValidators: true });
  res.json({ success: true, settings, message: 'تم حفظ الإعدادات' });
});

/* ── Device control ────────────────────────────────────────── */

router.get('/device/status', requireStaff, (req, res) => {
  res.json({ success: true, device: zk.status(), driverAvailable: zk.driverAvailable() });
});

router.post('/device/test-port', requireAdmin, async (req, res) => {
  const { ip, port } = req.body;
  if (!ip) return res.status(400).json({ success: false, message: 'عنوان IP مطلوب' });
  const open = await zk.testPort(ip, Number(port) || 4370, 3000);
  res.json({ success: true, open, message: open ? 'المنفذ مفتوح ✓' : 'المنفذ مغلق أو لا يوجد جهاز' });
});

router.post('/device/scan', requireAdmin, async (req, res) => {
  const { baseIp, port } = req.body;
  const found = await zk.scanNetwork(baseIp || '192.168.1.1', Number(port) || 4370);
  res.json({ success: true, found, message: found.length ? `تم العثور على ${found.length} جهاز` : 'لم يُعثر على أجهزة' });
});

router.post('/device/connect', requireAdmin, async (req, res) => {
  const settings = await AttendanceSettings.getSingleton();
  const ip      = req.body.ip      || settings.deviceIp;
  const port    = Number(req.body.port) || settings.devicePort;
  const timeout = Number(req.body.timeout) || settings.deviceTimeout;

  const result = await zk.connect({ ip, port, timeout, force: true });
  if (!result.ok) return res.status(502).json({ success: false, message: result.message });

  // Remember whatever actually worked.
  settings.deviceIp = ip;
  settings.devicePort = port;

  const info = await zk.getInfo();
  if (info.ok) {
    settings.deviceName    = String(info.data.name    ?? '') || settings.deviceName;
    settings.deviceSerial  = String(info.data.serial  ?? '') || settings.deviceSerial;
    settings.deviceVersion = String(info.data.version ?? '') || settings.deviceVersion;
  }
  await settings.save();

  await zk.bindRealtime();

  res.json({
    success: true,
    mode: result.mode,
    info: info.ok ? info.data : null,
    settings,
    message: `تم الاتصال بالجهاز عبر ${result.mode.toUpperCase()}`,
  });
});

router.post('/device/disconnect', requireAdmin, async (req, res) => {
  await zk.disconnect();
  res.json({ success: true, message: 'تم قطع الاتصال' });
});

router.get('/device/info', requireAdmin, async (req, res) => {
  const info = await zk.getInfo();
  if (!info.ok) return res.status(502).json({ success: false, message: info.message });
  res.json({ success: true, info: info.data });
});

router.post('/device/sync-time', requireAdmin, async (req, res) => {
  const result = await zk.setDeviceTime(new Date());
  if (!result.ok) return res.status(502).json({ success: false, message: result.message });
  res.json({ success: true, message: 'تمت مزامنة ساعة الجهاز' });
});

router.get('/device/users', requireAdmin, async (req, res) => {
  const result = await zk.getUsers();
  if (!result.ok) return res.status(502).json({ success: false, message: result.message });
  res.json({ success: true, users: result.data });
});

/* ── Employee ⇄ device ─────────────────────────────────────── */

/** Push an employee to the terminal, assigning a PIN if they lack one. */
router.post('/employees/:id/push', requireAdmin, async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  if (!emp.devicePin) {
    // Next free numeric PIN — device slots are numbers, so keep them dense.
    const used = (await Employee.find({ devicePin: { $ne: '' } }).select('devicePin'))
      .map(e => Number(e.devicePin)).filter(n => Number.isFinite(n));
    emp.devicePin = String(used.length ? Math.max(...used) + 1 : 1);
  }

  const result = await zk.setUser({ uid: Number(emp.devicePin), pin: emp.devicePin, name: emp.name });
  if (!result.ok) return res.status(502).json({ success: false, message: result.message });

  emp.syncedToDevice = true;
  await emp.save();

  res.json({ success: true, employee: emp, message: `تم إرسال ${emp.name} إلى الجهاز` });
});

/** Put the terminal into enrollment mode for this employee's finger. */
router.post('/employees/:id/enroll', requireAdmin, async (req, res) => {
  const { fingerIndex = 0 } = req.body;

  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  if (!emp.devicePin) {
    return res.status(400).json({ success: false, message: 'أرسل الموظف إلى الجهاز أولاً' });
  }

  const result = await zk.startEnroll({
    uid: Number(emp.devicePin), pin: emp.devicePin, fingerIndex: Number(fingerIndex),
  });
  if (!result.ok) return res.status(502).json({ success: false, message: result.message });

  emp.fingerprintEnrolled = true;
  await emp.save();

  res.json({ success: true, message: `الجهاز جاهز — ${emp.name} يضع إصبعه 3 مرات` });
});

router.delete('/employees/:id/fingerprints', requireAdmin, async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  if (!emp.devicePin) return res.status(400).json({ success: false, message: 'الموظف غير مرتبط بالجهاز' });

  const result = await zk.clearFingerprints(Number(emp.devicePin));
  if (!result.ok) return res.status(502).json({ success: false, message: result.message });

  emp.fingerprintEnrolled = false;
  await emp.save();
  res.json({ success: true, message: 'تم مسح بصمات الموظف' });
});

router.delete('/employees/:id/device', requireAdmin, async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  if (!emp.devicePin) return res.status(400).json({ success: false, message: 'الموظف غير مرتبط بالجهاز' });

  const result = await zk.deleteUser(Number(emp.devicePin));
  if (!result.ok) return res.status(502).json({ success: false, message: result.message });

  emp.syncedToDevice = false;
  emp.fingerprintEnrolled = false;
  await emp.save();
  res.json({ success: true, message: 'تم حذف الموظف من الجهاز' });
});

/* ── Sync ──────────────────────────────────────────────────── */

router.post('/sync', requireAdmin, async (req, res) => {
  const result = await service.syncFromDevice();
  if (!result.ok) return res.status(502).json({ success: false, message: result.message });
  res.json({
    success: true,
    ...result,
    message: `تمت المزامنة — ${result.inserted} حركة جديدة`
      + (result.createdEmployees ? ` و${result.createdEmployees} موظف جديد` : ''),
  });
});

/* ── Boards & reports ──────────────────────────────────────── */

router.get('/daily', requireStaff, async (req, res) => {
  const date = req.query.date || service.toDateKey(new Date());
  // ?center=all | hq | <branchId>
  res.json({ success: true, ...(await service.getDailyBoard(date, req.query.center)) });
});

router.get('/summary', requireStaff, async (req, res) => {
  const to   = req.query.to   || service.toDateKey(new Date());
  const from = req.query.from || dayjs(to).startOf('month').format('YYYY-MM-DD');
  res.json({
    success: true, from, to,
    rows: await service.getRangeSummary(from, to, req.query.center),
  });
});

router.get('/employee/:id', requireStaff, async (req, res) => {
  const to   = req.query.to   || service.toDateKey(new Date());
  const from = req.query.from || dayjs(to).startOf('month').format('YYYY-MM-DD');

  const data = await service.getEmployeeSummary(req.params.id, from, to);
  if (!data) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  res.json({ success: true, ...data });
});

/* ── Manual punch (device down / forgot to scan) ───────────── */

router.post('/punch', requireAdmin, async (req, res) => {
  const { employeeId, at, notes } = req.body;
  const emp = await Employee.findById(employeeId);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  const when = at ? new Date(at) : new Date();
  if (Number.isNaN(when.getTime())) {
    return res.status(400).json({ success: false, message: 'التوقيت غير صحيح' });
  }
  const date = service.toDateKey(when);

  try {
    await AttendanceLog.create({
      employeeId: emp._id,
      employeeName: emp.name,
      devicePin: emp.devicePin || `manual-${emp._id}`,
      timestamp: when,
      date,
      source: 'manual',
      notes: notes || '',
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: 'توجد حركة مسجّلة بنفس التوقيت' });
    }
    throw err;
  }

  await service.recomputeDirections(date, emp._id);
  res.status(201).json({ success: true, message: 'تمت إضافة الحركة' });
});

router.delete('/punch/:id', requireAdmin, async (req, res) => {
  const log = await AttendanceLog.findById(req.params.id);
  if (!log) return res.status(404).json({ success: false, message: 'الحركة غير موجودة' });

  const { date, employeeId } = log;
  await log.deleteOne();
  await service.recomputeDirections(date, employeeId);

  res.json({ success: true, message: 'تم حذف الحركة' });
});

/* ── Danger zone ───────────────────────────────────────────── */

router.delete('/reset', requireAdmin, async (req, res) => {
  const { logs, employees } = req.body || {};
  const out = {};

  if (logs !== false) {
    out.logsDeleted = (await AttendanceLog.deleteMany({})).deletedCount;
  }
  if (employees === true) {
    out.employeesDeleted = (await Employee.deleteMany({})).deletedCount;
  }

  res.json({ success: true, ...out, message: 'تم مسح البيانات مع الإبقاء على الإعدادات' });
});

module.exports = router;
