'use strict';

const mongoose = require('mongoose');
const CashTransaction = require('../models/CashTransaction');

/**
 * Build the centerId part of a query.
 *
 * Three distinct scopes, and the difference matters for money:
 *   undefined / 'all' → every till in the business
 *   null / 'hq'       → head office only (transactions with no branch)
 *   <id>              → that branch only
 *
 * Head office is `centerId: null`, so an unscoped query silently mixes HQ
 * cash with every branch's cash — which is exactly the bug this replaces.
 */
function centerFilter(scope) {
  if (scope === undefined || scope === 'all') return {};
  if (scope === null || scope === 'hq' || scope === '') {
    return { $or: [{ centerId: null }, { centerId: { $exists: false } }] };
  }
  /* Cast explicitly. `find()` would coerce a string for us, but aggregation
     pipelines bypass schema casting entirely — a raw string silently matches
     nothing and every branch reads as a zero balance. */
  const id = mongoose.isValidObjectId(scope) ? new mongoose.Types.ObjectId(String(scope)) : scope;
  return { centerId: id };
}

const cashService = {
  centerFilter,

  /**
   * Current cash balance (IN − OUT).
   * @param {string|null|undefined} scope see centerFilter
   */
  async getCurrentBalance(scope) {
    const match = centerFilter(scope);

    const pipeline = [];
    if (Object.keys(match).length) pipeline.push({ $match: match });
    pipeline.push({ $group: { _id: '$direction', total: { $sum: '$amount' } } });

    const result = await CashTransaction.aggregate(pipeline);

    let balance = 0;
    result.forEach((r) => {
      if (r._id === 'in') balance += r.total;
      else balance -= r.total;
    });

    return balance;
  },

  /**
   * Balance for every branch plus head office, in one pass.
   * Used by the dashboard so the owner sees where the money actually sits
   * instead of one meaningless combined figure.
   */
  async getBalancesByCenter() {
    const rows = await CashTransaction.aggregate([
      {
        $group: {
          _id: { centerId: '$centerId', direction: '$direction' },
          total: { $sum: '$amount' },
        },
      },
    ]);

    const byCenter = new Map();
    for (const row of rows) {
      // Anything without a branch belongs to head office.
      const key = row._id.centerId ? String(row._id.centerId) : 'hq';
      const current = byCenter.get(key) || { centerId: row._id.centerId || null, in: 0, out: 0 };
      if (row._id.direction === 'in') current.in += row.total;
      else current.out += row.total;
      byCenter.set(key, current);
    }

    const list = [...byCenter.entries()].map(([key, v]) => ({
      key,
      centerId: v.centerId,
      income: v.in,
      expenses: v.out,
      balance: v.in - v.out,
    }));

    return {
      centers: list,
      total: list.reduce((s, c) => s + c.balance, 0),
    };
  },

  /**
   * Create a new cash transaction
   */
  async createTransaction(type, amount, direction, description, referenceType = null, referenceId = null, centerId = null) {
    const data = {
      type,
      amount,
      direction,
      description,
      transactionDate: new Date(),
    };

    if (referenceType) data.referenceType = referenceType;
    if (referenceId) data.referenceId = referenceId;
    if (centerId) data.centerId = centerId;

    return CashTransaction.create(data);
  },

  /**
   * Get summary (income, expenses, net) for a date range
   */
  async getSummary(startDate, endDate, scope) {
    const match = { ...centerFilter(scope) };
    if (startDate || endDate) {
      match.transactionDate = {};
      if (startDate) match.transactionDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.transactionDate.$lte = end;
      }
    }

    const result = await CashTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$direction',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    let income = 0;
    let expenses = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    result.forEach((r) => {
      if (r._id === 'in') {
        income = r.total;
        incomeCount = r.count;
      } else {
        expenses = r.total;
        expenseCount = r.count;
      }
    });

    return {
      income,
      expenses,
      net: income - expenses,
      incomeCount,
      expenseCount,
    };
  },

  /**
   * Get transactions with pagination and optional filters
   */
  async getTransactions({ startDate, endDate, type, direction, page = 1, limit = 20, scope }) {
    const match = { ...centerFilter(scope) };

    if (startDate || endDate) {
      match.transactionDate = {};
      if (startDate) match.transactionDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.transactionDate.$lte = end;
      }
    }

    if (type) match.type = type;
    if (direction) match.direction = direction;

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      CashTransaction.find(match)
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(Number(limit)),
      CashTransaction.countDocuments(match),
    ]);

    return {
      transactions,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    };
  },
};

module.exports = cashService;
