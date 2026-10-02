'use strict';

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const SalesCenter = require('../models/SalesCenter');
const CenterSale  = require('../models/CenterSale');
const CenterSettlement = require('../models/CenterSettlement');
const CenterDelivery   = require('../models/CenterDelivery');
const Employee        = require('../models/Employee');
const SalaryRecord    = require('../models/SalaryRecord');
const CashTransaction = require('../models/CashTransaction');
const InternalOrder = require('../models/InternalOrder');
const Product = require('../models/Product');
const cashService      = require('../services/cashService');
const wasteController  = require('../controllers/wasteController');
const purchaseController = require('../controllers/purchaseController');
const { protectCenter } = require('../middleware/auth');

/** Calculate hourly rate based on pay period */
function calcHourlyRate(emp) {
  const days = emp.payPeriod === 'weekly' ? 5 : (emp.workingDays || 26);
  return emp.monthlySalary / (emp.dailyHours * days);
}

/* ──────────────────────────────────────────────
   POST /api/center-portal/login
────────────────────────────────────────────── */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة السر مطلوبان.' });
  }

  const center = await SalesCenter.findOne({ portalUsername: username, isActive: true })
    .select('+portalPasswordHash');

  if (!center || !center.portalPasswordHash) {
    return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة.' });
  }

  const match = await bcrypt.compare(password, center.portalPasswordHash);
  if (!match) {
    return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة.' });
  }

  const token = jwt.sign(
    { centerId: center._id, role: 'center' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({
    success: true,
    token,
    center: {
      _id:      center._id,
      name:     center.name,
      location: center.location,
      phone:    center.phone,
    },
  });
});

/* ──────────────────────────────────────────────
   GET /api/center-portal/me
   Returns center info + inventory + balance
────────────────────────────────────────────── */
router.get('/me', protectCenter, async (req, res) => {
  const center = req.center;

  const [allDeliveries, allSettlements, recentSales] = await Promise.all([
    CenterDelivery.find({ centerId: center._id }),
    CenterSettlement.find({ centerId: center._id }),
    CenterSale.find({ centerId: center._id }).sort({ saleDate: -1 }).limit(20),
  ]);

  const calcTotal = (d) => {
    if (d.totalExpectedGross > 0) return d.totalExpectedGross;
    if (d.totalValue > 0) return d.totalValue;
    return (d.items || []).reduce((s, it) =>
      s + (Number(it.expectedGrossAmount) || (Number(it.quantityDelivered) * Number(it.unitPrice))), 0);
  };

  const totalDelivered = allDeliveries.reduce((s, d) => s + calcTotal(d), 0);
  const totalCollected = allSettlements.reduce((s, s2) => s + s2.amountCollected, 0);
  const balance        = Math.max(0, totalDelivered - totalCollected);

  res.json({
    success: true,
    center: {
      _id:               center._id,
      name:              center.name,
      location:          center.location,
      phone:             center.phone,
      lowStockThreshold: center.lowStockThreshold,
      inventory:         center.inventory,
    },
    balance: { totalDelivered, totalCollected, amountOwed: balance },
    recentSales,
  });
});

