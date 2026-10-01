'use strict';

const dayjs = require('dayjs');
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const WasteRecord = require('../models/WasteRecord');
const CashTransaction = require('../models/CashTransaction');
const ProductionBatch = require('../models/ProductionBatch');
const Offer = require('../models/Offer');
const SalesCenter = require('../models/SalesCenter');
const Product = require('../models/Product');
const CenterDelivery = require('../models/CenterDelivery');
const CenterSale = require('../models/CenterSale');
const Employee = require('../models/Employee');
const SalaryRecord = require('../models/SalaryRecord');
const InternalOrder = require('../models/InternalOrder');
const cashService = require('./cashService');

/**
 * Counter-sale totals for a period.
 *
 * Internal (POS) orders live in their own collection rather than `Sale`, so
 * every revenue figure has to fold them in explicitly or the shop's own till
 * goes missing from its own reports. Cancelled orders are excluded — they
 * never really happened.
 */
async function internalOrderTotals(start, end) {
  const match = { status: { $ne: 'cancelled' } };
  if (start || end) {
    match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lte = end;
  }

  const [row] = await InternalOrder.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        revenue:   { $sum: '$total' },
        cost:      { $sum: '$totalCost' },
        profit:    { $sum: '$profit' },
        discounts: { $sum: '$discount' },
        count:     { $sum: 1 },
        unpaid:    { $sum: { $cond: [{ $eq: ['$paymentMethod', 'unpaid'] }, '$total', 0] } },
      },
    },
  ]);

  return row || { revenue: 0, cost: 0, profit: 0, discounts: 0, count: 0, unpaid: 0 };
}

function getDayRange(date) {
  const d = dayjs(date);
  const start = d.startOf('day').toDate();
  const end = d.endOf('day').toDate();
  return { start, end };
}

function getMonthRange(year, month) {
  const d = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const start = d.startOf('month').toDate();
  const end = d.endOf('month').toDate();
  return { start, end };
}

