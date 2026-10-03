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
const cashService      = require('../services/cashService');
const wasteController  = require('../controllers/wasteController');
const purchaseController = require('../controllers/purchaseController');
const { protectCenter } = require('../middleware/auth');
const dayjs   = require('dayjs');
const attendanceService = require('../services/attendanceService');
const InternalOrder = require('../models/InternalOrder');
const FinanceSettings = require('../models/FinanceSettings');
const TaxPayment = require('../models/TaxPayment');
const financeService = require('../services/financeService');
const businessDay = require('../services/businessDay');
const AttendanceDevice = require('../models/AttendanceDevice');
const DeviceCommand = require('../models/DeviceCommand');
const AttendanceLog = require('../models/AttendanceLog');
const EmployeeAdvance = require('../models/EmployeeAdvance');
const CashierShift = require('../models/CashierShift');
const shiftService = require('../services/shiftService');

/** Calculate hourly rate based on pay period */
function calcHourlyRate(emp) {
  const days = emp.payPeriod === 'daily' ? 1 : emp.payPeriod === 'weekly' ? 5 : (emp.workingDays || 26);
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


const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const safePercent = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    const err = new Error(`${label} يجب أن تكون بين 0 و 100`);
    err.statusCode = 400;
    throw err;
  }
  return number;
};

/* ──────────────────────────────────────────────
   Branch settings — scoped to the signed-in branch only.
   The branch manager can control their own working hours and finance rates,
   never another branch or the restaurant-wide defaults.
────────────────────────────────────────────── */
router.get('/settings', protectCenter, async (req, res) => {
  const settings = await FinanceSettings.getSingleton();
  const day = await businessDay.current(req.center._id);
  const resolved = settings.resolveFor(req.center._id);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const centerId = req.center._id;

  const [orders, expenses, payments] = await Promise.all([
    InternalOrder.find({
      centerId,
      createdAt: { $gte: monthStart, $lt: monthEnd },
      status: { $ne: 'cancelled' },
    }).select('total netAmount invoiceTaxAmount totalCost'),
    CashTransaction.find({
      centerId,
      transactionDate: { $gte: monthStart, $lt: monthEnd },
      direction: 'out',
      type: 'manual_expense',
    }).select('amount'),
    TaxPayment.find({
      centerId,
      paidAt: { $gte: monthStart, $lt: monthEnd },
    }).select('type amount'),
  ]);

  const revenue = financeService.money(orders.reduce((sum, o) => sum + financeService.revenueOf(o, 'total'), 0));
  const invoiceTaxCollected = financeService.money(orders.reduce((sum, o) => sum + financeService.invoiceTaxOf(o), 0));
  const costOfGoods = financeService.money(orders.reduce((sum, o) => sum + Number(o.totalCost || 0), 0));
  const operatingExpenses = financeService.money(expenses.reduce((sum, x) => sum + Number(x.amount || 0), 0));
  const profitBeforeTax = financeService.money(revenue - costOfGoods - operatingExpenses);
  const profitTax = financeService.profitTaxEstimate(profitBeforeTax, resolved);
  const invoiceTaxPaid = financeService.money(payments.filter(x => x.type === 'invoice_tax').reduce((s, x) => s + Number(x.amount || 0), 0));
  const profitTaxPaid = financeService.money(payments.filter(x => x.type === 'profit_tax').reduce((s, x) => s + Number(x.amount || 0), 0));

  res.json({
    success: true,
    settings: {
      finance: resolved,
      businessHours: {
        openingTime: day.openingTime,
        closingTime: day.closingTime,
        currentDay: day.day,
        dayStartsAt: day.start,
        dayEndsAt: day.end,
      },
    },
    monthSummary: {
      ordersCount: orders.length,
      customerCollections: financeService.money(revenue + invoiceTaxCollected),
      revenueBeforeInvoiceTax: revenue,
      invoiceTaxCollected,
      invoiceTaxPaid,
      invoiceTaxDue: financeService.money(Math.max(invoiceTaxCollected - invoiceTaxPaid, 0)),
      costOfGoods,
      operatingExpenses,
      profitBeforeTax,
      profitTaxEstimate: profitTax.amount,
      profitTaxPaid,
      profitTaxDue: financeService.money(Math.max(profitTax.amount - profitTaxPaid, 0)),
      estimatedNetProfitAfterTax: financeService.money(profitBeforeTax - profitTax.amount),
    },
  });
});

