'use strict';

/**
 * Attendance domain logic — turns raw fingerprint punches into the numbers
 * the manager actually cares about: who is in, who was late, how many hours
 * each person worked today / this week / this month, and what that costs.
 */

const dayjs = require('dayjs');
const AttendanceLog      = require('../models/AttendanceLog');
const AttendanceSettings = require('../models/AttendanceSettings');
const Employee           = require('../models/Employee');
const zk                 = require('./zktecoService');

const DATE_FMT = 'YYYY-MM-DD';

const toDateKey = d => dayjs(d).format(DATE_FMT);

/** Hourly rate: manual override wins, otherwise derive from the salary. */
function hourlyRateOf(emp) {
  if (!emp) return 0;
  if (emp.hourlyRateOverride > 0) return emp.hourlyRateOverride;
  const days  = emp.payPeriod === 'weekly' ? 5 : (emp.workingDays || 26);
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
    const key = String(log.employeeId || log.devicePin || 'unknown');
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
 * Pull users + punches off the terminal and persist anything new.
 * Employees found on the device but missing locally are created so the
 * manager never has to key the same person in twice.
 */
async function syncFromDevice() {
  const settings = await AttendanceSettings.getSingleton();

  const conn = await zk.connect({
    ip: settings.deviceIp,
    port: settings.devicePort,
    timeout: settings.deviceTimeout,
  });
  if (!conn.ok) return { ok: false, message: conn.message };

  /* 1 — users: adopt anyone enrolled on the device we don't know about */
  let createdEmployees = 0;
  const usersRes = await zk.getUsers();
  if (usersRes.ok) {
    for (const u of usersRes.data) {
      const pin = String(u.userId ?? u.uid ?? '').trim();
      if (!pin) continue;

      const existing = await Employee.findOne({ devicePin: pin });
      if (existing) {
        if (!existing.syncedToDevice) {
          existing.syncedToDevice = true;
          await existing.save();
        }
        continue;
      }

      await Employee.create({
        name: (u.name || `موظف ${pin}`).trim(),
        devicePin: pin,
        monthlySalary: 0,
        syncedToDevice: true,
        fingerprintEnrolled: true,
        notes: 'أُضيف تلقائياً من جهاز البصمة',
      });
      createdEmployees++;
    }
  }

  /* 2 — punches */
  const attRes = await zk.getAttendances();
  if (!attRes.ok) return { ok: false, message: attRes.message };

  const employees = await Employee.find({ devicePin: { $ne: '' } });
  const byPin = new Map(employees.map(e => [String(e.devicePin), e]));

  let inserted = 0;
  const touchedDates = new Set();

  for (const rec of attRes.data) {
    const pin = String(rec.user_id ?? rec.userId ?? rec.uid ?? '').trim();
    const ts  = rec.record_time ?? rec.timestamp ?? rec.time;
    if (!pin || !ts) continue;

    const when = new Date(ts);
    if (Number.isNaN(when.getTime())) continue;

    const emp  = byPin.get(pin);
    const date = toDateKey(when);

    try {
      await AttendanceLog.create({
        employeeId:   emp?._id,
        employeeName: emp?.name || `موظف ${pin}`,
        devicePin:    pin,
        timestamp:    when,
        date,
        source:       'device',
      });
      inserted++;
      touchedDates.add(date);
    } catch (err) {
      // Duplicate key = we already have this punch. That is the normal path
      // on every re-sync, so it is not an error worth surfacing.
      if (err?.code !== 11000) throw err;
    }
  }

  for (const date of touchedDates) await recomputeDirections(date);

  settings.lastSyncAt    = new Date();
  settings.lastSyncCount = inserted;
  await settings.save();

  return { ok: true, inserted, createdEmployees, totalOnDevice: attRes.data.length };
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
  employeeScope,
  hourlyRateOf,
  recomputeDirections,
  syncFromDevice,
  getDailyBoard,
  getEmployeeSummary,
  getRangeSummary,
};
