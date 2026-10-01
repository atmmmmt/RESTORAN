'use strict';
const router          = require('express').Router();
const { protect, requireAdmin } = require('../middleware/auth');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const Employee        = require('../models/Employee');
const cashService     = require('../services/cashService');

router.use(protect, requireAdmin);   // employee advances are admin-only

/* ── GET all advances (optional filter by employee or pending) ── */
router.get('/', async (req, res) => {
  const filter = {};
  if (req.query.employeeId)  filter.employeeId = req.query.employeeId;
  if (req.query.isDeducted !== undefined) filter.isDeducted = req.query.isDeducted === 'true';
  const advances = await EmployeeAdvance.find(filter).sort({ date: -1 });
  res.json({ success: true, advances });
});

/* ── POST — record a new advance (deducted from cash immediately) ── */
router.post('/', async (req, res) => {
  const { employeeId, amount, date, reason } = req.body;
  if (!employeeId || !amount) return res.status(400).json({ success: false, message: 'الموظف والمبلغ مطلوبان' });

  const emp = await Employee.findById(employeeId);
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  const advance = await EmployeeAdvance.create({
    employeeId, employeeName: emp.name,
    amount: Number(amount),
    date: date ? new Date(date) : new Date(),
    reason: reason || '',
  });

  // Deduct from cash immediately (salary advance = expense)
  await cashService.createTransaction(
    'salary_advance',
    Number(amount),
    'out',
    `سلفة — ${emp.name}${reason ? ': ' + reason : ''}`,
    'EmployeeAdvance',
    advance._id
  );

  res.status(201).json({ success: true, advance, message: `تم تسجيل سلفة ${emp.name} وخصمها من الكاش` });
});

/* ── DELETE — cancel an advance (if not yet deducted from salary record) ── */
router.delete('/:id', async (req, res) => {
  const advance = await EmployeeAdvance.findById(req.params.id);
  if (!advance) return res.status(404).json({ success: false, message: 'السلفة غير موجودة' });
  if (advance.isDeducted) return res.status(400).json({ success: false, message: 'السلفة مخصومة من الراتب بالفعل' });
  await advance.deleteOne();
  res.json({ success: true, message: 'تم حذف السلفة' });
});

module.exports = router;