router.put('/settings', protectCenter, async (req, res) => {
  const center = await SalesCenter.findById(req.center._id);
  if (!center) return res.status(404).json({ success: false, message: 'الفرع غير موجود' });

  const { openingTime, closingTime, invoiceTax = {}, profitTax = {} } = req.body || {};

  if (openingTime !== undefined) {
    if (!TIME_RE.test(String(openingTime))) return res.status(400).json({ success: false, message: 'وقت الافتتاح يجب أن يكون HH:MM' });
    center.openingTime = String(openingTime);
  }
  if (closingTime !== undefined) {
    if (!TIME_RE.test(String(closingTime))) return res.status(400).json({ success: false, message: 'وقت الإغلاق يجب أن يكون HH:MM' });
    center.closingTime = String(closingTime);
  }
  await center.save();
  businessDay.invalidate(center._id);

  const settings = await FinanceSettings.getSingleton();
  let row = settings.branchOverrides.find(item => String(item.centerId) === String(center._id));
  if (!row) {
    settings.branchOverrides.push({ centerId: center._id, enabled: true });
    row = settings.branchOverrides[settings.branchOverrides.length - 1];
  }
  row.enabled = true;
  if (invoiceTax.enabled !== undefined) row.invoiceTax.enabled = !!invoiceTax.enabled;
  if (invoiceTax.percent !== undefined) row.invoiceTax.percent = safePercent(invoiceTax.percent, 'نسبة الفاتورة');
  if (profitTax.enabled !== undefined) row.profitTax.enabled = !!profitTax.enabled;
  if (profitTax.percent !== undefined) row.profitTax.percent = safePercent(profitTax.percent, 'نسبة الأرباح');
  await settings.save();

  const day = await businessDay.current(center._id);
  res.json({
    success: true,
    message: 'تم حفظ إعدادات الفرع',
    settings: {
      finance: settings.resolveFor(center._id),
      businessHours: {
        openingTime: day.openingTime,
        closingTime: day.closingTime,
        currentDay: day.day,
        dayStartsAt: day.start,
        dayEndsAt: day.end,
      },
    },
  });
});

/* ──────────────────────────────────────────────
   GET /api/center-portal/products
   Full active menu (same catalog customers see), minus whatever this
   branch has marked "unavailable today". This is what the cashier sells
   from — NOT center.inventory, which only tracks raw-supply deliveries.
────────────────────────────────────────────── */
router.get('/products', protectCenter, async (req, res) => {
  const Product = require('../models/Product');
  const hiddenIds = (req.center.unavailableProductIds || []).map(id => id.toString());

  const products = await Product.find({ status: 'available' })
    .select('name directPrice image category')
    .sort({ name: 1 });

  const visible = products.filter(p => !hiddenIds.includes(p._id.toString()));

  res.json({ success: true, products: visible });
});

/* ──────────────────────────────────────────────
   GET /api/center-portal/products/unavailable
   Products this branch hid from its own cashier today.
────────────────────────────────────────────── */
router.get('/products/unavailable', protectCenter, async (req, res) => {
  const Product = require('../models/Product');
  const ids = req.center.unavailableProductIds || [];

  const products = await Product.find({ _id: { $in: ids } })
    .select('name image')
    .sort({ name: 1 });

  res.json({ success: true, products });
});

/* ──────────────────────────────────────────────
   PUT /api/center-portal/products/:id/toggle-availability
   Branch-local toggle only — never touches Product.status or any other
   branch's view of the menu.
────────────────────────────────────────────── */
router.put('/products/:id/toggle-availability', protectCenter, async (req, res) => {
  const Product = require('../models/Product');
  const product = await Product.findById(req.params.id).select('_id');
  if (!product) return res.status(404).json({ success: false, message: 'المنتج غير موجود' });

  const center = req.center;
  const idStr = req.params.id.toString();
  const idx = (center.unavailableProductIds || []).findIndex(id => id.toString() === idStr);

  let unavailable;
  if (idx >= 0) {
    center.unavailableProductIds.splice(idx, 1);
    unavailable = false;
  } else {
    center.unavailableProductIds.push(req.params.id);
    unavailable = true;
  }

  await center.save();
  res.json({ success: true, unavailable });
});

