'use strict';

const reportService = require('../services/reportService');
const dayjs = require('dayjs');

exports.getDashboard = async (req, res) => {
  const date = req.query.date || undefined;   // a working day, 'YYYY-MM-DD'
  const data = await reportService.getDashboardData(date);
  res.json({ success: true, ...data });
};

exports.getDaily = async (req, res) => {
  const date = req.query.date || undefined;   // a working day, 'YYYY-MM-DD'
  const data = await reportService.getDailyReport(date);
  res.json({ success: true, ...data });
};

exports.getMonthly = async (req, res) => {
  const year = Number(req.query.year) || dayjs().year();
  const month = Number(req.query.month) || dayjs().month() + 1;
  const data = await reportService.getMonthlyReport(year, month);
  res.json({ success: true, ...data });
};

exports.getProducts = async (req, res) => {
  const data = await reportService.getProductsReport(req.query.startDate, req.query.endDate);
  res.json({ success: true, products: data });
};

exports.getCenters = async (req, res) => {
  const SalesCenter = require('../models/SalesCenter');
  const Sale = require('../models/Sale');

  const centers = await SalesCenter.find({ isActive: true });
  const result = [];

  for (const center of centers) {
    const match = { centerId: center._id, status: { $ne: 'reversed' } };
    if (req.query.startDate || req.query.endDate) {
      match.saleDate = {};
      if (req.query.startDate) match.saleDate.$gte = new Date(req.query.startDate);
      if (req.query.endDate) {
        const e = new Date(req.query.endDate);
        e.setHours(23, 59, 59, 999);
        match.saleDate.$lte = e;
      }
    }

    const agg = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$netAmount' },
          totalCommission: { $sum: '$commissionAmount' },
          totalForLuliz: { $sum: '$amountForLuliz' },
          totalProfit: { $sum: '$profit' },
          count: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
        },
      },
    ]);

    const stats = agg[0] || {
      totalRevenue: 0, totalCommission: 0, totalForLuliz: 0, totalProfit: 0, count: 0, totalQuantity: 0,
    };

    result.push({ center, ...stats, currentBalance: center.currentBalance });
  }

  res.json({ success: true, centers: result });
};

exports.getWaste = async (req, res) => {
  const data = await reportService.getWasteReport(req.query.startDate, req.query.endDate);
  res.json({ success: true, ...data });
};

exports.getProfitLoss = async (req, res) => {
  const Sale = require('../models/Sale');
  const Purchase = require('../models/Purchase');
  const WasteRecord = require('../models/WasteRecord');
  const CashTransaction = require('../models/CashTransaction');
  const InternalOrder = require('../models/InternalOrder');
  const CustomerOrder = require('../models/CustomerOrder');

  const match = { status: { $ne: 'reversed' } };
  if (req.query.startDate || req.query.endDate) {
    const range = {};
    if (req.query.startDate) range.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const e = new Date(req.query.endDate);
      e.setHours(23, 59, 59, 999);
      range.$lte = e;
    }
    match.saleDate = range;
  }

  const [salesAgg, purchasesAgg, wasteAgg, expensesAgg, posAgg, onlineAgg] = await Promise.all([
    Sale.aggregate([
      { $match: match },
      { $group: { _id: null, revenue: { $sum: '$netAmount' }, cost: { $sum: '$totalCost' }, profit: { $sum: '$profit' }, commissions: { $sum: '$commissionAmount' }, discounts: { $sum: '$discountAmount' } } },
    ]),
    Purchase.aggregate([
      { $match: { ...(match.saleDate ? { purchaseDate: match.saleDate } : {}), reversedAt: null } },
      { $group: { _id: null, total: { $sum: '$totalPurchaseCost' } } },
    ]),
    WasteRecord.aggregate([
      { $match: { ...(match.saleDate ? { wasteDate: match.saleDate } : {}), reversedAt: null } },
      { $group: { _id: null, total: { $sum: '$totalLossCost' } } },
    ]),
    CashTransaction.aggregate([
      {
        $match: {
          ...(match.saleDate ? { transactionDate: match.saleDate } : {}),
          direction: 'out',
          type: { $in: ['manual_expense', 'adjustment'] },
          // A cancelled POS order writes an `adjustment/out` reversal. Its
          // revenue is already excluded from the revenue side, so counting
          // the reversal as an expense too would penalise it twice.
          referenceType: { $ne: 'InternalOrder' },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    // Counter sales live outside the Sale collection — fold them in.
    InternalOrder.aggregate([
      {
        $match: {
          status: { $ne: 'cancelled' },
          ...(match.saleDate ? { createdAt: match.saleDate } : {}),
        },
      },
      { $group: { _id: null, revenue: { $sum: '$total' }, cost: { $sum: '$totalCost' }, profit: { $sum: '$profit' }, discounts: { $sum: '$discount' } } },
    ]),
    CustomerOrder.aggregate([
      { $match: { status: 'delivered', ...(match.saleDate ? { createdAt: match.saleDate } : {}) } },
      { $group: { _id: null, revenue: { $sum: '$totalPrice' }, cost: { $sum: '$totalCost' }, profit: { $sum: '$profit' }, discounts: { $sum: '$discountAmount' } } },
    ]),
  ]);

  const sBase = salesAgg[0] || { revenue: 0, cost: 0, profit: 0, commissions: 0, discounts: 0 };
  const p     = posAgg[0]   || { revenue: 0, cost: 0, profit: 0, discounts: 0 };
  const online = onlineAgg[0] || { revenue: 0, cost: 0, profit: 0, discounts: 0 };

  const s = {
    revenue:     sBase.revenue + p.revenue + online.revenue,
    cost:        sBase.cost + p.cost + online.cost,
    profit:      sBase.profit + p.profit + online.profit,
    commissions: sBase.commissions,
    discounts:   sBase.discounts + p.discounts + online.discounts,
  };

  const purchases = purchasesAgg[0]?.total || 0;
  const waste = wasteAgg[0]?.total || 0;
  const expenses = expensesAgg[0]?.total || 0;

  res.json({
    success: true,
    report: {
      revenue: s.revenue,
      productCost: s.cost,
      discounts: s.discounts,
      commissions: s.commissions,
      purchases,
      waste,
      expenses,
      grossProfit: s.profit,
      netProfit: s.revenue - s.cost - waste - expenses,
    },
  });
};
