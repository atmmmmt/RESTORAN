'use strict';

/**
 * Attendance domain logic — turns raw fingerprint punches into the numbers
 * the manager actually cares about: who is in, who was late, how many hours
 * each person worked today / this week / this month, and what that costs.
 */

const { EventEmitter } = require('events');
const dayjs = require('dayjs');
const AttendanceLog      = require('../models/AttendanceLog');
const AttendanceSettings = require('../models/AttendanceSettings');
const Employee           = require('../models/Employee');
const AttendanceDevice   = require('../models/AttendanceDevice');

const DATE_FMT = 'YYYY-MM-DD';

/* Dashboard live feed. Unbounded listeners would be a leak, but each open
   SSE connection adds exactly one and removes it on close. */
const punchBus = new EventEmitter();
punchBus.setMaxListeners(50);

/** Subscribe to punches as they are ingested. Returns an unsubscribe fn. */
function onPunch(fn) {
  punchBus.on('punch', fn);
  return () => punchBus.off('punch', fn);
}

const toDateKey = d => dayjs(d).format(DATE_FMT);

/**
 * Is this a PIN a human could have entered on the keypad?
 *
 * Terminals report ids verbatim, control bytes included, so a mis-keyed
 * enrolment arrives as something like "". Adopting it would create an
 * employee whose PIN cannot be typed, searched for, or matched again.
 */
/**
 * Turn whatever id the terminal reports into the PIN we store.
 *
 * Fingers enrolled with an older build of the agent landed on a user whose
 * id is the PIN as a raw byte — PIN 4 became "\u0004" — and the terminal
 * stamps every punch from that finger with the same byte. Reading a lone
 * control character back as its code recovers the PIN those punches belong
 * to instead of discarding a real person's attendance.
 */
function normalizePin(raw) {
  const pin = String(raw ?? '').trim();
  if (pin.length === 1) {
    const code = pin.charCodeAt(0);
    if (code >= 1 && code <= 31) return String(code);
  }
  return pin;
}

function isUsablePin(pin) {
  return /^[0-9A-Za-z_-]{1,20}$/.test(pin);
}

/** Hourly rate: manual override wins, otherwise derive from the salary. */
function hourlyRateOf(emp) {
  if (!emp) return 0;
  if (emp.hourlyRateOverride > 0) return emp.hourlyRateOverride;
  const days  = emp.payPeriod === 'daily' ? 1 : emp.payPeriod === 'weekly' ? 5 : (emp.workingDays || 26);
  const hours = (emp.dailyHours || 8) * days;
  return hours > 0 ? (emp.monthlySalary || 0) / hours : 0;
}

/**
 * Re-derive in/out for every punch an employee made on a date.
 * Punches alternate: 1st in, 2nd out, 3rd in, 4th out…
 */
async function recomputeDirections(date, employeeId = null) {
  const filter = { date };
  if (employeeId) filter.employeeId = employeeId;

  const logs = await AttendanceLog.find(filter).sort({ employeeId: 1, timestamp: 1 });

  const byEmployee = new Map();
  for (const log of logs) {
    const key = String(log.employeeId || `${log.centerId || 'hq'}:${log.devicePin}` || 'unknown');
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key).push(log);
  }

  const ops = [];
  for (const group of byEmployee.values()) {
    group.forEach((log, i) => {
      const direction = i % 2 === 0 ? 'in' : 'out';
      if (log.direction !== direction) {
        ops.push({ updateOne: { filter: { _id: log._id }, update: { $set: { direction } } } });
      }
    });
  }

  if (ops.length) await AttendanceLog.bulkWrite(ops);
  return ops.length;
}

/**
 * Absorb one agent's report: the users enrolled on its terminal and every
 * punch it has seen since we last heard from it.
 *
 * Agents re-send their backlog whenever they are unsure what landed, so this
 * must be idempotent — the unique index on (centerId, devicePin, timestamp)
 * is what makes a replay a no-op rather than a duplicated shift.
 */