/* ──────────────────────────────────────────────
   POST /api/center-portal/sales
   Center records a sale (single item or a whole cart) off the full menu
   (not center.inventory — that's raw-supply tracking, a separate system).
   Prices each line off the product's direct price and feeds the branch's
   own till so its cash box reflects direct sales.

   Accepts either:
     { items: [{ productId, quantity }, ...], notes }   ← cart (POS screen)
     { productId, quantity, notes }                      ← legacy single-item
────────────────────────────────────────────── */
router.post('/sales', protectCenter, async (req, res) => {
  const Product = require('../models/Product');
  const inventoryService = require('../services/inventoryService');

  // Normalize to a cart — keeps the legacy single-item callers working.
  let items = Array.isArray(req.body.items) ? req.body.items : null;
  if (!items) {
    const { productId, quantity } = req.body;
    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: 'المنتج والكمية مطلوبان.' });
    }
    items = [{ productId, quantity }];
  }
  if (!items.length) {
    return res.status(400).json({ success: false, message: 'السلة فارغة.' });
  }

  const { notes } = req.body;
  const center = req.center;
  const hiddenIds = (center.unavailableProductIds || []).map(id => id.toString());

  // ── Validate every line BEFORE creating anything — a bad line anywhere
  //    must fail the whole operation, not partially apply it. ──
  const resolved = [];
  for (const line of items) {
    const productId = line.productId;
    const quantity = Number(line.quantity);

    if (!productId || !quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: 'كل صنف يحتاج منتج وكمية صحيحة.' });
    }
    if (hiddenIds.includes(productId.toString())) {
      return res.status(400).json({ success: false, message: 'أحد الأصناف غير متوفر اليوم.' });
    }

    resolved.push({ productId, quantity });
  }

  // Fetch every distinct product in one query — confirms it exists and is available.
  const productIds = [...new Set(resolved.map(r => r.productId.toString()))];
  const products = await Product.find({ _id: { $in: productIds }, status: 'available' })
    .select('name directPrice calculatedCost ingredients');
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  for (const { productId } of resolved) {
    if (!productMap.has(productId.toString())) {
      return res.status(400).json({ success: false, message: 'أحد الأصناف غير موجود أو غير متاح.' });
    }
  }

  /* ── Direct-resale items (a single-ingredient recipe = "this product IS
     that ingredient, sold as-is" — e.g. a canned drink) draw straight from
     the shared ingredient stock on sale. Multi-ingredient dishes are left
     alone here; they're meant to go through Production first. ──────────── */
  const stockDeductions = new Map(); // ingredientId -> total quantity to deduct
  for (const { productId, quantity } of resolved) {
    const product = productMap.get(productId.toString());
    if (product.ingredients?.length === 1) {
      const recipe = product.ingredients[0];
      const need = recipe.quantityUsed * quantity;
      stockDeductions.set(
        recipe.ingredientId.toString(),
        (stockDeductions.get(recipe.ingredientId.toString()) || 0) + need
      );
    }
  }

  // Fail the whole sale before touching anything if any direct-resale item is short.
  const branchInventory = await inventoryService.getBranchInventory(center._id);
  const branchIngredients = new Map(
    branchInventory.filter(row => row.itemType === 'ingredient').map(row => [String(row.ingredientId?._id || row.ingredientId), row])
  );
  for (const [ingredientId, need] of stockDeductions) {
    const ing = branchIngredients.get(String(ingredientId));
    if (!ing || ing.quantity < need) {
      return res.status(400).json({
        success: false,
        message: `الكمية غير كافية بمخزون الفرع لـ "${ing?.itemNameSnapshot || 'مكوّن'}" — المتاح ${ing?.quantity ?? 0}, المطلوب ${need}.`,
      });
    }
  }

  // ── All lines validated — build the sales. ──
  const salesToCreate = [];
  let totalSaleAmount = 0;
  const results = [];

  for (const { productId, quantity } of resolved) {
    const product = productMap.get(productId.toString());
    const productName = product.name;
    const unitPrice = Number(product.directPrice) || 0;
    const totalAmount = unitPrice * quantity;

    totalSaleAmount += totalAmount;

    salesToCreate.push({
      centerId:            center._id,
      centerNameSnapshot:  center.name,
      productId,
      productNameSnapshot: productName,
      quantity,
      unitPrice,
      totalAmount,
      notes,
    });

    results.push({
      productId,
      productNameSnapshot: productName,
    });
  }

  // Draw direct-resale items out of this branch only.
  for (const [ingredientId, need] of stockDeductions) {
    await inventoryService.decreaseIngredientStock(ingredientId, need, center._id);
  }

  const orderNumber = await InternalOrder.nextOrderNumber();
  const orderLines = resolved.map(({ productId, quantity }) => {
    const product = productMap.get(productId.toString());
    const unitPrice = Number(product.directPrice) || 0;
    return {
      productId, name: product.name, quantity, unitPrice,
      unitCost: Number(product.calculatedCost) || 0,
      lineTotal: unitPrice * quantity,
    };
  });
  const totalCost = orderLines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0);
  const kitchenOrder = await InternalOrder.create({
    centerId: center._id,
    orderNumber,
    qrPayload: orderNumber,
    items: orderLines,
    subtotal: totalSaleAmount,
    total: totalSaleAmount,
    totalCost,
    profit: totalSaleAmount - totalCost,
    paymentMethod: req.body.paymentMethod || 'cash',
    orderType: req.body.orderType || 'takeaway',
    customerName: req.body.customerName || '',
    customerPhone: req.body.customerPhone || '',
    notes: notes || '',
    status: 'new',
    timeline: [{ status: 'new', at: new Date(), by: center.name }],
    createdByName: center.name,
    stockApplied: stockDeductions.size > 0,
    stockMovements: [...stockDeductions.entries()].map(([ingredientId, quantity]) => ({
      itemType: 'ingredient', itemId: ingredientId, quantity,
      nameSnapshot: branchIngredients.get(String(ingredientId))?.itemNameSnapshot || '',
    })),
  });

  for (const sale of salesToCreate) sale.internalOrderId = kitchenOrder._id;
  const sales = await CenterSale.insertMany(salesToCreate);

  // Feed the branch's own till with the full amount actually collected
  // from the customer. InternalOrder snapshots the finance percentage and may
  // increase total above the restaurant net amount, so cash must use the saved
  // order total rather than the pre-tax cart subtotal.
  if (kitchenOrder.total > 0) {
    await cashService.createTransaction(
      'sale_income',
      kitchenOrder.total,
      'in',
      `بيع مباشر من الفرع ${orderNumber} (${sales.length} صنف)`,
      'InternalOrder',
      kitchenOrder._id,
      center._id
    );
    kitchenOrder.cashPosted = true;
    await kitchenOrder.save();
  }

  res.status(201).json({
    success: true,
    message: 'تم تسجيل البيع.',
    sale: sales[0],
    sales,
    netAmount: kitchenOrder.netAmount ?? totalSaleAmount,
    invoiceTaxPercent: kitchenOrder.invoiceTaxPercent || 0,
    invoiceTaxAmount: kitchenOrder.invoiceTaxAmount || 0,
    totalAmount: kitchenOrder.total,
    items: results,
    kitchenOrder,
  });
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
router.delete('/waste/:id', protectCenter, wasteController.delete);

