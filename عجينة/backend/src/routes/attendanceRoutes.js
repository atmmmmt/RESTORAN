'use strict';

const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const dayjs  = require('dayjs');

const { protect, requireAdmin, requireStaff } = require('../middleware/auth');
const User               = require('../models/User');
const Employee           = require('../models/Employee');
const AttendanceLog      = require('../models/AttendanceLog');
const AttendanceSettings = require('../models/AttendanceSettings');
const AttendanceDevice = require('../models/AttendanceDevice');
const DeviceCommand    = require('../models/DeviceCommand');
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

  /* The agent posts punches; ingestion stores them and emits here, so the
     stream only has to relay. Persisting again would double-count. */
  const unsubscribe = service.onPunch(punch => send('punch', punch));

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
    devices: await service.getDevicesStatus(),
  });
});

router.put('/settings', requireAdmin, async (req, res) => {
  /* Device addressing lives on AttendanceDevice now — one row per branch.
     What is left here are the shift rules, which are business-wide. */
  const allowed = [
    'workStartTime', 'workEndTime', 'graceMinutes',
    'autoSyncEnabled', 'autoSyncSeconds',
  ];
  const $set = {};
  for (const k of allowed) if (req.body[k] !== undefined) $set[k] = req.body[k];

  const settings = await AttendanceSettings.findOneAndUpdate({}, { $set }, { upsert: true, new: true, runValidators: true });
  res.json({ success: true, settings, message: 'تم حفظ الإعدادات' });
});

/* ── Branch devices ────────────────────────────────────────────
   The server cannot dial a terminal any more, so these routes manage the
   registration of each branch's unit and hand work to its agent. Anything
   that touches the hardware is queued, not awaited. */

router.get('/devices', requireStaff, async (req, res) => {
  res.json({ success: true, devices: await service.getDevicesStatus() });
});

/** Register a branch's terminal and mint the key its agent will use. */
router.post('/devices', requireAdmin, async (req, res) => {
  const { centerId = null, name = '', deviceIp, devicePort, deviceTimeout } = req.body || {};

  const exists = await AttendanceDevice.findOne({ centerId: centerId || null });
  if (exists) {
    return res.status(409).json({ success: false, message: 'هذا الفرع لديه جهاز مسجّل بالفعل' });
  }

  const device = new AttendanceDevice({
    centerId: centerId || null,
    name: String(name).trim(),
    ...(deviceIp      ? { deviceIp: String(deviceIp).trim() } : {}),
    ...(devicePort    ? { devicePort: Number(devicePort) } : {}),
    ...(deviceTimeout ? { deviceTimeout: Number(deviceTimeout) } : {}),
  });

  const key = AttendanceDevice.generateKey();
  device.setAgentKey(key);
  await device.save();

  // The only time the plaintext key is ever available.
  res.status(201).json({
    success: true,
    device: { id: device._id, centerId: device.centerId, name: device.name, deviceIp: device.deviceIp },
    agentKey: key,
    message: 'تم تسجيل الجهاز — انسخ المفتاح الآن، لن يظهر مرة أخرى',
  });
});

router.put('/devices/:id', requireAdmin, async (req, res) => {
  const allowed = ['name', 'deviceIp', 'devicePort', 'deviceTimeout', 'isActive'];
  const $set = {};
  for (const k of allowed) if (req.body[k] !== undefined) $set[k] = req.body[k];

  const device = await AttendanceDevice.findByIdAndUpdate(req.params.id, { $set }, { new: true, runValidators: true });
  if (!device) return res.status(404).json({ success: false, message: 'الجهاز غير موجود' });

  res.json({ success: true, device, message: 'تم حفظ إعدادات الجهاز' });
});

/** Rotate the agent key — used when a branch machine is replaced. */
router.post('/devices/:id/rotate-key', requireAdmin, async (req, res) => {
  const device = await AttendanceDevice.findById(req.params.id);
  if (!device) return res.status(404).json({ success: false, message: 'الجهاز غير موجود' });

  const key = AttendanceDevice.generateKey();
  device.setAgentKey(key);
  await device.save();

  res.json({ success: true, agentKey: key, message: 'تم توليد مفتاح جديد — الوكيل القديم سيتوقف' });
});

router.delete('/devices/:id', requireAdmin, async (req, res) => {
  const device = await AttendanceDevice.findByIdAndDelete(req.params.id);
  if (!device) return res.status(404).json({ success: false, message: 'الجهاز غير موجود' });
  await DeviceCommand.deleteMany({ deviceId: device._id });
  res.json({ success: true, message: 'تم حذف الجهاز' });
});

/* ── Command queue ─────────────────────────────────────────── */

/** Resolve a branch to its device, for queueing. */
async function deviceForCenter(centerId) {
  return AttendanceDevice.findOne({ centerId: centerId || null, isActive: true });
}

async function enqueue({ deviceId, type, payload = {}, userId = null }) {
  return DeviceCommand.create({ deviceId, type, payload, requestedBy: userId });
}

router.get('/commands', requireStaff, async (req, res) => {
  const filter = {};
  if (req.query.deviceId) filter.deviceId = req.query.deviceId;

  const commands = await DeviceCommand.find(filter).sort({ createdAt: -1 }).limit(50);
  res.json({ success: true, commands });
});