async function ingestFromAgent(device, { users = [], punches = [] } = {}) {
  const centerId = device.centerId || null;

  /* 1 — users: adopt anyone enrolled on the terminal we don't know about */
  let createdEmployees = 0;
  for (const u of users) {
    const pin = normalizePin(u.userId ?? u.uid ?? u.pin);
    if (!isUsablePin(pin)) continue;

    const existing = await Employee.findOne({ devicePin: pin, centerId });
    if (existing) {
      if (!existing.syncedToDevice) {
        existing.syncedToDevice = true;
        await existing.save();
      }
      continue;
    }

    await Employee.create({
      centerId,
      name: (u.name || `موظف ${pin}`).trim(),
      devicePin: pin,
      monthlySalary: 0,
      syncedToDevice: true,
      fingerprintEnrolled: true,
      notes: 'أُضيف تلقائياً من جهاز البصمة',
    });
    createdEmployees++;
  }

  /* 2 — punches. Scope the PIN lookup to this branch: the same PIN at
     another branch is a different person entirely. */
  const employees = await Employee.find({ devicePin: { $ne: '' }, centerId });
  const byPin = new Map(employees.map(e => [String(e.devicePin), e]));

  let inserted = 0;
  const touchedDates = new Set();

  for (const rec of punches) {
    const pin = normalizePin(rec.user_id ?? rec.userId ?? rec.uid ?? rec.pin);
    const ts  = rec.record_time ?? rec.timestamp ?? rec.time;
    if (!isUsablePin(pin) || !ts) continue;

    const when = new Date(ts);
    if (Number.isNaN(when.getTime())) continue;

    const emp  = byPin.get(pin);
    const date = toDateKey(when);

    try {
      await AttendanceLog.create({
        centerId,
        employeeId:   emp?._id,
        employeeName: emp?.name || `موظف ${pin}`,
        devicePin:    pin,
        timestamp:    when,
        date,
        source:       'device',
      });
      inserted++;
      touchedDates.add(date);

      punchBus.emit('punch', {
        centerId,
        devicePin:  pin,
        employeeId: emp?._id || null,
        name:       emp?.name || `موظف ${pin}`,
        at:         when,
      });
    } catch (err) {
      // Duplicate key = we already have this punch. That is the normal path
      // on every replay, so it is not an error worth surfacing.
      if (err?.code !== 11000) throw err;
    }
  }

  for (const date of touchedDates) await recomputeDirections(date);

  device.lastSyncAt    = new Date();
  device.lastSyncCount = inserted;
  device.lastSeenAt    = new Date();
  await device.save();

  return { ok: true, inserted, createdEmployees, received: punches.length };
}

/**
 * Health of every branch terminal, for the dashboard's device panel.
 * An agent that has gone quiet is more useful to surface than a hard error:
 * punches keep accruing on the terminal and arrive once it reconnects.
 */
const AGENT_STALE_MS = 3 * 60 * 1000;

async function getDevicesStatus() {
  const devices = await AttendanceDevice.find().populate('centerId', 'name').sort({ createdAt: 1 });
  const now = Date.now();

  return devices.map(d => {
    const seenAgo = d.lastSeenAt ? now - d.lastSeenAt.getTime() : null;
    const online  = seenAgo !== null && seenAgo < AGENT_STALE_MS;

    return {
      id:            d._id,
      centerId:      d.centerId?._id || null,
      centerName:    d.centerId?.name || 'الإدارة',
      name:          d.name,
      deviceIp:      d.deviceIp,
      devicePort:    d.devicePort,
      agentOnline:   online,
      deviceReachable: online && d.deviceReachable,
      lastSeenAt:    d.lastSeenAt,
      lastSyncAt:    d.lastSyncAt,
      lastSyncCount: d.lastSyncCount,
      lastError:     d.lastError,
      agentVersion:  d.agentVersion,
      agentKeyHint:  d.agentKeyHint,
      discovered:    d.discovered || [],
      discoveredAt:  d.discoveredAt,
      deviceSerial:  d.deviceSerial,
      isActive:      d.isActive,
    };
  });
}

