'use strict';

const mongoose = require('mongoose');

const money = value => Math.round((Number(value) || 0) * 100) / 100;
const sum = (rows, pick) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function parseDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error('التاريخ غير صالح');
    err.statusCode = 400;
    throw err;
  }
  return date;
}

function defaultRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0),
  };
}

function dbFor(brand) {
  if (!mongoose.connection?.client || !mongoose.connection?.db) {
    throw new Error('قاعدة البيانات غير متصلة');
  }
  if (brand === 'ajeena') return mongoose.connection.db;
  const dbName = process.env.LULIZ_DB_NAME || 'luliz';
  return mongoose.connection.client.db(dbName);
}

async function resolveCenter(db, brand) {
  const explicit = brand === 'ajeena'
    ? process.env.AMERICANS_AJEENA_CENTER_ID
    : process.env.AMERICANS_LULIZ_CENTER_ID;

  if (explicit && mongoose.isValidObjectId(explicit)) {
    const center = await db.collection('salescenters').findOne({ _id: new mongoose.Types.ObjectId(explicit) });
    if (center) return { _id: center._id, name: center.name || 'الأميركان', source: 'env' };
  }

  const centers = await db.collection('salescenters')
    .find({ isActive: { $ne: false } })
    .project({ _id: 1, name: 1, isActive: 1 })
    .toArray();

  const match = centers.find(center => {
    const name = normalizeName(center.name);
    return name.includes('الاميركان') || name.includes('اميركان') || name.includes('american');
  });
  if (match) return { _id: match._id, name: match.name, source: 'name' };

  // If a restaurant only has one active center, that is unambiguous enough to use.
  if (centers.length === 1) return { _id: centers[0]._id, name: centers[0].name, source: 'single-center' };

  // Luliz historically operated as one main shop before branch scoping existed.
  // Only fall back to HQ when there are no center records at all; never choose
  // between several branches silently.
  if (brand === 'luliz' && centers.length === 0) {
    return { _id: null, name: 'لوليز – الأميركان', source: 'hq' };
  }

  return null;
}

function scopedFilter(center, field = 'centerId') {
  if (!center) return null;
  return { [field]: center._id || null };
}

function resolvedFinanceSettings(doc, centerId) {
  const base = {
    currency: doc?.currency || 'SYP',
    invoiceTax: {
      enabled: doc?.invoiceTax?.enabled === true,
      percent: Number(doc?.invoiceTax?.percent || 0),
    },
    profitTax: {
      enabled: doc?.profitTax?.enabled === true,
      percent: Number(doc?.profitTax?.percent || 0),
    },
  };
  if (!centerId || !Array.isArray(doc?.branchOverrides)) return base;
  const row = doc.branchOverrides.find(item => String(item.centerId) === String(centerId) && item.enabled !== false);
  if (!row) return base;
  return {
    currency: base.currency,
    invoiceTax: {
      enabled: row.invoiceTax?.enabled ?? base.invoiceTax.enabled,
      percent: Number(row.invoiceTax?.percent ?? base.invoiceTax.percent),
    },
    profitTax: {
      enabled: row.profitTax?.enabled ?? base.profitTax.enabled,
      percent: Number(row.profitTax?.percent ?? base.profitTax.percent),
    },
  };
}

function revenueOf(order, totalField) {
  if (order.netAmount !== undefined && order.netAmount !== null) return Number(order.netAmount) || 0;
  const total = Number(order[totalField] ?? order.totalAmount ?? 0) || 0;
  return Math.max(total - (Number(order.invoiceTaxAmount) || 0), 0);
}

function collectionOf(order, totalField) {
  return Number(order[totalField] ?? order.totalAmount ?? 0) || 0;
}

function investorRate(brand, order, settings, kind) {
  if (brand === 'ajeena') {
    if (order?.investorPercent !== undefined && order?.investorPercent !== null) {
      return Number(order.investorPercent) || 0;
    }
    if (!settings || settings.enabled === false) return 0;
    if (kind === 'site') return Number(settings.percent || 0);
    if (order?.orderType === 'takeaway') return Number(settings.takeawayPercent ?? 10) || 0;
    if (order?.orderType === 'dine_in') return Number(settings.dineInPercent ?? 15) || 0;
    return Number(settings.percent ?? 15) || 0;
  }

  const investor = settings?.investor || {};
  if (investor.enabled === false) return 0;
  return kind === 'site'
    ? Number(investor.sitePercent ?? 10) || 0
    : Number(investor.posPercent ?? 15) || 0;
}

