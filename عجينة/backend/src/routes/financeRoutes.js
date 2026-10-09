'use strict';

const router = require('express').Router();
const mongoose = require('mongoose');
const { protect, requireAdmin, requireRole } = require('../middleware/auth');
const FinanceSettings = require('../models/FinanceSettings');
const TaxPayment = require('../models/TaxPayment');
const SalesCenter = require('../models/SalesCenter');
const InternalOrder = require('../models/InternalOrder');
const CustomerOrder = require('../models/CustomerOrder');
const CashTransaction = require('../models/CashTransaction');
const CashierShift = require('../models/CashierShift');
const financeService = require('../services/financeService');
const InvestorSettings = require('../models/InvestorSettings');

router.use(protect);

const visibleToFinance = requireRole('admin', 'supervisor', 'viewer');

function readPercent(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    const err = new Error(`${label} يجب أن تكون بين 0 و 100`);
    err.statusCode = 400;
    throw err;
  }
  return number;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value, fallback) {
  if (!value) return fallback;
  const raw = String(value);
  const date = DATE_ONLY.test(raw)
    ? new Date(`${raw}T00:00:00+03:00`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const err = new Error('التاريخ غير صالح');
    err.statusCode = 400;
    throw err;
  }
  return date;
}

function defaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function normalizeCenterSelector(value) {
  if (!value || value === 'all') return { mode: 'all', centerId: null };
  if (value === 'hq') return { mode: 'one', centerId: null };
  if (!mongoose.isValidObjectId(value)) {
    const err = new Error('الفرع غير صالح');
    err.statusCode = 400;
    throw err;
  }
  return { mode: 'one', centerId: String(value) };
}

function applyCenter(filter, selector) {
  if (selector.mode !== 'one') return;
  filter.centerId = selector.centerId ? selector.centerId : null;
}

function centerKey(value) {
  return value ? String(value) : 'hq';
}

const calendarStartDamascus = day => new Date(`${day}T00:00:00+03:00`);
const calendarNextStartDamascus = day => {
  const [y,m,d] = String(day).split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0,10);
  return new Date(`${next}T00:00:00+03:00`);
};

async function resolveOperationalReportRange(req, selector) {
  const day = String(req.query.businessDay || '');
  if (!DATE_ONLY.test(day)) {
    const defaults = defaultRange();
    const start = parseDate(req.query.start, defaults.start);
    const end = parseDate(req.query.end, defaults.end);
    return { start, end, operationalDay: null, closingShift: null };
  }

  const start = calendarStartDamascus(day);
  const shiftFilter = { businessDay: day, status: 'closed', closedAt: { $ne: null } };

  if (selector.mode === 'one') {
    shiftFilter.centerId = selector.centerId ? selector.centerId : null;
  }

  const closingShift = await CashierShift.findOne(shiftFilter)
    .sort({ closedAt: -1 })
    .select('number centerId openedAt closedAt businessDay');

  const end = closingShift?.closedAt || calendarNextStartDamascus(day);
  return { start, end, operationalDay: day, closingShift };
}

async function adoptLegacyOrdersForAmericans(selector, start, end) {
  let center = null;

  if (selector.mode === 'one' && selector.centerId && mongoose.isValidObjectId(selector.centerId)) {
    const selected = await SalesCenter.findById(selector.centerId).select('name');
    if (/(الأميركان|اميركان|american)/i.test(String(selected?.name || ''))) center = selected;
  }

  if (!center) {
    center = await SalesCenter.findOne({
      name: { $regex: /(الأميركان|اميركان|american)/i },
    }).select('name');
  }

  if (!center) return 0;

  const range = { createdAt: { $gte: start, $lt: end }, centerId: null };
  const [internal, site] = await Promise.all([
    InternalOrder.updateMany(range, { $set: { centerId: center._id } }),
    CustomerOrder.updateMany(range, { $set: { centerId: center._id, centerNameSnapshot: center.name } }),
  ]);

  return Number(internal.modifiedCount || 0) + Number(site.modifiedCount || 0);
}