/**
 * Everyone's status for one day: in/out times, worked minutes, lateness.
 */
/**
 * Turn a branch scope into an Employee filter.
 *   undefined / 'all' → every branch
 *   'hq'              → head office staff (no branch set)
 *   <id>              → that branch only
 */
function employeeScope(scope) {
  if (scope === undefined || scope === 'all' || scope === null) return {};
  if (scope === 'hq') return { $or: [{ centerId: null }, { centerId: { $exists: false } }] };
  return { centerId: scope };
}

async function getDailyBoard(date = toDateKey(new Date()), scope) {
  const settings  = await AttendanceSettings.getSingleton();
  const employees = await Employee.find({ isActive: true, ...employeeScope(scope) }).sort({ name: 1 });
  const logs      = await AttendanceLog.find({ date }).sort({ timestamp: 1 });

  const byEmployee = new Map();
  for (const log of logs) {
    const key = String(log.employeeId || '');
    if (!key) continue;
    if (!byEmployee.has(key)) byEmployee.set(key, []);
    byEmployee.get(key).push(log);
  }

  const [sh, sm] = String(settings.workStartTime || '08:00').split(':').map(Number);
  const shiftStart = dayjs(`${date} 00:00`).hour(sh || 0).minute(sm || 0).second(0);
  const lateAfter  = shiftStart.add(settings.graceMinutes || 0, 'minute');

  const rows = employees.map(emp => {
    const punches = byEmployee.get(String(emp._id)) || [];

    const checkIn  = punches.find(p => p.direction === 'in') || null;
    const outs     = punches.filter(p => p.direction === 'out');
    const checkOut = outs.length ? outs[outs.length - 1] : null;

    // Pair consecutive in→out punches; an unclosed final "in" counts up to now.
    let workedMinutes = 0;
    let openSince = null;
    for (const p of punches) {
      if (p.direction === 'in') {
        openSince = dayjs(p.timestamp);
      } else if (openSince) {
        workedMinutes += dayjs(p.timestamp).diff(openSince, 'minute');
        openSince = null;
      }
    }
    const isToday = date === toDateKey(new Date());
    if (openSince && isToday) workedMinutes += dayjs().diff(openSince, 'minute');

    let lateMinutes = 0;
    if (checkIn && dayjs(checkIn.timestamp).isAfter(lateAfter)) {
      lateMinutes = dayjs(checkIn.timestamp).diff(shiftStart, 'minute');
    }

    const status = !punches.length ? 'absent' : (lateMinutes > 0 ? 'late' : 'present');
    const rate   = hourlyRateOf(emp);
    const hours  = workedMinutes / 60;

    return {
      employeeId:   emp._id,
      name:         emp.name,
      role:         emp.role,
      department:   emp.department,
      devicePin:    emp.devicePin,
      fingerprintEnrolled: emp.fingerprintEnrolled,
      status,
      checkIn:      checkIn?.timestamp || null,
      checkOut:     checkOut?.timestamp || null,
      stillIn:      !!openSince,
      workedMinutes,
      workedHours:  Number(hours.toFixed(2)),
      lateMinutes,
      hourlyRate:   Number(rate.toFixed(2)),
      dayPay:       Number((hours * rate).toFixed(2)),
      punches: punches.map(p => ({
        id: p._id, at: p.timestamp, direction: p.direction, source: p.source,
      })),
    };
  });

  const totals = rows.reduce((acc, r) => ({
    present: acc.present + (r.status !== 'absent' ? 1 : 0),
    late:    acc.late    + (r.status === 'late' ? 1 : 0),
    absent:  acc.absent  + (r.status === 'absent' ? 1 : 0),
    hours:   acc.hours   + r.workedHours,
    pay:     acc.pay     + r.dayPay,
  }), { present: 0, late: 0, absent: 0, hours: 0, pay: 0 });

  totals.hours = Number(totals.hours.toFixed(2));
  totals.pay   = Number(totals.pay.toFixed(2));

  return { date, settings, rows, totals };
}