/* ── Local purchases (branch-scoped) ──────────────────────
   Lets a branch buy supplies locally. Same controller as head office, so
   stock and weighted-average cost stay consistent — only the till differs. */
router.get('/purchases', protectCenter, purchaseController.getAll);
router.post('/purchases', protectCenter, purchaseController.createPurchase);
router.delete('/purchases/:id', protectCenter, purchaseController.delete);

/* Read-only ingredient list so the branch can pick what it bought.
   Costs and supplier history stay hidden — a branch has no business
   seeing head office's purchasing terms. */
router.get('/ingredients', protectCenter, async (req, res) => {
  const Ingredient = require('../models/Ingredient');
  const inventoryService = require('../services/inventoryService');
  const [ingredients, branchRows] = await Promise.all([
    Ingredient.find().select('name unitType').sort({ name: 1 }),
    inventoryService.getBranchInventory(req.center._id),
  ]);
  const stockByIngredient = new Map(branchRows
    .filter(row => row.itemType === 'ingredient')
    .map(row => [String(row.ingredientId?._id || row.ingredientId), row]));
  const scoped = ingredients
    .map(ingredient => ({
      ...ingredient.toObject(),
      currentStock: stockByIngredient.get(String(ingredient._id))?.quantity || 0,
      averageCostPerUnit: stockByIngredient.get(String(ingredient._id))?.averageCostPerUnit || 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  res.json({ success: true, ingredients: scoped });
});

/* ── POST /api/center-portal/ingredients — branch adds a missing item
   to the shared ingredient list (e.g. packaging, a local-only item).
   Same collection admin manages; created with zero stock/cost, ready
   for this branch's next local purchase to fill in. ── */
router.post('/ingredients', protectCenter, async (req, res) => {
  const Ingredient = require('../models/Ingredient');
  const { name, unitType } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'اسم المكوّن مطلوب.' });
  }
  if (!unitType) {
    return res.status(400).json({ success: false, message: 'نوع الوحدة مطلوب.' });
  }

  const existing = await Ingredient.findOne({ name: name.trim() });
  if (existing) {
    return res.json({ success: true, ingredient: existing, message: 'المكوّن موجود مسبقاً.' });
  }

  const ingredient = await Ingredient.create({ name: name.trim(), unitType });
  res.status(201).json({ success: true, ingredient, message: 'تمت إضافة المكوّن.' });
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
  if (!['manual_expense', 'manual_income'].includes(tx.type)) return res.status(403).json({ success: false, message: 'يمكن تصحيح القيود اليدوية فقط' });
  if (tx.reversedAt || tx.reversalOfId) return res.status(409).json({ success: false, message: 'لا يمكن تعديل معاملة معكوسة' });
  const { amount, description } = req.body;
  const nextAmount = amount === undefined ? tx.amount : Number(amount);
  if (!(nextAmount > 0)) return res.status(400).json({ success: false, message: 'المبلغ يجب أن يكون أكبر من صفر' });
  const reversal = await cashService.createTransaction(
    'adjustment', tx.amount, tx.direction === 'in' ? 'out' : 'in',
    `تصحيح: ${tx.description || 'معاملة يدوية'}`, 'CashTransaction', tx._id, req.center._id
  );
  reversal.reversalOfId = tx._id;
  await reversal.save();
  tx.reversedAt = new Date();
  tx.reversalTransactionId = reversal._id;
  await tx.save();
  const replacement = await cashService.createTransaction(
    tx.type, nextAmount, tx.direction, description === undefined ? tx.description : description,
    tx.referenceType, tx.referenceId, req.center._id
  );
  res.json({ success: true, transaction: replacement, reversedTransaction: tx, message: 'تم التصحيح بقيد عكسي وقيد بديل.' });
});