function emptyBucket(centerId, name) {
  return {
    centerId: centerId || null,
    centerName: name,
    ordersCount: 0,
    customerCollections: 0,
    revenueBeforeInvoiceTax: 0,
    invoiceTaxCollected: 0,
    costOfGoods: 0,
    operatingExpenses: 0,
    profitBeforeTax: 0,
    profitTaxPercent: 0,
    profitTaxEstimate: 0,
    estimatedNetProfitAfterTax: 0,
    invoiceTaxPaid: 0,
    profitTaxPaid: 0,
    invoiceTaxDue: 0,
    profitTaxDue: 0,
  };
}

router.get('/settings', visibleToFinance, async (req, res) => {
  const [settings, centers] = await Promise.all([
    FinanceSettings.getSingleton(),
    SalesCenter.find({}).sort({ name: 1 }).select('name isActive type'),
  ]);

  res.json({
    success: true,
    settings: settings.present(),
    branches: [
      { _id: 'hq', name: 'الفرع الرئيسي', isActive: true, resolved: settings.resolveFor(null) },
      ...centers.map(center => ({
        _id: String(center._id),
        name: center.name,
        isActive: center.isActive !== false,
        type: center.type,
        resolved: settings.resolveFor(center._id),
      })),
    ],
  });
});

router.put('/settings', requireAdmin, async (req, res) => {
  const settings = await FinanceSettings.getSingleton();
  const invoiceTax = req.body.invoiceTax || {};
  const profitTax = req.body.profitTax || {};

  if (req.body.currency !== undefined) {
    settings.currency = String(req.body.currency || 'SYP').trim().toUpperCase().slice(0, 8) || 'SYP';
  }
  if (invoiceTax.enabled !== undefined) settings.invoiceTax.enabled = !!invoiceTax.enabled;
  if (invoiceTax.percent !== undefined) settings.invoiceTax.percent = readPercent(invoiceTax.percent, 'نسبة ضريبة الفاتورة');
  if (profitTax.enabled !== undefined) settings.profitTax.enabled = !!profitTax.enabled;
  if (profitTax.percent !== undefined) settings.profitTax.percent = readPercent(profitTax.percent, 'نسبة ضريبة الأرباح');

  await settings.save();
  res.json({ success: true, message: 'تم حفظ الإعدادات المالية للمطعم', settings: settings.present() });
});

router.put('/settings/branches/:centerId', requireAdmin, async (req, res) => {
  const { centerId } = req.params;
  if (!mongoose.isValidObjectId(centerId)) {
    return res.status(400).json({ success: false, message: 'الفرع غير صالح' });
  }
  const center = await SalesCenter.findById(centerId);
  if (!center) return res.status(404).json({ success: false, message: 'الفرع غير موجود' });

  const settings = await FinanceSettings.getSingleton();
  let row = settings.branchOverrides.find(item => String(item.centerId) === String(centerId));
  if (!row) {
    settings.branchOverrides.push({ centerId, enabled: true });
    row = settings.branchOverrides[settings.branchOverrides.length - 1];
  }

  row.enabled = req.body.enabled !== false;
  const invoiceTax = req.body.invoiceTax || {};
  const profitTax = req.body.profitTax || {};
  if (invoiceTax.enabled !== undefined) row.invoiceTax.enabled = !!invoiceTax.enabled;
  if (invoiceTax.percent !== undefined) row.invoiceTax.percent = readPercent(invoiceTax.percent, 'نسبة ضريبة الفاتورة');
  if (profitTax.enabled !== undefined) row.profitTax.enabled = !!profitTax.enabled;
  if (profitTax.percent !== undefined) row.profitTax.percent = readPercent(profitTax.percent, 'نسبة ضريبة الأرباح');

  await settings.save();
  res.json({
    success: true,
    message: `تم حفظ الإعدادات المالية لفرع ${center.name}`,
    settings: settings.present(),
    resolved: settings.resolveFor(centerId),
  });
});