async function loadBrand(brand, range) {
  const db = dbFor(brand);
  const center = await resolveCenter(db, brand);
  const displayName = brand === 'ajeena' ? 'عجينة وطحينة' : 'لوليز';

  if (!center) {
    return {
      key: brand,
      name: displayName,
      configured: false,
      warning: 'لم يتم العثور على مركز الأميركان. حدّد AMERICANS_' + brand.toUpperCase() + '_CENTER_ID في البيئة.',
    };
  }

  const centerScope = scopedFilter(center);
  const dateScope = { createdAt: { $gte: range.start, $lt: range.end } };
  const internalFilter = { ...dateScope, status: { $ne: 'cancelled' }, ...centerScope };
  const siteFilter = { ...dateScope, status: 'delivered', ...centerScope };
  const cashFilter = { transactionDate: { $gte: range.start, $lt: range.end }, ...centerScope };
  const returnFilter = { ...dateScope, ...centerScope };
  const paymentFilter = {
    ...centerScope,
    $or: [
      { paidAt: { $gte: range.start, $lt: range.end } },
      { periodStart: { $lt: range.end }, periodEnd: { $gte: range.start } },
    ],
  };

  const investorCollection = brand === 'ajeena' ? 'investorsettings' : 'profitsharesettings';
  const [internalOrders, siteOrders, cashRows, taxPayments, returns, financeSettings, investorSettings, shifts] = await Promise.all([
    db.collection('internalorders').find(internalFilter).project({
      orderNumber: 1, createdAt: 1, orderType: 1, paymentMethod: 1, total: 1,
      netAmount: 1, invoiceTaxAmount: 1, totalCost: 1, investorPercent: 1, status: 1,
    }).toArray(),
    db.collection('customerorders').find(siteFilter).project({
      createdAt: 1, customerName: 1, totalPrice: 1, totalAmount: 1, netAmount: 1,
      invoiceTaxAmount: 1, totalCost: 1, status: 1,
    }).toArray(),
    db.collection('cashtransactions').find(cashFilter).project({
      type: 1, amount: 1, direction: 1, description: 1, transactionDate: 1, referenceType: 1,
    }).sort({ transactionDate: -1 }).limit(250).toArray(),
    db.collection('taxpayments').find(paymentFilter).project({
      type: 1, amount: 1, paidAt: 1, reference: 1, notes: 1,
    }).sort({ paidAt: -1 }).toArray(),
    db.collection('returnrecords').find(returnFilter).project({
      orderId: 1, refundAmount: 1, refundMethod: 1, createdAt: 1, returnNumber: 1,
    }).toArray().catch(() => []),
    db.collection('financesettings').findOne({}),
    db.collection(investorCollection).findOne({}),
    db.collection('cashiershifts').find({
      ...centerScope,
      openedAt: { $lt: range.end },
      $or: [{ closedAt: { $gte: range.start } }, { status: 'open' }],
    }).project({
      number: 1, businessDay: 1, status: 1, openedAt: 1, closedAt: 1,
      openingCash: 1, expectedCash: 1, countedCash: 1, difference: 1,
    }).sort({ openedAt: -1 }).limit(40).toArray().catch(() => []),
  ]);

  const settings = resolvedFinanceSettings(financeSettings, center._id);
  const internalRevenue = sum(internalOrders, order => revenueOf(order, 'total'));
  const siteRevenue = sum(siteOrders, order => revenueOf(order, 'totalPrice'));
  const revenueBeforeInvoiceTax = internalRevenue + siteRevenue;
  const invoiceTaxCollected = sum(internalOrders, order => order.invoiceTaxAmount)
    + sum(siteOrders, order => order.invoiceTaxAmount);
  const customerCollections = sum(internalOrders, order => collectionOf(order, 'total'))
    + sum(siteOrders, order => collectionOf(order, 'totalPrice'));
  const costOfGoods = sum(internalOrders, order => order.totalCost) + sum(siteOrders, order => order.totalCost);
  const operatingExpenses = sum(cashRows.filter(row => row.direction === 'out' && row.type === 'manual_expense'), row => row.amount);
  const purchaseCashOut = sum(cashRows.filter(row => row.direction === 'out' && row.type === 'purchase_expense'), row => row.amount);
  const cashIn = sum(cashRows.filter(row => row.direction === 'in'), row => row.amount);
  const cashOut = sum(cashRows.filter(row => row.direction === 'out'), row => row.amount);
  const refundsTotal = sum(returns, row => row.refundAmount);
  const invoiceTaxPaid = sum(taxPayments.filter(row => row.type === 'invoice_tax'), row => row.amount);
  const profitTaxPaid = sum(taxPayments.filter(row => row.type === 'profit_tax'), row => row.amount);
  const profitBeforeTax = revenueBeforeInvoiceTax - costOfGoods - operatingExpenses;
  const profitTaxEstimate = settings.profitTax.enabled && profitBeforeTax > 0
    ? profitBeforeTax * settings.profitTax.percent / 100
    : 0;

  let investorShare = 0;
  for (const order of internalOrders) {
    const rate = investorRate(brand, order, investorSettings, 'pos');
    investorShare += revenueOf(order, 'total') * rate / 100;
  }
  for (const order of siteOrders) {
    const rate = investorRate(brand, order, investorSettings, 'site');
    investorShare += revenueOf(order, 'totalPrice') * rate / 100;
  }

  if (returns.length) {
    const ids = returns.map(row => row.orderId).filter(Boolean);
    const returnedOrders = ids.length
      ? await db.collection('internalorders').find({ _id: { $in: ids } }).project({ orderType: 1, investorPercent: 1 }).toArray()
      : [];
    const byId = new Map(returnedOrders.map(order => [String(order._id), order]));
    for (const row of returns) {
      const source = byId.get(String(row.orderId));
      const rate = investorRate(brand, source || {}, investorSettings, 'pos');
      investorShare -= (Number(row.refundAmount) || 0) * rate / 100;
    }
  }

  const recentOrders = [
    ...internalOrders.map(order => ({
      kind: 'pos', number: order.orderNumber || 'طلب داخلي', at: order.createdAt,
      amount: collectionOf(order, 'total'), netAmount: revenueOf(order, 'total'),
      tax: Number(order.invoiceTaxAmount || 0), paymentMethod: order.paymentMethod || '',
    })),
    ...siteOrders.map(order => ({
      kind: 'site', number: 'طلب موقع', at: order.createdAt,
      amount: collectionOf(order, 'totalPrice'), netAmount: revenueOf(order, 'totalPrice'),
      tax: Number(order.invoiceTaxAmount || 0), paymentMethod: '',
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 80);

  return {
    key: brand,
    name: displayName,
    configured: true,
    center: { id: center._id ? String(center._id) : 'hq', name: center.name, source: center.source },
    currency: settings.currency,
    settings,
    summary: {
      ordersCount: internalOrders.length + siteOrders.length,
      customerCollections: money(customerCollections),
      refunds: money(refundsTotal),
      netCollectionsAfterRefunds: money(customerCollections - refundsTotal),
      revenueBeforeInvoiceTax: money(revenueBeforeInvoiceTax),
      invoiceTaxCollected: money(invoiceTaxCollected),
      costOfGoods: money(costOfGoods),
      operatingExpenses: money(operatingExpenses),
      purchaseCashOut: money(purchaseCashOut),
      profitBeforeTax: money(profitBeforeTax),
      profitTaxEstimate: money(profitTaxEstimate),
      estimatedNetProfitAfterTax: money(profitBeforeTax - profitTaxEstimate),
      invoiceTaxPaid: money(invoiceTaxPaid),
      profitTaxPaid: money(profitTaxPaid),
      invoiceTaxDue: money(Math.max(invoiceTaxCollected - invoiceTaxPaid, 0)),
      profitTaxDue: money(Math.max(profitTaxEstimate - profitTaxPaid, 0)),
      investorShare: money(Math.max(investorShare, 0)),
      cashIn: money(cashIn),
      cashOut: money(cashOut),
      cashMovementNet: money(cashIn - cashOut),
    },
    recentOrders,
    recentCash: cashRows.slice(0, 80).map(row => ({
      id: String(row._id), type: row.type, amount: row.amount, direction: row.direction,
      description: row.description || '', at: row.transactionDate,
    })),
    taxPayments: taxPayments.slice(0, 80).map(row => ({
      id: String(row._id), type: row.type, amount: row.amount, at: row.paidAt,
      reference: row.reference || '', notes: row.notes || '',
    })),
    shifts: shifts.map(row => ({
      id: String(row._id), number: row.number, businessDay: row.businessDay, status: row.status,
      openedAt: row.openedAt, closedAt: row.closedAt, openingCash: row.openingCash,
      expectedCash: row.expectedCash, countedCash: row.countedCash, difference: row.difference,
    })),
  };
}

async function getSummary(query = {}) {
  const defaults = defaultRange();
  const start = parseDate(query.start, defaults.start);
  const end = parseDate(query.end, defaults.end);
  if (end <= start) {
    const err = new Error('نهاية الفترة يجب أن تكون بعد بدايتها');
    err.statusCode = 400;
    throw err;
  }

  const brands = await Promise.all([
    loadBrand('luliz', { start, end }),
    loadBrand('ajeena', { start, end }),
  ]);
  const configured = brands.filter(item => item.configured);
  const total = key => money(configured.reduce((acc, item) => acc + Number(item.summary?.[key] || 0), 0));

  return {
    range: { start, end },
    brands,
    totals: {
      ordersCount: configured.reduce((acc, item) => acc + Number(item.summary?.ordersCount || 0), 0),
      customerCollections: total('customerCollections'),
      refunds: total('refunds'),
      netCollectionsAfterRefunds: total('netCollectionsAfterRefunds'),
      revenueBeforeInvoiceTax: total('revenueBeforeInvoiceTax'),
      invoiceTaxCollected: total('invoiceTaxCollected'),
      costOfGoods: total('costOfGoods'),
      operatingExpenses: total('operatingExpenses'),
      purchaseCashOut: total('purchaseCashOut'),
      profitBeforeTax: total('profitBeforeTax'),
      profitTaxEstimate: total('profitTaxEstimate'),
      estimatedNetProfitAfterTax: total('estimatedNetProfitAfterTax'),
      invoiceTaxPaid: total('invoiceTaxPaid'),
      profitTaxPaid: total('profitTaxPaid'),
      invoiceTaxDue: total('invoiceTaxDue'),
      profitTaxDue: total('profitTaxDue'),
      investorShare: total('investorShare'),
      cashIn: total('cashIn'),
      cashOut: total('cashOut'),
      cashMovementNet: total('cashMovementNet'),
    },
  };
}

module.exports = { getSummary };