router.delete('/expenses/:id', protectCenter, async (req, res) => {
  const tx = await CashTransaction.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!tx) return res.status(404).json({ success: false, message: 'المعاملة غير موجودة' });
  if (!['manual_expense', 'manual_income'].includes(tx.type)) return res.status(403).json({ success: false, message: 'يمكن عكس القيود اليدوية فقط' });
  if (tx.reversedAt || tx.reversalOfId) return res.json({ success: true, message: 'المعاملة معكوسة مسبقاً' });
  const reversal = await cashService.createTransaction(
    'adjustment', tx.amount, tx.direction === 'in' ? 'out' : 'in',
    `عكس: ${tx.description || 'معاملة يدوية'}`, 'CashTransaction', tx._id, req.center._id
  );
  reversal.reversalOfId = tx._id;
  await reversal.save();
  tx.reversedAt = new Date();
  tx.reversalTransactionId = reversal._id;
  await tx.save();
  res.json({ success: true, transaction: reversal, message: 'تم عكس المعاملة مع الاحتفاظ بسجل التدقيق' });
});

/* ──────────────────────────────────────────────
   Attendance / fingerprint device (branch-scoped)
   Every route below MUST verify the target Employee (or the Employee
   behind a SalaryRecord) belongs to req.center._id before touching it
   or the device — a branch manager must never see or affect another
   branch's or head office's staff.
────────────────────────────────────────────── */