/* ──────────────────────────────────────────────
   POST /api/center-portal/sales
   Center records a sale → decreases inventory
────────────────────────────────────────────── */
router.post('/sales', protectCenter, async (req, res) => {
  const { productId, quantity, notes, paymentMethod = 'cash', orderType = 'takeaway' } = req.body;

  if (!productId || !quantity || Number(quantity) < 1) {
    return res.status(400).json({ success: false, message: 'المنتج والكمية مطلوبان.' });
  }

  const center = req.center;
  const qty = Number(quantity);
  const invIdx = center.inventory.findIndex(i => i.productId.toString() === productId.toString());

  if (invIdx < 0) {
    return res.status(400).json({ success: false, message: 'هذا المنتج غير موجود في مخزونك.' });
  }
  if (center.inventory[invIdx].quantity < qty) {
    return res.status(400).json({
      success: false,
      message: `الكمية المطلوبة (${qty}) أكبر من المتوفر (${center.inventory[invIdx].quantity}).`,
    });
  }

  const product = await Product.findById(productId).select('name directPrice calculatedCost');
  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
  }

  const unitPrice = Number(product.directPrice) || 0;
  const unitCost = Number(product.calculatedCost) || 0;
  const netAmount = unitPrice * qty;
  const totalCost = unitCost * qty;

  // Decrement this branch inventory only.
  center.inventory[invIdx].quantity -= qty;
  center.markModified('inventory');
  await center.save();

  try {
    // Create the same financial order used by POS/reporting so the Americans
    // dashboard, finance snapshots and branch tax settings all see this sale.
    const orderNumber = await InternalOrder.nextOrderNumber();
    const order = await InternalOrder.create({
      centerId: center._id,
      orderNumber,
      qrPayload: orderNumber,
      items: [{
        productId: product._id,
        name: product.name,
        unitPrice,
        unitCost,
        quantity: qty,
        lineTotal: netAmount,
      }],
      subtotal: netAmount,
      total: netAmount,
      totalCost,
      profit: netAmount - totalCost,
      paymentMethod,
      orderType,
      notes: notes || '',
      status: 'new',
      timeline: [{ status: 'new', at: new Date(), by: center.name }],
      createdByName: center.name,
      stockApplied: true,
    });

    const sale = await CenterSale.create({
      internalOrderId: order._id,
      centerId: center._id,
      centerNameSnapshot: center.name,
      productId: product._id,
      productNameSnapshot: product.name,
      quantity: qty,
      unitPrice,
      totalAmount: netAmount,
      notes,
    });

    if ((paymentMethod === 'cash' || paymentMethod === 'card') && order.total > 0) {
      await cashService.createTransaction(
        'sale_income',
        order.total,
        'in',
        `بيع فرع ${center.name} — ${orderNumber}`,
        'InternalOrder',
        order._id,
        center._id
      );
      order.cashPosted = true;
      await order.save();
    }

    return res.status(201).json({
      success: true,
      message: 'تم تسجيل البيع وتحديث المخزون.',
      sale,
      order,
      netAmount: order.netAmount,
      invoiceTaxPercent: order.invoiceTaxPercent,
      invoiceTaxAmount: order.invoiceTaxAmount,
      totalAmount: order.total,
      newQuantity: center.inventory[invIdx].quantity,
      isLowStock: center.inventory[invIdx].quantity < center.lowStockThreshold,
    });
  } catch (err) {
    // Roll back branch inventory if the financial sale could not be created.
    center.inventory[invIdx].quantity += qty;
    center.markModified('inventory');
    await center.save();
    throw err;
  }
});

/* ──────────────────────────────────────────────
   GET /api/center-portal/sales
   Center views its own sales history
────────────────────────────────────────────── */
router.get('/sales', protectCenter, async (req, res) => {
  const sales = await CenterSale.find({ centerId: req.center._id })
    .sort({ saleDate: -1 })
    .limit(100);

  res.json({ success: true, count: sales.length, sales });
});

/* ──────────────────────────────────────────────
   Employees (center-scoped)
────────────────────────────────────────────── */
router.get('/employees', protectCenter, async (req, res) => {
  const filter = { centerId: req.center._id };
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  const employees = await Employee.find(filter).sort({ name: 1 });
  res.json({ success: true, employees });
});

router.post('/employees', protectCenter, async (req, res) => {
  const { name, hireDate, monthlySalary, dailyHours, workingDays, role, phone, notes } = req.body;
  if (!name || !monthlySalary) return res.status(400).json({ success: false, message: 'الاسم والراتب مطلوبان' });
  const emp = await Employee.create({
    centerId: req.center._id,
    name, hireDate, monthlySalary, dailyHours, workingDays, role, phone, notes,
  });
  res.status(201).json({ success: true, employee: emp });
});

router.put('/employees/:id', protectCenter, async (req, res) => {
  const existing = await Employee.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!existing) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  const body = { ...req.body };
  delete body.centerId;
  const emp = await Employee.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  res.json({ success: true, employee: emp });
});

router.delete('/employees/:id', protectCenter, async (req, res) => {
  const existing = await Employee.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!existing) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  await Employee.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ success: true, message: 'تم إلغاء تفعيل الموظف' });
});

/* ──────────────────────────────────────────────
   Salary records (center-scoped)
────────────────────────────────────────────── */
router.get('/salary-records', protectCenter, async (req, res) => {
  const { month } = req.query;
  const filter = { centerId: req.center._id };
  if (month) filter.month = month;
  const records = await SalaryRecord.find(filter)
    .populate('employeeId', 'name role monthlySalary dailyHours workingDays isActive')
    .sort({ employeeName: 1 });
  res.json({ success: true, records });
});

router.post('/salary-records', protectCenter, async (req, res) => {
  const { employeeId, month } = req.body;
  if (!employeeId || !month) return res.status(400).json({ success: false, message: 'employeeId و month مطلوبان' });

  const emp = await Employee.findOne({ _id: employeeId, centerId: req.center._id });
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  const hourlyRate = calcHourlyRate(emp);

  let record = await SalaryRecord.findOne({ employeeId, month });
  if (!record) {
    record = await SalaryRecord.create({
      centerId: req.center._id,
      employeeId,
      employeeName: emp.name,
      month,
      period: emp.payPeriod || 'monthly',
      baseSalary: emp.monthlySalary,
      hourlyRate,
      finalSalary: emp.monthlySalary,
    });
  }
  res.json({ success: true, record });
});