const reportService = {
  /**
   * Per-center breakdown: employees, payroll cost, expenses, sales, net
   */
  async getCentersBreakdown() {
    const centers = await SalesCenter.find({ isActive: true }).select('name currentBalance totalSoldValue');

    const breakdown = await Promise.all(centers.map(async (center) => {
      const [employeesCount, payrollAgg, expensesAgg] = await Promise.all([
        Employee.countDocuments({ centerId: center._id, isActive: true }),
        SalaryRecord.aggregate([
          { $match: { centerId: center._id } },
          { $group: { _id: null, total: { $sum: '$finalSalary' } } },
        ]),
        CashTransaction.aggregate([
          { $match: { centerId: center._id, direction: 'out', referenceType: { $ne: 'SalaryRecord' } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);

      const payrollCost = payrollAgg[0] ? payrollAgg[0].total : 0;
      const expenses = expensesAgg[0] ? expensesAgg[0].total : 0;
      const sales = center.totalSoldValue || 0;

      return {
        centerId: center._id,
        name: center.name,
        employeesCount,
        payrollCost,
        expenses,
        sales,
        net: sales - expenses - payrollCost,
      };
    }));

    return breakdown;
  },

  /**
   * Dashboard data for today
   */
  async getDashboardData(date = new Date()) {
    const { start, end } = getDayRange(date);

    const [salesData, purchasesTotal, wasteData, cashBalance, activeOffersCount,
      centerBalances, centersBreakdown, pos, cashByCenter] =
      await Promise.all([
        Sale.aggregate([
          { $match: { saleDate: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$netAmount' },
              totalCost: { $sum: '$totalCost' },
              totalProfit: { $sum: '$profit' },
              totalCommissions: { $sum: '$commissionAmount' },
              count: { $sum: 1 },
            },
          },
        ]),
        Purchase.aggregate([
          { $match: { purchaseDate: { $gte: start, $lte: end } } },
          { $group: { _id: null, total: { $sum: '$totalPurchaseCost' } } },
        ]),
        WasteRecord.aggregate([
          { $match: { wasteDate: { $gte: start, $lte: end } } },
          { $group: { _id: null, total: { $sum: '$totalLossCost' } } },
        ]),
        cashService.getCurrentBalance(),
        Offer.countDocuments({
          isActive: true,
          startDate: { $lte: new Date() },
          endDate: { $gte: new Date() },
        }),
        SalesCenter.find({ isActive: true }).select('name currentBalance totalDeliveredValue totalCollected type'),
        reportService.getCentersBreakdown(),
        internalOrderTotals(start, end),
        cashService.getBalancesByCenter(),
      ]);

    const sales = salesData[0] || { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalCommissions: 0, count: 0 };

    const nameById = new Map(centerBalances.map(c => [String(c._id), c.name]));

    return {
      today: dayjs(date).format('YYYY-MM-DD'),
      // Headline figures cover every channel — recorded sales plus the till.
      sales: {
        totalRevenue: sales.totalRevenue + pos.revenue,
        totalCost: sales.totalCost + pos.cost,
        totalProfit: sales.totalProfit + pos.profit,
        totalCommissions: sales.totalCommissions,
        count: sales.count + pos.count,
      },
      // …and the split, so it's clear where the money came from.
      salesBySource: {
        recorded: { revenue: sales.totalRevenue, profit: sales.totalProfit, count: sales.count },
        internal: { revenue: pos.revenue, profit: pos.profit, count: pos.count, unpaid: pos.unpaid },
      },
      purchases: {
        total: purchasesTotal[0] ? purchasesTotal[0].total : 0,
      },
      waste: {
        totalCost: wasteData[0] ? wasteData[0].total : 0,
      },
      cashBalance,
      /* Where the cash actually sits. The single `cashBalance` above adds up
         every till in the business, which tells an owner with branches very
         little on its own. */
      cashByCenter: {
        total: cashByCenter.total,
        breakdown: cashByCenter.centers.map(c => ({
          ...c,
          name: c.centerId ? (nameById.get(String(c.centerId)) || 'فرع محذوف') : 'المركز الرئيسي',
        })),
      },
      activeOffersCount,
      centers: centerBalances,
      centersBreakdown,
    };
  },

  /**
   * Full daily report breakdown
   */
  async getDailyReport(date = new Date()) {
    const { start, end } = getDayRange(date);

    const [sales, purchases, waste, productionBatches, cashTransactions] = await Promise.all([
      Sale.find({ saleDate: { $gte: start, $lte: end } }).sort({ saleDate: 1 }),
      Purchase.find({ purchaseDate: { $gte: start, $lte: end } }),
      WasteRecord.find({ wasteDate: { $gte: start, $lte: end } }),
      ProductionBatch.find({ productionDate: { $gte: start, $lte: end } }),
      CashTransaction.find({ transactionDate: { $gte: start, $lte: end } }).sort({ transactionDate: 1 }),
    ]);

    // Group sales by product
    const productMap = {};
    for (const sale of sales) {
      const key = sale.productId.toString();
      if (!productMap[key]) {
        productMap[key] = {
          productId: sale.productId,
          name: sale.productNameSnapshot,
          totalQuantity: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          byChannel: {},
        };
      }
      productMap[key].totalQuantity += sale.quantity;
      productMap[key].totalRevenue += sale.netAmount;
      productMap[key].totalCost += sale.totalCost;
      productMap[key].totalProfit += sale.profit;

      const channel = sale.salesChannel;
      if (!productMap[key].byChannel[channel]) {
        productMap[key].byChannel[channel] = { quantity: 0, revenue: 0 };
      }
      productMap[key].byChannel[channel].quantity += sale.quantity;
      productMap[key].byChannel[channel].revenue += sale.netAmount;
    }

    // Totals
    const totalRevenue = sales.reduce((s, x) => s + x.netAmount, 0);
    const totalCost = sales.reduce((s, x) => s + x.totalCost, 0);
    const totalProfit = sales.reduce((s, x) => s + x.profit, 0);
    const totalPurchases = purchases.reduce((s, x) => s + x.totalPurchaseCost, 0);
    const totalWasteCost = waste.reduce((s, x) => s + x.totalLossCost, 0);
    const totalCommissions = sales.reduce((s, x) => s + x.commissionAmount, 0);
    const cashBalance = await cashService.getCurrentBalance();

    return {
      date: dayjs(date).format('YYYY-MM-DD'),
      summary: {
        totalRevenue,
        totalCost,
        totalProfit,
        totalPurchases,
        totalWasteCost,
        totalCommissions,
        netProfit: totalRevenue - totalCost - totalPurchases - totalWasteCost,
        cashBalance,
      },
      productBreakdown: Object.values(productMap),
      sales,
      purchases,
      waste,
      productionBatches,
      cashTransactions,
    };
  },

  /**
   * Monthly aggregations
   */
  async getMonthlyReport(year, month) {
    const { start, end } = getMonthRange(year, month);

    const [salesAgg, purchasesAgg, wasteAgg, dailySalesAgg] = await Promise.all([
      Sale.aggregate([
        { $match: { saleDate: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$netAmount' },
            totalCost: { $sum: '$totalCost' },
            totalProfit: { $sum: '$profit' },
            totalCommissions: { $sum: '$commissionAmount' },
            count: { $sum: 1 },
          },
        },
      ]),
      Purchase.aggregate([
        { $match: { purchaseDate: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$totalPurchaseCost' } } },
      ]),
      WasteRecord.aggregate([
        { $match: { wasteDate: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$totalLossCost' } } },
      ]),
      Sale.aggregate([
        { $match: { saleDate: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$saleDate' },
            },
            revenue: { $sum: '$netAmount' },
            profit: { $sum: '$profit' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const sales = salesAgg[0] || { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalCommissions: 0, count: 0 };

    return {
      year,
      month,
      period: { start: dayjs(start).format('YYYY-MM-DD'), end: dayjs(end).format('YYYY-MM-DD') },
      summary: {
        totalRevenue: sales.totalRevenue,
        totalCost: sales.totalCost,
        totalProfit: sales.totalProfit,
        totalCommissions: sales.totalCommissions,
        salesCount: sales.count,
        totalPurchases: purchasesAgg[0] ? purchasesAgg[0].total : 0,
        totalWasteCost: wasteAgg[0] ? wasteAgg[0].total : 0,
        netProfit:
          sales.totalRevenue -
          sales.totalCost -
          (purchasesAgg[0] ? purchasesAgg[0].total : 0) -
          (wasteAgg[0] ? wasteAgg[0].total : 0),
      },
      dailyBreakdown: dailySalesAgg,
    };
  },

  /**
   * Per-product sales report for a date range
   */
  async getProductsReport(startDate, endDate) {
    const match = {};
    if (startDate || endDate) {
      match.saleDate = {};
      if (startDate) match.saleDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.saleDate.$lte = end;
      }
    }

    const result = await Sale.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$productId',
          name: { $first: '$productNameSnapshot' },
          totalQuantity: { $sum: '$quantity' },
          totalRevenue: { $sum: '$netAmount' },
          totalCost: { $sum: '$totalCost' },
          totalProfit: { $sum: '$profit' },
          totalCommissions: { $sum: '$commissionAmount' },
          salesCount: { $sum: 1 },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    return result.map((r) => ({
      productId: r._id,
      name: r.name,
      totalQuantity: r.totalQuantity,
      totalRevenue: r.totalRevenue,
      totalCost: r.totalCost,
      totalProfit: r.totalProfit,
      totalCommissions: r.totalCommissions,
      salesCount: r.salesCount,
      profitMargin: r.totalRevenue > 0 ? ((r.totalProfit / r.totalRevenue) * 100).toFixed(1) : '0.0',
    }));
  },

  /**
   * Waste report for a date range
   */
  async getWasteReport(startDate, endDate) {
    const match = {};
    if (startDate || endDate) {
      match.wasteDate = {};
      if (startDate) match.wasteDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.wasteDate.$lte = end;
      }
    }

    const [byItem, byReason, totalAgg] = await Promise.all([
      WasteRecord.aggregate([
        { $match: match },
        {
          $group: {
            _id: { type: '$type', id: { $ifNull: ['$productId', '$ingredientId'] } },
            name: { $first: '$nameSnapshot' },
            type: { $first: '$type' },
            totalQuantity: { $sum: '$quantity' },
            totalLossCost: { $sum: '$totalLossCost' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalLossCost: -1 } },
      ]),
      WasteRecord.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$reason',
            totalLossCost: { $sum: '$totalLossCost' },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalLossCost: -1 } },
      ]),
      WasteRecord.aggregate([
        { $match: match },
        { $group: { _id: null, totalLossCost: { $sum: '$totalLossCost' }, count: { $sum: 1 } } },
      ]),
    ]);

    return {
      byItem,
      byReason,
      total: totalAgg[0] || { totalLossCost: 0, count: 0 },
    };
  },
};

module.exports = reportService;
