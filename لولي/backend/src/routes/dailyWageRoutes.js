'use strict';

const router = require('express').Router();
const { protect, requireAdmin } = require('../middleware/auth');
const Employee = require('../models/Employee');
const DailyWageEntry = require('../models/DailyWageEntry');
const DailyWageSettlement = require('../models/DailyWageSettlement');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const cashService = require('../services/cashService');

router.use(protect, requireAdmin);

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const unitsFor = status => status === 'present' ? 1 : status === 'half' ? 0.5 : 0;

async function dailyEmployees() {
  return Employee.find({
    isActive: true,
    $or: [{ payMode: 'daily' }, { dailyWage: { $gt: 0 } }],
  }).sort({ name: 1 });
}

function summarizeEntries(entries, advances = 0, fallbackDailyWage = 0) {
  const fullDays = entries.filter(e => e.status === 'present').length;
  const halfDays = entries.filter(e => e.status === 'half').length;
  const absentDays = entries.filter(e => e.status === 'absent').length;
  const equivalentDays = fullDays + halfDays * 0.5;
  const basePay = entries.reduce((s, e) => s + (Number(e.dailyWageSnapshot) || fallbackDailyWage) * (Number(e.dayUnits) || 0), 0);
  const bonuses = entries.reduce((s, e) => s + (Number(e.bonus) || 0), 0);
  const deductions = entries.reduce((s, e) => s + (Number(e.deduction) || 0), 0);
  const finalPay = Math.max(0, basePay + bonuses - deductions - advances);
  return { fullDays, halfDays, absentDays, equivalentDays, basePay, bonuses, deductions, advances, finalPay };
}

/* One simple screen for today's attendance. Missing employees come back as
   "unmarked" on the client and do not earn anything until the manager saves. */
router.get('/day', async (req, res) => {
  const date = String(req.query.date || '');
  if (!DAY.test(date)) return res.status(400).json({ success: false, message: 'التاريخ غير صحيح' });

  const [employees, entries] = await Promise.all([
    dailyEmployees(),
    DailyWageEntry.find({ date }),
  ]);
  const byEmployee = new Map(entries.map(e => [String(e.employeeId), e]));

  res.json({
    success: true,
    date,
    rows: employees.map(emp => {
      const entry = byEmployee.get(String(emp._id));
      return {
        employeeId: emp._id,
        employeeName: emp.name,
        dailyWage: Number(emp.dailyWage || 0),
        status: entry?.status || 'unmarked',
        bonus: Number(entry?.bonus || 0),
        deduction: Number(entry?.deduction || 0),
        note: entry?.note || '',
        settled: Boolean(entry?.settlementId),
      };
    }),
  });
});

router.put('/day', async (req, res) => {
  const date = String(req.body?.date || '');
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!DAY.test(date)) return res.status(400).json({ success: false, message: 'التاريخ غير صحيح' });
  if (!rows.length) return res.status(400).json({ success: false, message: 'لا توجد بيانات للحفظ' });

  let saved = 0;
  for (const row of rows) {
    const emp = await Employee.findById(row.employeeId);
    if (!emp || !emp.isActive) continue;

    const existing = await DailyWageEntry.findOne({ employeeId: emp._id, date });
    if (existing?.settlementId) {
      return res.status(409).json({
        success: false,
        message: `لا يمكن تعديل يوم ${date} للموظف ${emp.name} لأنه تمت محاسبته`,
      });
    }

    const status = ['present','half','absent'].includes(row.status) ? row.status : 'absent';
    await DailyWageEntry.findOneAndUpdate(
      { employeeId: emp._id, date },
      {
        $set: {
          centerId: emp.centerId || null,
          employeeName: emp.name,
          status,
          dayUnits: unitsFor(status),
          dailyWageSnapshot: Math.max(Number(emp.dailyWage) || 0, 0),
          bonus: Math.max(Number(row.bonus) || 0, 0),
          deduction: Math.max(Number(row.deduction) || 0, 0),
          note: String(row.note || '').trim(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    saved += 1;
  }

  res.json({ success: true, saved, message: `تم حفظ دوام ${saved} موظف` });
});

router.get('/summary', async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!DAY.test(from) || !DAY.test(to) || from > to) {
    return res.status(400).json({ success: false, message: 'حدد فترة صحيحة' });
  }

  const employees = await dailyEmployees();
  const rows = [];

  for (const emp of employees) {
    const [entries, advances] = await Promise.all([
      DailyWageEntry.find({
        employeeId: emp._id,
        date: { $gte: from, $lte: to },
        settlementId: null,
      }).sort({ date: 1 }),
      EmployeeAdvance.find({ employeeId: emp._id, isDeducted: false }),
    ]);

    const advanceTotal = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    rows.push({
      employeeId: emp._id,
      employeeName: emp.name,
      dailyWage: Number(emp.dailyWage || 0),
      entriesCount: entries.length,
      ...summarizeEntries(entries, advanceTotal, Number(emp.dailyWage || 0)),
    });
  }

  res.json({ success: true, from, to, rows });
});

router.post('/settle', async (req, res) => {
  const { employeeId } = req.body || {};
  const from = String(req.body?.from || '');
  const to = String(req.body?.to || '');
  if (!employeeId || !DAY.test(from) || !DAY.test(to) || from > to) {
    return res.status(400).json({ success: false, message: 'الموظف والفترة مطلوبان' });
  }

  const emp = await Employee.findById(employeeId);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  const [entries, advances] = await Promise.all([
    DailyWageEntry.find({
      employeeId: emp._id,
      date: { $gte: from, $lte: to },
      settlementId: null,
    }).sort({ date: 1 }),
    EmployeeAdvance.find({ employeeId: emp._id, isDeducted: false }),
  ]);

  if (!entries.length) {
    return res.status(400).json({ success: false, message: 'لا توجد أيام غير محاسبة ضمن هذه الفترة' });
  }

  const advanceTotal = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const totals = summarizeEntries(entries, advanceTotal, Number(emp.dailyWage || 0));

  const settlement = await DailyWageSettlement.create({
    centerId: emp.centerId || null,
    employeeId: emp._id,
    employeeName: emp.name,
    from,
    to,
    dailyWage: Number(emp.dailyWage || 0),
    ...totals,
    paidBy: req.user?._id || null,
    paidByName: req.user?.name || '',
    entryIds: entries.map(e => e._id),
  });

  try {
    if (totals.finalPay > 0) {
      await cashService.createTransaction(
        'salary_payment',
        totals.finalPay,
        'out',
        `أجور يومية — ${emp.name} — ${from} إلى ${to}`,
        'DailyWageSettlement',
        settlement._id,
        emp.centerId || null
      );
    }
  } catch (err) {
    await settlement.deleteOne().catch(() => {});
    return res.status(500).json({ success: false, message: 'تعذّر خصم الأجر من الكاش: ' + err.message });
  }

  await DailyWageEntry.updateMany(
    { _id: { $in: entries.map(e => e._id) } },
    { $set: { settlementId: settlement._id } }
  );

  for (const advance of advances) {
    advance.isDeducted = true;
    advance.deductedRecordId = settlement._id;
    advance.deductedPeriod = `${from} → ${to}`;
    await advance.save();
  }

  res.json({
    success: true,
    settlement,
    message: `تمت محاسبة ${emp.name} وصرف ${totals.finalPay.toLocaleString('ar-SY')} ل.س`,
  });
});

router.get('/settlements', async (req, res) => {
  const rows = await DailyWageSettlement.find({}).sort({ paidAt: -1 }).limit(100);
  res.json({ success: true, settlements: rows });
});

module.exports = router;
