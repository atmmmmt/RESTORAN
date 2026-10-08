'use strict';
const router          = require('express').Router();
const { protect, requireAdmin } = require('../middleware/auth');
const SalaryRecord    = require('../models/SalaryRecord');
const Employee        = require('../models/Employee');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const cashService     = require('../services/cashService');
const attendanceService = require('../services/attendanceService');

/** Calculate hourly rate based on pay period */
function calcHourlyRate(emp) {
  const days = emp.payPeriod === 'daily' ? 1 : emp.payPeriod === 'weekly' ? 5 : (emp.workingDays || 26);
  return emp.monthlySalary / (emp.dailyHours * days);
}

router.use(protect, requireAdmin);   // payroll is admin-only

const selectedCenterId = req => {
  const raw = req.body?.centerId ?? req.query?.centerId ?? req.query?.center;
  return raw && raw !== 'all' && raw !== 'hq' ? raw : null;
};

/* ── GET all records for a month ── */
router.get('/', async (req, res) => {
  const { month } = req.query; // YYYY-MM
  const filter = {};
  if (month) filter.month = month;
  const centerId = selectedCenterId(req);
  if (centerId) filter.centerId = centerId;
  const records = await SalaryRecord.find(filter)
    .populate('employeeId', 'name role monthlySalary dailyHours workingDays isActive')
    .sort({ employeeName: 1 });
  res.json({ success: true, records });
});

/* ── GET records for one employee ── */
router.get('/employee/:empId', async (req, res) => {
  const records = await SalaryRecord.find({ employeeId: req.params.empId })
    .sort({ month: -1 });
  res.json({ success: true, records });
});

/* ── POST — create or get record for employee+period ── */
router.post('/init', async (req, res) => {
  const { employeeId, month } = req.body; // month = "YYYY-MM" or "YYYY-WXX"
  if (!employeeId || !month) return res.status(400).json({ success: false, message: 'employeeId و month مطلوبان' });

  const emp = await Employee.findById(employeeId);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  const requestedCenterId = selectedCenterId(req);
  if (requestedCenterId && String(emp.centerId || '') !== String(requestedCenterId)) {
    return res.status(400).json({ success: false, message: 'الموظف تابع لفرع آخر' });
  }

  const hourlyRate = calcHourlyRate(emp);

  // Auto-include pending advances
  const pendingAdvances = await EmployeeAdvance.find({
    employeeId: emp._id,
    centerId: emp.centerId || null,
    isDeducted: false,
  });
  const totalAdvances   = pendingAdvances.reduce((s, a) => s + a.amount, 0);

  let record = await SalaryRecord.findOne({ employeeId, month });
  if (!record) {
    record = await SalaryRecord.create({
      centerId: emp.centerId || null,
      employeeId,
      employeeName: emp.name,
      month,
      period: emp.payPeriod || 'monthly',
      baseSalary: emp.monthlySalary,
      hourlyRate,
      advances: totalAdvances,
      finalSalary: Math.max(0, emp.monthlySalary - totalAdvances),
    });
    // Mark advances as deducted
    for (const adv of pendingAdvances) {
      adv.isDeducted       = true;
      adv.deductedRecordId = record._id;
      adv.deductedPeriod   = month;
      await adv.save();
    }
  }
  res.json({ success: true, record });
});

/* ── PUT — add late hours / bonuses / deductions ── */
router.put('/:id/late', async (req, res) => {
  const { hours, date, reason } = req.body;
  if (!hours || hours <= 0) return res.status(400).json({ success: false, message: 'أدخل عدد ساعات التأخر' });

  const record = await SalaryRecord.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
  if (record.isPaid)  return res.status(400).json({ success: false, message: 'لا يمكن التعديل بعد الصرف' });

  record.lateHours     = (record.lateHours || 0) + Number(hours);
  record.lateDeduction = record.lateHours * record.hourlyRate;
  record.finalSalary   = Math.max(0, record.baseSalary + (record.bonuses || 0) - record.lateDeduction - (record.otherDeductions || 0));
  record.lateLog.push({ date: date || new Date().toISOString().slice(0, 10), hours: Number(hours), reason: reason || '' });

  await record.save();
  res.json({ success: true, record });
});

/* ── POST — pull real attendance from the fingerprint terminal ──
   Replaces guesswork with what the device actually recorded for the month.
   `payBasis: 'hours'` switches the record from a fixed wage to
   hours × hourly rate, which is what the clock-in data is really for. */