/** Resolve the signed-in branch's own terminal. */
async function branchDevice(centerId) {
  return AttendanceDevice.findOne({ centerId, isActive: true });
}

async function queueBranchCommand(centerId, type, payload = {}) {
  const device = await branchDevice(centerId);
  if (!device) {
    const err = new Error('لا يوجد جهاز بصمة مسجّل لهذا الفرع');
    err.statusCode = 400;
    throw err;
  }
  const command = await DeviceCommand.create({
    deviceId: device._id,
    type,
    payload,
    requestedBy: null,
  });
  return { device, command };
}

router.get('/attendance/device', protectCenter, async (req, res) => {
  const device = await AttendanceDevice.findOne({ centerId: req.center._id, isActive: true });
  if (!device) return res.json({ success: true, device: null });
  const pendingCommands = await DeviceCommand.countDocuments({
    deviceId: device._id,
    status: { $in: ['pending', 'running'] },
  });
  res.json({
    success: true,
    device: {
      id: device._id,
      name: device.name,
      deviceIp: device.deviceIp,
      devicePort: device.devicePort,
      lastSeenAt: device.lastSeenAt,
      lastSyncAt: device.lastSyncAt,
      lastSyncCount: device.lastSyncCount,
      deviceReachable: device.deviceReachable,
      lastError: device.lastError,
      discovered: device.discovered || [],
      deviceSerial: device.deviceSerial || '',
      deviceVersion: device.deviceVersion || '',
      agentVersion: device.agentVersion || '',
      pendingCommands,
    },
  });
});

router.post('/attendance/device/refresh', protectCenter, async (req, res) => {
  const { device } = await queueBranchCommand(req.center._id, 'get-info');
  await DeviceCommand.create({ deviceId: device._id, type: 'sync-time' });
  res.json({ success: true, message: 'تم إرسال طلب التحديث إلى جهاز الفرع' });
});

router.post('/attendance/device/scan', protectCenter, async (req, res) => {
  await queueBranchCommand(req.center._id, 'scan-network');
  res.json({ success: true, message: 'جارٍ البحث عن أجهزة البصمة على شبكة الفرع' });
});

/** Push an employee to this branch terminal, assigning a local PIN if needed. */
router.post('/employees/:id/push', protectCenter, async (req, res) => {
  const emp = await Employee.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  if (!emp.devicePin) {
    const used = (await Employee.find({ centerId: req.center._id, devicePin: { $ne: '' } }).select('devicePin'))
      .map(e => Number(e.devicePin)).filter(n => Number.isFinite(n));
    emp.devicePin = String(used.length ? Math.max(...used) + 1 : 1);
    await emp.save();
  }

  await queueBranchCommand(req.center._id, 'push-user', {
    uid: Number(emp.devicePin), pin: emp.devicePin, name: emp.name, employeeId: emp._id,
  });

  res.json({ success: true, employee: emp, message: `تم إرسال ${emp.name} إلى طابور جهاز الفرع` });
});

router.post('/employees/:id/enroll', protectCenter, async (req, res) => {
  const emp = await Employee.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  if (!emp.devicePin) return res.status(400).json({ success: false, message: 'أرسل الموظف إلى الجهاز أولاً' });

  await queueBranchCommand(req.center._id, 'start-enroll', {
    uid: Number(emp.devicePin), pin: emp.devicePin,
    fingerIndex: Number(req.body.fingerIndex) || 0, employeeId: emp._id,
  });

  res.json({ success: true, message: `الجهاز سيجهز خلال ثوانٍ — ${emp.name} يضع إصبعه 3 مرات` });
});

