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
const CustomerOrder = require('../models/CustomerOrder');
const cashService = require('./cashService');
const businessDay = require('./businessDay');

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

async function internalProductTotals(start, end) {
  const match = { status: { $ne: 'cancelled' } };
  if (start || end) {
    match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lte = end;
  }
  return InternalOrder.aggregate([
    { $match: match }, { $unwind: '$items' },
    { $group: {
      _id: '$items.productId', name: { $first: '$items.name' },
      totalQuantity: { $sum: '$items.quantity' },
      totalRevenue: { $sum: '$items.lineTotal' },
      totalCost: { $sum: { $multiply: ['$items.unitCost', '$items.quantity'] } },
      salesCount: { $sum: 1 },
    } },
  ]);
}

async function customerOrderTotals(start, end) {
  const match = { status: 'delivered' };
  if (start || end) {
    match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lte = end;
  }
  const [row] = await CustomerOrder.aggregate([
    { $match: match },
    { $group: {
      _id: null, revenue: { $sum: '$totalPrice' }, cost: { $sum: '$totalCost' },
      profit: { $sum: '$profit' }, discounts: { $sum: '$discountAmount' }, count: { $sum: 1 },
    } },
  ]);
  return row || { revenue: 0, cost: 0, profit: 0, discounts: 0, count: 0 };
}

async function customerProductTotals(start, end) {
  const match = { status: 'delivered' };
  if (start || end) {
    match.createdAt = {};
    if (start) match.createdAt.$gte = start;
    if (end) match.createdAt.$lte = end;
  }
  return CustomerOrder.aggregate([
    { $match: match },
    { $group: {
      _id: '$productId', name: { $first: '$productNameSnapshot' }, totalQuantity: { $sum: '$quantity' },
      totalRevenue: { $sum: '$totalPrice' }, totalCost: { $sum: '$totalCost' },
      totalProfit: { $sum: '$profit' }, salesCount: { $sum: 1 },
    } },
  ]);
}

/* A working day on the shop's opening hours, so a night that runs past
   midnight lands in one day's report. Takes 'YYYY-MM-DD', a Date, or nothing
   for the day running now. Callers use inclusive `$lte`, hence the −1ms. */