router.put('/salary-records/:id/adjust', protectCenter, async (req, res) => {
  const record = await SalaryRecord.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!record) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
  if (record.isPaid) return res.status(400).json({ success: false, message: 'لا يمكن التعديل بعد الصرف' });

  const { bonuses, otherDeductions, notes } = req.body;
  if (bonuses         !== undefined) record.bonuses         = Number(bonuses);
  if (otherDeductions !== undefined) record.otherDeductions = Number(otherDeductions);
  if (notes           !== undefined) record.notes           = notes;
  record.finalSalary = Math.max(0, record.baseSalary + record.bonuses - record.lateDeduction - record.otherDeductions - record.advances);

  await record.save();
  res.json({ success: true, record });
});

router.post('/salary-records/:id/pay', protectCenter, async (req, res) => {
  const record = await SalaryRecord.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!record) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
  if (record.isPaid) return res.status(400).json({ success: false, message: 'الراتب مصروف مسبقاً' });

  record.isPaid   = true;
  record.paidDate = new Date();
  await record.save();

  await cashService.createTransaction(
    'manual_expense',
    record.finalSalary,
    'out',
    `راتب ${record.employeeName} — ${record.month}`,
    'SalaryRecord',
    record._id,
    req.center._id
  );

  res.json({ success: true, record, message: `تم صرف راتب ${record.employeeName} بنجاح` });
});

router.delete('/salary-records/:id', protectCenter, async (req, res) => {
  const record = await SalaryRecord.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!record) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
  if (record.isPaid) return res.status(400).json({ success: false, message: 'لا يمكن حذف سجل مصروف' });
  await record.deleteOne();
  res.json({ success: true, message: 'تم حذف السجل' });
});

/* ──────────────────────────────────────────────
   Expenses (center-scoped CashTransaction)
────────────────────────────────────────────── */
router.get('/expenses', protectCenter, async (req, res) => {
  const transactions = await CashTransaction.find({ centerId: req.center._id })
    .sort({ transactionDate: -1 })
    .limit(200);

  // This branch's own till — never the business-wide figure.
  const balance = await cashService.getCurrentBalance(req.center._id);
  const summary = await cashService.getSummary(undefined, undefined, req.center._id);

  res.json({ success: true, transactions, balance, summary });
});

/* ── Waste (branch-scoped) ────────────────────────────────
   The controller reads req.center and stamps/filters centerId itself, so a
   branch can only ever see and create its own losses. */
router.get('/waste', protectCenter, wasteController.getAll);
router.post('/waste', protectCenter, wasteController.createWaste);

/* ── Local purchases (branch-scoped) ──────────────────────
   Lets a branch buy supplies locally. Same controller as head office, so
   stock and weighted-average cost stay consistent — only the till differs. */
router.get('/purchases', protectCenter, purchaseController.getAll);
router.post('/purchases', protectCenter, purchaseController.createPurchase);

/* Read-only ingredient list so the branch can pick what it bought.
   Costs and supplier history stay hidden — a branch has no business
   seeing head office's purchasing terms. */
router.get('/ingredients', protectCenter, async (req, res) => {
  const Ingredient = require('../models/Ingredient');
  const ingredients = await Ingredient.find()
    .select('name unitType currentStock')
    .sort({ name: 1 });
  res.json({ success: true, ingredients });
});

/* ── GET /api/center-portal/cash — this branch's till only ── */
router.get('/cash', protectCenter, async (req, res) => {
  const [balance, summary] = await Promise.all([
    cashService.getCurrentBalance(req.center._id),
    cashService.getSummary(req.query.startDate, req.query.endDate, req.center._id),
  ]);
  res.json({ success: true, balance, ...summary });
});

router.post('/expenses', protectCenter, async (req, res) => {
  const { amount, description, direction } = req.body;
  if (!amount || !description) {
    return res.status(400).json({ success: false, message: 'المبلغ والوصف مطلوبان.' });
  }
  const dir = direction === 'in' ? 'in' : 'out';
  const tx = await cashService.createTransaction(
    dir === 'in' ? 'manual_income' : 'manual_expense',
    Number(amount),
    dir,
    description,
    null,
    null,
    req.center._id
  );
  res.status(201).json({ success: true, message: 'تم تسجيل المصروف.', transaction: tx });
});

router.put('/expenses/:id', protectCenter, async (req, res) => {
  const tx = await CashTransaction.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!tx) return res.status(404).json({ success: false, message: 'المعاملة غير موجودة' });
  const { amount, description } = req.body;
  if (amount      !== undefined) tx.amount      = Number(amount);
  if (description !== undefined) tx.description = description;
  await tx.save();
  res.json({ success: true, transaction: tx });
});

router.delete('/expenses/:id', protectCenter, async (req, res) => {
  const tx = await CashTransaction.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!tx) return res.status(404).json({ success: false, message: 'المعاملة غير موجودة' });
  await tx.deleteOne();
  res.json({ success: true, message: 'تم حذف المعاملة' });
});

module.exports = router;