router.post('/:id/sync-attendance', async (req, res) => {
  const { payBasis } = req.body;

  const record = await SalaryRecord.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
  if (record.isPaid) return res.status(400).json({ success: false, message: 'لا يمكن التعديل بعد الصرف' });

  const emp = await Employee.findById(record.employeeId);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  // record.month is 'YYYY-MM' — cover the whole calendar month.
  const [year, mon] = record.month.split('-').map(Number);
  if (!year || !mon) {
    return res.status(400).json({ success: false, message: 'صيغة الشهر غير صحيحة — المزامنة تدعم الشهور فقط' });
  }
  const from = `${record.month}-01`;
  const to   = `${record.month}-${String(new Date(year, mon, 0).getDate()).padStart(2, '0')}`;

  const summary = await attendanceService.getEmployeeSummary(record.employeeId, from, to);
  if (!summary) return res.status(404).json({ success: false, message: 'تعذّر جلب بيانات الحضور' });

  const rate = attendanceService.hourlyRateOf(emp);

  record.hourlyRate         = rate;
  record.daysAttended       = summary.totals.daysAttended;
  record.hoursWorked        = summary.totals.totalHours;
  record.expectedHours      = (emp.dailyHours || 8) * (emp.workingDays || 26);
  record.lateHours          = summary.totals.lateHours;
  record.lateDeduction      = summary.totals.lateHours * rate;
  record.hoursPay           = Number((summary.totals.totalHours * rate).toFixed(2));
  record.attendanceSynced   = true;
  record.attendanceSyncedAt = new Date();

  if (payBasis === 'hours' || payBasis === 'salary') record.payBasis = payBasis;

  // Paying by the hour already reflects lateness (fewer hours clocked),
  // so deducting for it again would punish the same minutes twice.
  const base = record.payBasis === 'hours' ? record.hoursPay : record.baseSalary;
  const lateCut = record.payBasis === 'hours' ? 0 : record.lateDeduction;

  record.finalSalary = Math.max(
    0,
    base + (record.bonuses || 0) - lateCut - (record.otherDeductions || 0) - (record.advances || 0)
  );

  await record.save();

  res.json({
    success: true,
    record,
    days: summary.days,
    message: `تمت المزامنة — ${summary.totals.daysAttended} يوم، ${summary.totals.totalHours} ساعة`,
  });
});

/* ── PUT — update bonuses or other deductions ── */
router.put('/:id/adjust', async (req, res) => {
  const { bonuses, otherDeductions, notes } = req.body;
  const record = await SalaryRecord.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
  if (record.isPaid) return res.status(400).json({ success: false, message: 'لا يمكن التعديل بعد الصرف' });

  if (bonuses          !== undefined) record.bonuses          = Number(bonuses);
  if (otherDeductions  !== undefined) record.otherDeductions  = Number(otherDeductions);
  if (notes            !== undefined) record.notes            = notes;

  // Mirror the basis logic from sync-attendance so the two paths agree.
  const base    = record.payBasis === 'hours' ? record.hoursPay : record.baseSalary;
  const lateCut = record.payBasis === 'hours' ? 0 : record.lateDeduction;
  record.finalSalary = Math.max(
    0,
    base + record.bonuses - lateCut - record.otherDeductions - record.advances
  );

  await record.save();
  res.json({ success: true, record });
});

/* ── PUT — deduct a specific advance from this record ── */
router.put('/:id/deduct-advance/:advId', async (req, res) => {
  const record  = await SalaryRecord.findById(req.params.id);
  const advance = await EmployeeAdvance.findById(req.params.advId);
  if (!record || !advance) return res.status(404).json({ success: false, message: 'سجل أو سلفة غير موجودة' });
  if (record.isPaid)       return res.status(400).json({ success: false, message: 'الراتب مصروف' });
  if (advance.isDeducted)  return res.status(400).json({ success: false, message: 'السلفة مخصومة مسبقاً' });

  record.advances   = (record.advances || 0) + advance.amount;
  record.finalSalary = Math.max(0, record.baseSalary + record.bonuses - record.lateDeduction - record.otherDeductions - record.advances);
  await record.save();

  advance.isDeducted       = true;
  advance.deductedRecordId = record._id;
  advance.deductedPeriod   = record.month;
  await advance.save();

  res.json({ success: true, record });
});

/* ── POST — pay salary (deduct from cash) ── */
router.post('/:id/pay', async (req, res) => {
  const record = await SalaryRecord.findById(req.params.id);
  if (!record) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
  if (record.isPaid)  return res.status(400).json({ success: false, message: 'الراتب مصروف مسبقاً' });

  record.isPaid   = true;
  record.paidDate = new Date();
  await record.save();

  // Deduct from project cash
  await cashService.createTransaction(
    'salary_payment',
    record.finalSalary,
    'out',
    `راتب ${record.employeeName} — ${record.month}`,
    'SalaryRecord',
    record._id,
    record.centerId || null
  );

  res.json({ success: true, record, message: `تم صرف راتب ${record.employeeName} بنجاح` });
});

/* ── Init entire period for all active employees ── */
router.post('/init-month', async (req, res) => {
  const { month, periodType } = req.body; // periodType: 'weekly' | 'monthly' | 'all'
  if (!month) return res.status(400).json({ success: false, message: 'month مطلوب' });

  const empFilter = { isActive: true };
  const centerId = selectedCenterId(req);
  if (centerId) empFilter.centerId = centerId;
  if (periodType && periodType !== 'all') empFilter.payPeriod = periodType;

  const employees = await Employee.find(empFilter);
  const created = [];

  for (const emp of employees) {
    const exists = await SalaryRecord.findOne({ employeeId: emp._id, month });
    if (!exists) {
      const hourlyRate     = calcHourlyRate(emp);
      const pendingAdv     = await EmployeeAdvance.find({
        employeeId: emp._id,
        centerId: emp.centerId || null,
        isDeducted: false,
      });
      const totalAdvances  = pendingAdv.reduce((s, a) => s + a.amount, 0);
      const rec = await SalaryRecord.create({
        centerId:     emp.centerId || null,
        employeeId:   emp._id,
        employeeName: emp.name,
        month,
        period:       emp.payPeriod || 'monthly',
        baseSalary:   emp.monthlySalary,
        hourlyRate,
        advances:     totalAdvances,
        finalSalary:  Math.max(0, emp.monthlySalary - totalAdvances),
      });
      for (const adv of pendingAdv) {
        adv.isDeducted = true; adv.deductedRecordId = rec._id; adv.deductedPeriod = month;
        await adv.save();
      }
      created.push(rec);
    }
  }

  res.json({ success: true, created: created.length, message: `تم إنشاء ${created.length} سجل جديد` });
});

module.exports = router;
