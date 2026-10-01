'use strict';
const router   = require('express').Router();
const { protect, requireAdmin, blockCashier } = require('../middleware/auth');
const Employee = require('../models/Employee');

router.use(protect, blockCashier);

/* Reads are open to any signed-in staff member — a supervisor needs the
   names and hourly rates to work out the day's wages. Writes are admin-only:
   a supervisor must never alter an employee record. Cashier gets neither —
   wages and rosters aren't a counter job. */

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

router.delete('/:id', requireAdmin, async (req, res) => {
  await Employee.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ success: true, message: 'تم إلغاء تفعيل الموظف' });
});

module.exports = router;