router.delete('/employees/:id/fingerprints', protectCenter, async (req, res) => {
  const emp = await Employee.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  if (!emp.devicePin) return res.status(400).json({ success: false, message: 'الموظف غير مرتبط بالجهاز' });

  await queueBranchCommand(req.center._id, 'clear-fingerprints', {
    uid: Number(emp.devicePin), pin: emp.devicePin, employeeId: emp._id,
  });
  emp.fingerprintEnrolled = false;
  await emp.save();
  res.json({ success: true, message: 'تم إرسال طلب مسح البصمات' });
});

router.delete('/employees/:id/device', protectCenter, async (req, res) => {
  const emp = await Employee.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  if (!emp.devicePin) return res.status(400).json({ success: false, message: 'الموظف غير مرتبط بالجهاز' });

  await queueBranchCommand(req.center._id, 'delete-user', {
    uid: Number(emp.devicePin), pin: emp.devicePin, employeeId: emp._id,
  });
  emp.syncedToDevice = false;
  emp.fingerprintEnrolled = false;
  await emp.save();
  res.json({ success: true, message: 'تم إرسال طلب حذف الموظف من الجهاز' });
});

router.post('/attendance/punch', protectCenter, async (req, res) => {
  const emp = await Employee.findOne({ _id: req.body.employeeId, centerId: req.center._id });
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  const when = req.body.at ? new Date(req.body.at) : new Date();
  if (Number.isNaN(when.getTime())) return res.status(400).json({ success: false, message: 'التوقيت غير صحيح' });
  const date = attendanceService.toDateKey(when);

  const log = await AttendanceLog.create({
    centerId: req.center._id,
    employeeId: emp._id,
    employeeName: emp.name,
    devicePin: emp.devicePin || `manual-${emp._id}`,
    timestamp: when,
    date,
    source: 'manual',
    notes: String(req.body.notes || '').trim(),
  });
  await attendanceService.recomputeDirections(date, emp._id);
  res.status(201).json({ success: true, log, message: 'تم تسجيل الحركة اليدوية' });
});

router.delete('/attendance/punch/:id', protectCenter, async (req, res) => {
  const log = await AttendanceLog.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!log) return res.status(404).json({ success: false, message: 'الحركة غير موجودة' });
  const { date, employeeId } = log;
  await log.deleteOne();
  await attendanceService.recomputeDirections(date, employeeId);
  res.json({ success: true, message: 'تم حذف الحركة وإعادة احتساب اليوم' });
});

/* ── Boards & reports — employeeScope(centerId) already filters to this
   branch only, so no extra filtering needed here. ── */

router.get('/attendance/daily', protectCenter, async (req, res) => {
  const date = req.query.date || attendanceService.toDateKey(new Date());
  res.json({ success: true, ...(await attendanceService.getDailyBoard(date, req.center._id.toString())) });
});

router.get('/attendance/summary', protectCenter, async (req, res) => {
  const to   = req.query.to   || attendanceService.toDateKey(new Date());
  const from = req.query.from || dayjs(to).startOf('month').format('YYYY-MM-DD');
  res.json({
    success: true, from, to,
    rows: await attendanceService.getRangeSummary(from, to, req.center._id.toString()),
  });
});

router.get('/attendance/employee/:id', protectCenter, async (req, res) => {
  const emp = await Employee.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!emp) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });

  const to   = req.query.to   || attendanceService.toDateKey(new Date());
  const from = req.query.from || dayjs(to).startOf('month').format('YYYY-MM-DD');

  const data = await attendanceService.getEmployeeSummary(req.params.id, from, to);
  if (!data) return res.status(404).json({ success: false, message: 'الموظف غير موجود' });
  res.json({ success: true, ...data });
});

/* ── Sync attendance onto a salary record (branch-scoped) ── */
router.post('/salary-records/:id/sync-attendance', protectCenter, async (req, res) => {
  const { payBasis } = req.body;

  const record = await SalaryRecord.findOne({ _id: req.params.id, centerId: req.center._id });
  if (!record) return res.status(404).json({ success: false, message: 'السجل غير موجود' });
  if (record.isPaid) return res.status(400).json({ success: false, message: 'لا يمكن التعديل بعد الصرف' });

  const emp = await Employee.findOne({ _id: record.employeeId, centerId: req.center._id });
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

module.exports = router;