async function getDayRange(date) {
  const { day, start, end } = await businessDay.range(date);
  return { day, start, end: new Date(end.getTime() - 1) };
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
  async getDashboardData(date) {
    const { day, start, end } = await getDayRange(date);

    const [salesData, purchasesTotal, wasteData, cashBalance, activeOffersCount,
      centerBalances, centersBreakdown, pos, online, cashByCenter] =
      await Promise.all([
        Sale.aggregate([
          { $match: { saleDate: { $gte: start, $lte: end }, status: { $ne: 'reversed' } } },
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
          { $match: { purchaseDate: { $gte: start, $lte: end }, reversedAt: null } },
          { $group: { _id: null, total: { $sum: '$totalPurchaseCost' } } },
        ]),
        WasteRecord.aggregate([
          { $match: { wasteDate: { $gte: start, $lte: end }, reversedAt: null } },
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
        customerOrderTotals(start, end),
        cashService.getBalancesByCenter(),
      ]);

    const sales = salesData[0] || { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalCommissions: 0, count: 0 };

    const nameById = new Map(centerBalances.map(c => [String(c._id), c.name]));

    return {
      today: day,
      // Headline figures cover every channel — recorded sales plus the till.
      sales: {
        totalRevenue: sales.totalRevenue + pos.revenue + online.revenue,
        totalCost: sales.totalCost + pos.cost + online.cost,
        totalProfit: sales.totalProfit + pos.profit + online.profit,
        totalCommissions: sales.totalCommissions,
        count: sales.count + pos.count + online.count,
      },
      // …and the split, so it's clear where the money came from.
      salesBySource: {
        recorded: { revenue: sales.totalRevenue, profit: sales.totalProfit, count: sales.count },
        internal: { revenue: pos.revenue, profit: pos.profit, count: pos.count, unpaid: pos.unpaid },
        online: { revenue: online.revenue, profit: online.profit, count: online.count },
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
  async getDailyReport(date) {
    const { day, start, end } = await getDayRange(date);

    const [sales, purchases, waste, productionBatches, cashTransactions, posOrders, onlineOrders] = await Promise.all([
      Sale.find({ saleDate: { $gte: start, $lte: end }, status: { $ne: 'reversed' } }).sort({ saleDate: 1 }),
      Purchase.find({ purchaseDate: { $gte: start, $lte: end }, reversedAt: null }),
      WasteRecord.find({ wasteDate: { $gte: start, $lte: end }, reversedAt: null }),
      ProductionBatch.find({ productionDate: { $gte: start, $lte: end }, reversedAt: null }),
      CashTransaction.find({ transactionDate: { $gte: start, $lte: end } }).sort({ transactionDate: 1 }),
      InternalOrder.find({ createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } }).sort({ createdAt: 1 }),
      CustomerOrder.find({ createdAt: { $gte: start, $lte: end }, status: 'delivered' }).sort({ createdAt: 1 }),
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
    for (const order of posOrders) {
      for (const item of order.items) {
        const key = String(item.productId);
        if (!productMap[key]) productMap[key] = {
          productId: item.productId, name: item.name, totalQuantity: 0,
          totalRevenue: 0, totalCost: 0, totalProfit: 0, byChannel: {},
        };
        const lineCost = (item.unitCost || 0) * item.quantity;
        productMap[key].totalQuantity += item.quantity;
        productMap[key].totalRevenue += item.lineTotal;
        productMap[key].totalCost += lineCost;
        productMap[key].totalProfit += item.lineTotal - lineCost;
        const channel = order.centerId ? 'branch_pos' : 'internal_pos';
        if (!productMap[key].byChannel[channel]) productMap[key].byChannel[channel] = { quantity: 0, revenue: 0 };
        productMap[key].byChannel[channel].quantity += item.quantity;
        productMap[key].byChannel[channel].revenue += item.lineTotal;
      }
    }
    for (const order of onlineOrders) {
      const key = String(order.productId);
      if (!productMap[key]) productMap[key] = {
        productId: order.productId, name: order.productNameSnapshot, totalQuantity: 0,
        totalRevenue: 0, totalCost: 0, totalProfit: 0, byChannel: {},
      };
      productMap[key].totalQuantity += order.quantity;
      productMap[key].totalRevenue += order.totalPrice;
      productMap[key].totalCost += order.totalCost || 0;
      productMap[key].totalProfit += order.profit || 0;
      if (!productMap[key].byChannel.online) productMap[key].byChannel.online = { quantity: 0, revenue: 0 };
      productMap[key].byChannel.online.quantity += order.quantity;
      productMap[key].byChannel.online.revenue += order.totalPrice;
    }

    // Totals
    const posRevenue = posOrders.reduce((s, x) => s + x.total, 0);
    const posCost = posOrders.reduce((s, x) => s + (x.totalCost || 0), 0);
    const onlineRevenue = onlineOrders.reduce((s, x) => s + x.totalPrice, 0);
    const onlineCost = onlineOrders.reduce((s, x) => s + (x.totalCost || 0), 0);
    const totalRevenue = sales.reduce((s, x) => s + x.netAmount, 0) + posRevenue + onlineRevenue;
    const totalCost = sales.reduce((s, x) => s + x.totalCost, 0) + posCost + onlineCost;
    const totalProfit = sales.reduce((s, x) => s + x.profit, 0) + (posRevenue - posCost) + (onlineRevenue - onlineCost);
    const totalPurchases = purchases.reduce((s, x) => s + x.totalPurchaseCost, 0);
    const totalWasteCost = waste.reduce((s, x) => s + x.totalLossCost, 0);
    const totalCommissions = sales.reduce((s, x) => s + x.commissionAmount, 0);
    const cashBalance = await cashService.getCurrentBalance();

    return {
      date: day,
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
      internalOrders: posOrders,
      onlineOrders,
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

    const [salesAgg, purchasesAgg, wasteAgg, dailySalesAgg, posAgg, posDailyAgg, onlineAgg, onlineDailyAgg] = await Promise.all([
      Sale.aggregate([
        { $match: { saleDate: { $gte: start, $lte: end }, status: { $ne: 'reversed' } } },
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
        { $match: { purchaseDate: { $gte: start, $lte: end }, reversedAt: null } },
        { $group: { _id: null, total: { $sum: '$totalPurchaseCost' } } },
      ]),
      WasteRecord.aggregate([
        { $match: { wasteDate: { $gte: start, $lte: end }, reversedAt: null } },
        { $group: { _id: null, total: { $sum: '$totalLossCost' } } },
      ]),
      Sale.aggregate([
        { $match: { saleDate: { $gte: start, $lte: end }, status: { $ne: 'reversed' } } },
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
      InternalOrder.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: null, totalRevenue: { $sum: '$total' }, totalCost: { $sum: '$totalCost' }, totalProfit: { $sum: '$profit' }, count: { $sum: 1 } } },
      ]),
      InternalOrder.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$total' }, profit: { $sum: '$profit' }, count: { $sum: 1 } } },
      ]),
      CustomerOrder.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: 'delivered' } },
        { $group: { _id: null, totalRevenue: { $sum: '$totalPrice' }, totalCost: { $sum: '$totalCost' }, totalProfit: { $sum: '$profit' }, count: { $sum: 1 } } },
      ]),
      CustomerOrder.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: 'delivered' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$totalPrice' }, profit: { $sum: '$profit' }, count: { $sum: 1 } } },
      ]),
    ]);

    const sales = salesAgg[0] || { totalRevenue: 0, totalCost: 0, totalProfit: 0, totalCommissions: 0, count: 0 };
    const pos = posAgg[0] || { totalRevenue: 0, totalCost: 0, totalProfit: 0, count: 0 };
    const online = onlineAgg[0] || { totalRevenue: 0, totalCost: 0, totalProfit: 0, count: 0 };
    const daily = new Map();
    for (const row of [...dailySalesAgg, ...posDailyAgg, ...onlineDailyAgg]) {
      const current = daily.get(row._id) || { _id: row._id, revenue: 0, profit: 0, count: 0 };
      current.revenue += row.revenue || 0; current.profit += row.profit || 0; current.count += row.count || 0;
      daily.set(row._id, current);
    }

    return {
      year,
      month,
      period: { start: dayjs(start).format('YYYY-MM-DD'), end: dayjs(end).format('YYYY-MM-DD') },
      summary: {
        totalRevenue: sales.totalRevenue + pos.totalRevenue + online.totalRevenue,
        totalCost: sales.totalCost + pos.totalCost + online.totalCost,
        totalProfit: sales.totalProfit + pos.totalProfit + online.totalProfit,
        totalCommissions: sales.totalCommissions,
        salesCount: sales.count + pos.count + online.count,
        totalPurchases: purchasesAgg[0] ? purchasesAgg[0].total : 0,
        totalWasteCost: wasteAgg[0] ? wasteAgg[0].total : 0,
        netProfit:
          (sales.totalRevenue + pos.totalRevenue + online.totalRevenue) -
          (sales.totalCost + pos.totalCost + online.totalCost) -
          (purchasesAgg[0] ? purchasesAgg[0].total : 0) -
          (wasteAgg[0] ? wasteAgg[0].total : 0),
      },
      dailyBreakdown: [...daily.values()].sort((a, b) => a._id.localeCompare(b._id)),
    };
  },

  /**
   * Per-product sales report for a date range
   */
  async getProductsReport(startDate, endDate) {
    const match = { status: { $ne: 'reversed' } };
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

    const pos = await internalProductTotals(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : null
    );
    const online = await customerProductTotals(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : null
    );
    const merged = new Map();
    for (const row of [...result, ...pos, ...online]) {
      const key = String(row._id);
      const current = merged.get(key) || { ...row, totalQuantity: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, totalCommissions: 0, salesCount: 0 };
      current.totalQuantity += row.totalQuantity || 0;
      current.totalRevenue += row.totalRevenue || 0;
      current.totalCost += row.totalCost || 0;
      current.totalProfit += row.totalProfit ?? ((row.totalRevenue || 0) - (row.totalCost || 0));
      current.totalCommissions += row.totalCommissions || 0;
      current.salesCount += row.salesCount || 0;
      merged.set(key, current);
    }

    return [...merged.values()].sort((a, b) => b.totalRevenue - a.totalRevenue).map((r) => ({
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
        { $match: { ...match, reversedAt: null } },
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
        { $match: { ...match, reversedAt: null } },
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
        { $match: { ...match, reversedAt: null } },
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