/** Ask a branch's terminal to report itself. */
router.post('/devices/:id/refresh', requireAdmin, async (req, res) => {
  const device = await AttendanceDevice.findById(req.params.id);
  if (!device) return res.status(404).json({ success: false, message: 'الجهاز غير موجود' });

  await enqueue({ deviceId: device._id, type: 'get-info', userId: req.user?._id });
  await enqueue({ deviceId: device._id, type: 'sync-time', userId: req.user?._id });

  res.json({ success: true, message: 'تم إرسال الطلب — سينفّذه وكيل الفرع خلال ثوانٍ' });
});

/** Ask a branch's agent to sweep its LAN for terminals. */
router.post('/devices/:id/scan', requireAdmin, async (req, res) => {
  const device = await AttendanceDevice.findById(req.params.id);
  if (!device) return res.status(404).json({ success: false, message: 'الجهاز غير موجود' });

  await enqueue({ deviceId: device._id, type: 'scan-network', userId: req.user?._id });
  res.json({ success: true, message: 'جارٍ البحث في شبكة الفرع — النتائج خلال نصف دقيقة' });
});

/* ── Employee ⇄ device ─────────────────────────────────────── */

/** Queue an employee push, assigning a PIN if they lack one. */
router.post('/employees/:id/push', requireAdmin, async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  const device = await deviceForCenter(emp.centerId);
  if (!device) {
    return res.status(400).json({ success: false, message: 'لا يوجد جهاز بصمة مسجّل لفرع هذا الموظف' });
  }

  if (!emp.devicePin) {
    /* PINs are per-terminal slots, so uniqueness only has to hold within
       the branch — reusing 1..n at each branch keeps them dense. */
    const used = (await Employee.find({ centerId: emp.centerId, devicePin: { $ne: '' } }).select('devicePin'))
      .map(e => Number(e.devicePin)).filter(n => Number.isFinite(n));
    emp.devicePin = String(used.length ? Math.max(...used) + 1 : 1);
    await emp.save();
  }

  await enqueue({
    deviceId: device._id,
    type: 'push-user',
    payload: { uid: Number(emp.devicePin), pin: emp.devicePin, name: emp.name, employeeId: emp._id },
    userId: req.user?._id,
  });

  res.json({ success: true, employee: emp, message: `تم إرسال ${emp.name} إلى طابور جهاز الفرع` });
});

/** Queue enrolment: the terminal will wait for the finger, not this request. */
router.post('/employees/:id/enroll', requireAdmin, async (req, res) => {
  const { fingerIndex = 0 } = req.body;

  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  if (!emp.devicePin || !emp.syncedToDevice) {
    return res.status(400).json({ success: false, message: 'أرسل الموظف إلى الجهاز أولاً، وانتظر تأكيد الإرسال' });
  }

  const device = await deviceForCenter(emp.centerId);
  if (!device) return res.status(400).json({ success: false, message: 'لا يوجد جهاز بصمة مسجّل لفرع هذا الموظف' });

  await enqueue({
    deviceId: device._id,
    type: 'start-enroll',
    payload: {
      uid: Number(emp.devicePin), pin: emp.devicePin,
      fingerIndex: Number(fingerIndex), employeeId: emp._id,
    },
    userId: req.user?._id,
  });

  res.json({ success: true, message: `الجهاز سيجهز خلال ثوانٍ — ${emp.name} يضع إصبعه 3 مرات` });
});

router.delete('/employees/:id/fingerprints', requireAdmin, async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  if (!emp.devicePin) return res.status(400).json({ success: false, message: 'الموظف غير مرتبط بالجهاز' });

  const device = await deviceForCenter(emp.centerId);
  if (!device) return res.status(400).json({ success: false, message: 'لا يوجد جهاز بصمة مسجّل لفرع هذا الموظف' });

  await enqueue({
    deviceId: device._id,
    type: 'clear-fingerprints',
    payload: { uid: Number(emp.devicePin), pin: emp.devicePin, employeeId: emp._id },
    userId: req.user?._id,
  });
  res.json({ success: true, message: 'تم إرسال طلب مسح البصمات' });
});

router.delete('/employees/:id/device', requireAdmin, async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  if (!emp.devicePin) return res.status(400).json({ success: false, message: 'الموظف غير مرتبط بالجهاز' });

  const device = await deviceForCenter(emp.centerId);
  if (!device) return res.status(400).json({ success: false, message: 'لا يوجد جهاز بصمة مسجّل لفرع هذا الموظف' });

  await enqueue({
    deviceId: device._id,
    type: 'delete-user',
    payload: { uid: Number(emp.devicePin), pin: emp.devicePin, employeeId: emp._id },
    userId: req.user?._id,
  });
  res.json({ success: true, message: 'تم إرسال طلب حذف الموظف من الجهاز' });
});

/* ── Sync ──────────────────────────────────────────────────── */

router.post('/sync', requireAdmin, async (req, res) => {
  /* Agents push on their own schedule, so a manual sync is a nudge rather
     than a fetch: queue a user-list refresh on every live branch and let the
     next poll carry it. */
  const devices = await AttendanceDevice.find({ isActive: true });
  if (!devices.length) {
    return res.status(400).json({ success: false, message: 'لا يوجد أي جهاز بصمة مسجّل' });
  }

  await DeviceCommand.insertMany(devices.map(d => ({
    deviceId: d._id, type: 'get-users', requestedBy: req.user?._id,
  })));

  res.json({
    success: true,
    queued: devices.length,
    message: `تم طلب المزامنة من ${devices.length} فرع — ستصل النتائج خلال ثوانٍ`,
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