router.delete('/settings/branches/:centerId', requireAdmin, async (req, res) => {
  const settings = await FinanceSettings.getSingleton();
  settings.branchOverrides = settings.branchOverrides.filter(
    item => String(item.centerId) !== String(req.params.centerId)
  );
  await settings.save();
  res.json({ success: true, message: 'عاد الفرع لاستخدام نسب المطعم الرئيسية', settings: settings.present() });
});

router.get('/quote', visibleToFinance, async (req, res) => {
  const amount = Number(req.query.amount || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ success: false, message: 'المبلغ غير صالح' });
  }
  const centerId = req.query.center && req.query.center !== 'hq' ? req.query.center : null;
  res.json({ success: true, quote: await financeService.quote(amount, centerId) });
});

router.get('/summary', visibleToFinance, async (req, res) => {
  const defaults = defaultRange();
  const start = parseDate(req.query.start, defaults.start);
  const end = parseDate(req.query.end, defaults.end);
  if (end <= start) return res.status(400).json({ success: false, message: 'نهاية الفترة يجب أن تكون بعد بدايتها' });

  const selector = normalizeCenterSelector(req.query.center);
  await adoptLegacyOrdersForAmericans(selector, start, end);
  const internalFilter = { createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } };
  const siteFilter = { createdAt: { $gte: start, $lt: end }, status: 'delivered' };
  const expenseFilter = {
    transactionDate: { $gte: start, $lt: end },
    direction: 'out',
    type: 'manual_expense',
  };
  applyCenter(internalFilter, selector);
  applyCenter(siteFilter, selector);
  applyCenter(expenseFilter, selector);

  const paymentFilter = {
    $or: [
      { paidAt: { $gte: start, $lt: end } },
      { periodStart: { $lt: end }, periodEnd: { $gte: start } },
    ],
  };
  applyCenter(paymentFilter, selector);

  const [settings, centers, internalOrders, siteOrders, expenses, payments] = await Promise.all([
    FinanceSettings.getSingleton(),
    SalesCenter.find({}).select('name isActive'),
    InternalOrder.find(internalFilter).select('centerId total netAmount invoiceTaxAmount totalCost status'),
    CustomerOrder.find(siteFilter).select('centerId totalPrice netAmount invoiceTaxAmount totalCost status'),
    CashTransaction.find(expenseFilter).select('centerId amount'),
    TaxPayment.find(paymentFilter).select('centerId type amount paidAt periodStart periodEnd reference notes'),
  ]);

  const names = new Map(centers.map(center => [String(center._id), center.name]));
  const buckets = new Map();
  const ensure = rawCenterId => {
    const key = centerKey(rawCenterId);
    if (!buckets.has(key)) {
      buckets.set(key, emptyBucket(key === 'hq' ? null : key, key === 'hq' ? 'الفرع الرئيسي' : (names.get(key) || 'فرع')));
    }
    return buckets.get(key);
  };

  if (selector.mode === 'one') ensure(selector.centerId);

  for (const order of internalOrders) {
    const bucket = ensure(order.centerId);
    const revenue = financeService.revenueOf(order, 'total');
    const tax = financeService.invoiceTaxOf(order);
    bucket.ordersCount += 1;
    bucket.revenueBeforeInvoiceTax += revenue;
    bucket.invoiceTaxCollected += tax;
    bucket.customerCollections += revenue + tax;
    bucket.costOfGoods += Number(order.totalCost || 0);
  }

  for (const order of siteOrders) {
    const bucket = ensure(order.centerId);
    const revenue = financeService.revenueOf(order, 'totalPrice');
    const tax = financeService.invoiceTaxOf(order);
    bucket.ordersCount += 1;
    bucket.revenueBeforeInvoiceTax += revenue;
    bucket.invoiceTaxCollected += tax;
    bucket.customerCollections += revenue + tax;
    bucket.costOfGoods += Number(order.totalCost || 0);
  }

  for (const expense of expenses) ensure(expense.centerId).operatingExpenses += Number(expense.amount || 0);
  for (const payment of payments) {
    const bucket = ensure(payment.centerId);
    if (payment.type === 'invoice_tax') bucket.invoiceTaxPaid += Number(payment.amount || 0);
    if (payment.type === 'profit_tax') bucket.profitTaxPaid += Number(payment.amount || 0);
  }

  for (const bucket of buckets.values()) {
    const resolved = settings.resolveFor(bucket.centerId);
    bucket.revenueBeforeInvoiceTax = financeService.money(bucket.revenueBeforeInvoiceTax);
    bucket.invoiceTaxCollected = financeService.money(bucket.invoiceTaxCollected);
    bucket.customerCollections = financeService.money(bucket.customerCollections);
    bucket.costOfGoods = financeService.money(bucket.costOfGoods);
    bucket.operatingExpenses = financeService.money(bucket.operatingExpenses);
    bucket.profitBeforeTax = financeService.money(
      bucket.revenueBeforeInvoiceTax - bucket.costOfGoods - bucket.operatingExpenses
    );
    const estimate = financeService.profitTaxEstimate(bucket.profitBeforeTax, resolved);
    bucket.profitTaxPercent = estimate.percent;
    bucket.profitTaxEstimate = estimate.amount;
    bucket.estimatedNetProfitAfterTax = financeService.money(bucket.profitBeforeTax - estimate.amount);
    bucket.invoiceTaxPaid = financeService.money(bucket.invoiceTaxPaid);
    bucket.profitTaxPaid = financeService.money(bucket.profitTaxPaid);
    bucket.invoiceTaxDue = financeService.money(Math.max(bucket.invoiceTaxCollected - bucket.invoiceTaxPaid, 0));
    bucket.profitTaxDue = financeService.money(Math.max(bucket.profitTaxEstimate - bucket.profitTaxPaid, 0));
    bucket.settings = resolved;
  }

  const branchRows = [...buckets.values()].sort((a, b) => a.centerName.localeCompare(b.centerName, 'ar'));
  const total = key => financeService.money(branchRows.reduce((sum, row) => sum + Number(row[key] || 0), 0));

  res.json({
    success: true,
    range: { start, end },
    currency: settings.currency || 'SYP',
    branches: branchRows,
    totals: {
      ordersCount: branchRows.reduce((sum, row) => sum + row.ordersCount, 0),
      customerCollections: total('customerCollections'),
      revenueBeforeInvoiceTax: total('revenueBeforeInvoiceTax'),
      invoiceTaxCollected: total('invoiceTaxCollected'),
      costOfGoods: total('costOfGoods'),
      operatingExpenses: total('operatingExpenses'),
      profitBeforeTax: total('profitBeforeTax'),
      profitTaxEstimate: total('profitTaxEstimate'),
      estimatedNetProfitAfterTax: total('estimatedNetProfitAfterTax'),
      invoiceTaxPaid: total('invoiceTaxPaid'),
      profitTaxPaid: total('profitTaxPaid'),
      invoiceTaxDue: total('invoiceTaxDue'),
      profitTaxDue: total('profitTaxDue'),
    },
  });
});


