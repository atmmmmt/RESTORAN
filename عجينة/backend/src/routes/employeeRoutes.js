'use strict';
const router   = require('express').Router();
const { protect, requireAdmin } = require('../middleware/auth');
const Employee      = require('../models/Employee');
const AttendanceLog = require('../models/AttendanceLog');
const SalaryRecord  = require('../models/SalaryRecord');

router.use(protect);

/* Reads are open to any signed-in staff member — a supervisor needs the
   names and hourly rates to work out the day's wages. Writes are admin-only:
   a supervisor must never alter an employee record. */

router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (req.query.centerId !== undefined) filter.centerId = req.query.centerId === 'null' ? null : req.query.centerId;
  const employees = await Employee.find(filter).sort({ name: 1 });
  res.json({ success: true, employees });
});

router.post('/', requireAdmin, async (req, res) => {
  const {
    name, hireDate, monthlySalary, dailyHours, workingDays,
    role, department, phone, notes, hourlyRateOverride, devicePin, payPeriod, centerId,
  } = req.body;
  if (!name || monthlySalary === undefined) {
    return res.status(400).json({ success: false, message: 'الاسم والراتب مطلوبان' });
  }
  const emp = await Employee.create({
    name, hireDate, monthlySalary, dailyHours, workingDays,
    role, department, phone, notes, hourlyRateOverride, devicePin, payPeriod, centerId,
  });
  res.status(201).json({ success: true, employee: emp });
});

router.put('/:id', requireAdmin, async (req, res) => {
  const emp = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  res.json({ success: true, employee: emp });
});

/* Leaving is the normal case: the person stops working here, but their
   attendance and payslips still have to add up, so the record survives
   deactivated rather than being erased. */
router.delete('/:id', requireAdmin, async (req, res) => {
  const emp = await Employee.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  res.json({ success: true, employee: emp, message: 'تم إلغاء تفعيل الموظف' });
});

/* Bring one back — a deactivation is otherwise a one-way door, which is the
   wrong shape for something as ordinary as a mistaken click. */
router.post('/:id/restore', requireAdmin, async (req, res) => {
  const emp = await Employee.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  res.json({ success: true, employee: emp, message: 'تمت إعادة تفعيل الموظف' });
});

/* ── DELETE /api/employees/:id/permanent ──────────────────
   Erase a record that never became a person: a test row, or the placeholder
   the terminal's own user list created. Refused the moment any attendance or
   payslip points at it, because deleting the employee would leave those rows
   referring to nobody and quietly skew the wage totals. */
router.delete('/:id/permanent', requireAdmin, async (req, res) => {
  const emp = await Employee.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  const [punches, salaries] = await Promise.all([
    AttendanceLog.countDocuments({ employeeId: emp._id }),
    SalaryRecord.countDocuments({ employeeId: emp._id }),
  ]);

  if (punches || salaries) {
    const parts = [];
    if (punches)  parts.push(punches + ' حركة حضور');
    if (salaries) parts.push(salaries + ' سجل راتب');
    return res.status(409).json({
      success: false,
      punches, salaries,
      message: 'لا يمكن الحذف النهائي — للموظف ' + parts.join(' و') + '. استخدم «إلغاء التفعيل» بدلاً من ذلك.',
    });
  }

  await emp.deleteOne();
  res.json({ success: true, message: 'تم حذف الموظف نهائياً' });
});

module.exports = router;