/**
 * Hours + cost for one employee across a date range, broken down by day.
 * Used for the weekly / monthly views.
 */
async function getEmployeeSummary(employeeId, from, to) {
  const emp = await Employee.findById(employeeId);
  if (!emp) return null;

  const logs = await AttendanceLog.find({
    employeeId,
    date: { $gte: from, $lte: to },
  }).sort({ timestamp: 1 });

  const byDate = new Map();
  for (const log of logs) {
    if (!byDate.has(log.date)) byDate.set(log.date, []);
    byDate.get(log.date).push(log);
  }

  const settings = await AttendanceSettings.getSingleton();
  const [sh, sm] = String(settings.workStartTime || '08:00').split(':').map(Number);
  const rate = hourlyRateOf(emp);
  const today = toDateKey(new Date());

  const days = [];
  for (const [date, punches] of [...byDate.entries()].sort()) {
    let minutes = 0;
    let openSince = null;
    for (const p of punches) {
      if (p.direction === 'in') openSince = dayjs(p.timestamp);
      else if (openSince) { minutes += dayjs(p.timestamp).diff(openSince, 'minute'); openSince = null; }
    }
    if (openSince && date === today) minutes += dayjs().diff(openSince, 'minute');

    const shiftStart = dayjs(`${date} 00:00`).hour(sh || 0).minute(sm || 0).second(0);
    const lateAfter  = shiftStart.add(settings.graceMinutes || 0, 'minute');
    const firstIn    = punches.find(p => p.direction === 'in');
    const lateMin    = firstIn && dayjs(firstIn.timestamp).isAfter(lateAfter)
      ? dayjs(firstIn.timestamp).diff(shiftStart, 'minute') : 0;

    const hours = minutes / 60;
    days.push({
      date,
      checkIn:  firstIn?.timestamp || null,
      checkOut: punches.filter(p => p.direction === 'out').slice(-1)[0]?.timestamp || null,
      workedMinutes: minutes,
      workedHours: Number(hours.toFixed(2)),
      lateMinutes: lateMin,
      pay: Number((hours * rate).toFixed(2)),
      punchCount: punches.length,
    });
  }

  const totalHours = days.reduce((s, d) => s + d.workedHours, 0);
  const lateHours  = days.reduce((s, d) => s + d.lateMinutes, 0) / 60;

  return {
    employee: {
      id: emp._id, name: emp.name, role: emp.role,
      department: emp.department, devicePin: emp.devicePin,
      monthlySalary: emp.monthlySalary,
      hourlyRate: Number(rate.toFixed(2)),
    },
    from, to,
    days,
    totals: {
      daysAttended: days.length,
      totalHours:   Number(totalHours.toFixed(2)),
      lateHours:    Number(lateHours.toFixed(2)),
      totalPay:     Number((totalHours * rate).toFixed(2)),
    },
  };
}

/** Same shape as getEmployeeSummary but for every active employee. */
async function getRangeSummary(from, to, scope) {
  const employees = await Employee.find({ isActive: true, ...employeeScope(scope) }).sort({ name: 1 });
  const out = [];
  for (const emp of employees) {
    const s = await getEmployeeSummary(emp._id, from, to);
    if (s) out.push({ ...s.employee, ...s.totals });
  }
  return out;
}

module.exports = {
  toDateKey,
  onPunch,
  isUsablePin,
  normalizePin,
  employeeScope,
  hourlyRateOf,
  recomputeDirections,
  ingestFromAgent,
  getDevicesStatus,
  getDailyBoard,
  getEmployeeSummary,
  getRangeSummary,
};