/* GET /api/finance/report
   Printable sales statement matching the finance form used by the restaurant. */
router.get('/report', visibleToFinance, async (req, res) => {
  const selector = normalizeCenterSelector(req.query.center);
  const { start, end, operationalDay, closingShift } = await resolveOperationalReportRange(req, selector);
  if (end <= start) return res.status(400).json({ success: false, message: 'نهاية الفترة يجب أن تكون بعد بدايتها' });

  await adoptLegacyOrdersForAmericans(selector, start, end);
  const internalFilter = { createdAt: { $gte: start, $lt: end }, status: { $ne: 'cancelled' } };
  const siteFilter = { createdAt: { $gte: start, $lt: end }, status: 'delivered' };
  applyCenter(internalFilter, selector);
  applyCenter(siteFilter, selector);

  const [settings, investorSettings, centers, internalOrders, siteOrders] = await Promise.all([
    FinanceSettings.getSingleton(),
    InvestorSettings.getSingleton(),
    SalesCenter.find({}).select('name isActive'),
    InternalOrder.find(internalFilter).select(
      'centerId orderType netAmount total invoiceTaxAmount consumptionTaxAmount localAdminAmount createdAt'
    ),
    CustomerOrder.find(siteFilter).select(
      'centerId netAmount totalPrice invoiceTaxAmount consumptionTaxAmount localAdminAmount createdAt'
    ),
  ]);

  const investor = investorSettings.present();
  const investorOn = investor.enabled !== false;
  const internalPct = investorOn ? Number(investor.dineInPercent ?? investor.internalPercent ?? 20) : 0;
  const deliveryPct = investorOn ? Number(investor.percent ?? investor.deliveryPercent ?? 15) : 0;
  const investorName = investor.name || 'الأميركان';

  const investorRate = orderType => orderType === 'dine_in' ? internalPct : deliveryPct;
  const centerNames = new Map(centers.map(center => [String(center._id), center.name]));
  const rows = new Map();

  const ensureRow = rawCenterId => {
    const key = rawCenterId ? String(rawCenterId) : 'hq';
    if (!rows.has(key)) rows.set(key, {
      centerId: key === 'hq' ? null : key,
      pointOfSale: key === 'hq' ? 'الفرع الرئيسي' : (centerNames.get(key) || 'نقطة بيع'),
      ordersCount: 0,
      foodAndBeverageValue: 0,
      consumptionTax: 0,
      localAdministration: 0,
      taxTotal: 0,
      investorInternalBase: 0,
      investorExternalBase: 0,
      investorInternal: 0,
      investorExternal: 0,
      investorShare: 0,
      obligationsTotal: 0,
      grandTotal: 0,
    });
    return rows.get(key);
  };

  if (selector.mode === 'one') ensureRow(selector.centerId);

  const addOrder = (order, totalField, orderType = 'delivery') => {
    const row = ensureRow(order.centerId);
    const base = financeService.revenueOf(order, totalField);
    const consumption = financeService.consumptionTaxOf(order);
    const local = financeService.localAdminTaxOf(order);
    const grandTotal = financeService.money(base + consumption + local);
    const rate = investorRate(orderType);
    const share = investorOn ? financeService.money(grandTotal * rate / 100) : 0;
    row.ordersCount += 1;
    row.foodAndBeverageValue += base;
    row.consumptionTax += consumption;
    row.localAdministration += local;
    row.taxTotal += consumption + local;
    row.investorShare += share;
    if (orderType === 'dine_in') {
      row.investorInternalBase += grandTotal;
      row.investorInternal += share;
    } else {
      row.investorExternalBase += grandTotal;
      row.investorExternal += share;
    }
    row.obligationsTotal += consumption + local + share;
    row.grandTotal += grandTotal;
  };

  internalOrders.forEach(order => addOrder(order, 'total', order.orderType));
  siteOrders.forEach(order => addOrder(order, 'totalPrice', 'delivery'));

  const moneyFields = [
    'foodAndBeverageValue', 'consumptionTax', 'localAdministration', 'taxTotal',
    'investorInternalBase', 'investorExternalBase',
    'investorInternal', 'investorExternal', 'investorShare', 'obligationsTotal', 'grandTotal',
  ];
  const resultRows = [...rows.values()]
    .map(row => {
      const value = { ...row };
      moneyFields.forEach(key => { value[key] = financeService.money(value[key]); });
      return value;
    })
    .sort((a, b) => a.pointOfSale.localeCompare(b.pointOfSale, 'ar'));

  const total = key => financeService.money(resultRows.reduce((sum, row) => sum + Number(row[key] || 0), 0));

  res.json({
    success: true,
    title: 'إجمالي المبيعات',
    period: { start, end, operationalDay, closingShift: closingShift ? {
      number: closingShift.number,
      openedAt: closingShift.openedAt,
      closedAt: closingShift.closedAt,
      centerId: closingShift.centerId,
    } : null },
    rates: { consumptionTaxPercent: 5, localAdminPercent: 5, localAdminBase: 'consumption_tax' },
    currency: settings.currency || 'SYP',
    investor: {
      enabled: investorOn,
      name: investorName,
      internalPercent: internalPct,
      deliveryPercent: deliveryPct,
      takeawayPercent: deliveryPct,
    },
    rows: resultRows,
    totals: {
      ordersCount: resultRows.reduce((sum, row) => sum + Number(row.ordersCount || 0), 0),
      foodAndBeverageValue: total('foodAndBeverageValue'),
      consumptionTax: total('consumptionTax'),
      localAdministration: total('localAdministration'),
      taxTotal: total('taxTotal'),
      investorInternalBase: total('investorInternalBase'),
      investorExternalBase: total('investorExternalBase'),
      investorSplitTotal: financeService.money(total('investorInternalBase') + total('investorExternalBase')),
      investorSplitDifference: financeService.money(
        total('grandTotal') - (total('investorInternalBase') + total('investorExternalBase'))
      ),
      investorInternal: total('investorInternal'),
      investorExternal: total('investorExternal'),
      investorShare: total('investorShare'),
      obligationsTotal: total('obligationsTotal'),
      grandTotal: total('grandTotal'),
    },
  });
});

