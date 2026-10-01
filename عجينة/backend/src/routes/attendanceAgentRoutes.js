'use strict';

/**
 * The branch-agent API.
 *
 * Everything here is called by an unattended process inside a branch, not by
 * a logged-in human, so it authenticates with a per-device key instead of a
 * JWT and is mounted before the dashboard's `protect` middleware.
 *
 * All traffic is outbound from the branch: the agent dials us. That is the
 * whole point — branch LANs are behind NAT and every one of them numbers
 * itself 192.168.1.x, so there is no address here that could dial them back.
 */

const router = require('express').Router();
const rateLimit = require('express-rate-limit');

const AttendanceDevice = require('../models/AttendanceDevice');
const DeviceCommand    = require('../models/DeviceCommand');
const service          = require('../services/attendanceService');
const Employee         = require('../models/Employee');

/* Agents poll on a timer; the limit is generous enough for a 5s poll from a
   handful of branches but still caps a misbehaving or hostile client. */
router.use(rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'طلبات كثيرة من الوكيل' },
}));

/** Resolve X-Agent-Key → device, or 401. */
async function authenticateAgent(req, res, next) {
  const key = req.get('X-Agent-Key') || '';
  if (!key) {
    return res.status(401).json({ success: false, message: 'مفتاح الوكيل مفقود' });
  }

  const device = await AttendanceDevice.findByAgentKey(key);
  if (!device) {
    return res.status(401).json({ success: false, message: 'مفتاح الوكيل غير صالح' });
  }

  req.device = device;
  next();
}

router.use(authenticateAgent);

/* ── POST /api/attendance-agent/hello ──────────────────────
   Heartbeat + what the agent can see on its LAN. Also hands back the
   terminal's address so a branch never has to be configured twice. */
router.post('/hello', async (req, res) => {
  const { agentVersion, deviceReachable, deviceSerial, deviceVersion, error, discovered } = req.body || {};
  const d = req.device;

  d.lastSeenAt      = new Date();
  d.agentVersion    = String(agentVersion || '').slice(0, 32);
  d.deviceReachable = !!deviceReachable;
  d.lastError       = String(error || '').slice(0, 300);
  /* The agent sweeps its LAN when it cannot reach the configured address, so
     the dashboard can offer a pick-list rather than a blank IP field. */
  if (Array.isArray(discovered)) {
    d.discovered   = discovered.slice(0, 32).map(ip => String(ip).slice(0, 45));
    d.discoveredAt = new Date();
  }
  if (deviceSerial)  d.deviceSerial  = String(deviceSerial).slice(0, 64);
  if (deviceVersion) d.deviceVersion = String(deviceVersion).slice(0, 64);
  await d.save();

  res.json({
    success: true,
    device: {
      name:       d.name,
      deviceIp:   d.deviceIp,
      devicePort: d.devicePort,
      timeout:    d.deviceTimeout,
    },
  });
});

/* ── POST /api/attendance-agent/sync ───────────────────────
   The agent's whole report: users on the terminal plus every punch it holds.
   Idempotent by design — replays collapse on the unique punch index. */
router.post('/sync', async (req, res) => {
  const { users, punches } = req.body || {};

  if (punches && !Array.isArray(punches)) {
    return res.status(400).json({ success: false, message: 'punches يجب أن تكون مصفوفة' });
  }
  /* A terminal holding more than this in one batch means the agent has been
     offline for a long time; it will page through the rest on later polls. */
  if (Array.isArray(punches) && punches.length > 5000) {
    return res.status(413).json({ success: false, message: 'دفعة كبيرة جداً — أرسلها على دفعات' });
  }

  const result = await service.ingestFromAgent(req.device, {
    users:   Array.isArray(users) ? users : [],
    punches: Array.isArray(punches) ? punches : [],
  });

  res.json({ success: true, ...result });
});

/* ── GET /api/attendance-agent/commands ────────────────────
   Claim the queued jobs for this branch. Anything a dead agent left in
   'running' past its expiry is reclaimed rather than stranded. */
router.get('/commands', async (req, res) => {
  await DeviceCommand.updateMany(
    { deviceId: req.device._id, status: 'running', expiresAt: { $lt: new Date() } },
    { $set: { status: 'failed', message: 'انتهت مهلة التنفيذ — الوكيل لم يُكمل المهمة' } }
  );

  const pending = await DeviceCommand.find({ deviceId: req.device._id, status: 'pending' })
    .sort({ createdAt: 1 })
    .limit(10);

  const ids = pending.map(c => c._id);
  if (ids.length) {
    await DeviceCommand.updateMany(
      { _id: { $in: ids } },
      { $set: { status: 'running', claimedAt: new Date() } }
    );
  }

  res.json({
    success: true,
    commands: pending.map(c => ({ id: c._id, type: c.type, payload: c.payload })),
  });
});

/* ── POST /api/attendance-agent/commands/:id ───────────────
   Report how a job went. */
router.post('/commands/:id', async (req, res) => {
  const { ok, result, message } = req.body || {};

  const cmd = await DeviceCommand.findOne({ _id: req.params.id, deviceId: req.device._id });
  if (!cmd) return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });

  cmd.status     = ok ? 'done' : 'failed';
  cmd.result     = result ?? null;
  cmd.message    = String(message || '').slice(0, 300);
  cmd.finishedAt = new Date();
  await cmd.save();

  /* The employee's device flags are a claim about the hardware, so they are
     only safe to write once the hardware has answered. Setting them when the
     job was queued is what made a card read "fingerprint enrolled" for a
     terminal that had refused the request. */
  const employeeId = cmd.payload?.employeeId;
  if (employeeId) {
    const patch = {
      'push-user':          ok ? { syncedToDevice: true } : null,
      'start-enroll':       ok ? { fingerprintEnrolled: true } : null,
      'clear-fingerprints': ok ? { fingerprintEnrolled: false } : null,
      'delete-user':        ok ? { syncedToDevice: false, fingerprintEnrolled: false } : null,
    }[cmd.type];

    if (patch) await Employee.findByIdAndUpdate(employeeId, { $set: patch });
  }

  res.json({ success: true });
});

module.exports = router;