router.get('/payments', visibleToFinance, async (req, res) => {
  const selector = normalizeCenterSelector(req.query.center);
  const filter = {};
  applyCenter(filter, selector);
  if (req.query.type && ['invoice_tax', 'profit_tax'].includes(req.query.type)) filter.type = req.query.type;
  const payments = await TaxPayment.find(filter).sort({ paidAt: -1 }).limit(500);
  res.json({ success: true, payments });
});

router.post('/payments', requireAdmin, async (req, res) => {
  const { type, amount, centerId, paidAt, periodStart, periodEnd, reference = '', notes = '' } = req.body;
  if (!['invoice_tax', 'profit_tax'].includes(type)) {
    return res.status(400).json({ success: false, message: 'نوع الضريبة غير صالح' });
  }
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ success: false, message: 'المبلغ يجب أن يكون أكبر من صفر' });
  }
  let validCenterId = null;
  if (centerId && centerId !== 'hq') {
    if (!mongoose.isValidObjectId(centerId)) return res.status(400).json({ success: false, message: 'الفرع غير صالح' });
    const exists = await SalesCenter.exists({ _id: centerId });
    if (!exists) return res.status(404).json({ success: false, message: 'الفرع غير موجود' });
    validCenterId = centerId;
  }

  const payment = await TaxPayment.create({
    type,
    amount: financeService.money(numericAmount),
    centerId: validCenterId,
    paidAt: paidAt ? parseDate(paidAt) : new Date(),
    periodStart: periodStart ? parseDate(periodStart) : null,
    periodEnd: periodEnd ? parseDate(periodEnd) : null,
    reference: String(reference || '').trim(),
    notes: String(notes || '').trim(),
    createdBy: req.user._id,
    createdByName: req.user.name || '',
  });
  res.status(201).json({ success: true, message: 'تم تسجيل دفعة المالية', payment });
});

router.delete('/payments/:id', requireAdmin, async (req, res) => {
  const payment = await TaxPayment.findById(req.params.id);
  if (!payment) return res.status(404).json({ success: false, message: 'الدفعة غير موجودة' });
  await payment.deleteOne();
  res.json({ success: true, message: 'تم حذف سجل الدفعة' });
});

module.exports = router;
