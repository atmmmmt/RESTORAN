'use strict';

const mongoose = require('mongoose');
const cashService = require('../services/cashService');
const CashTransaction = require('../models/CashTransaction');
const SalesCenter = require('../models/SalesCenter');

/**
 * Read the branch scope off the query string.
 *
 *   ?center=all         → whole business (default; matches the old behaviour)
 *   ?center=hq          → head office only
 *   ?center=<objectId>  → one branch
 *
 * Returns `undefined` for an unrecognised value so a typo can never be
 * mistaken for "head office" and quietly hide a branch's money.
 */
function scopeFromQuery(req) {
  const raw = req.query.center;
  if (raw === undefined || raw === 'all') return 'all';
  if (raw === 'hq') return 'hq';
  if (mongoose.isValidObjectId(raw)) return raw;
  return 'all';
}

exports.getBalance = async (req, res) => {
  const scope = scopeFromQuery(req);
  const balance = await cashService.getCurrentBalance(scope);
  res.json({ success: true, balance, scope });
};

/** Balance per branch + head office, so the owner sees where cash actually sits. */
exports.getBalancesByCenter = async (req, res) => {
  const { centers, total } = await cashService.getBalancesByCenter();

  const ids = centers.map(c => c.centerId).filter(Boolean);
  const named = await SalesCenter.find({ _id: { $in: ids } }).select('name');
  const nameById = new Map(named.map(c => [String(c._id), c.name]));

  res.json({
    success: true,
    total,
    breakdown: centers.map(c => ({
      ...c,
      name: c.centerId ? (nameById.get(String(c.centerId)) || 'فرع محذوف') : 'المركز الرئيسي',
    })),
  });
};

exports.getTransactions = async (req, res) => {
  const result = await cashService.getTransactions({
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    type: req.query.type,
    direction: req.query.direction,
    page: req.query.page,
    limit: req.query.limit,
    scope: scopeFromQuery(req),
  });

  res.json({ success: true, ...result });
};

/** Manual entries may be attributed to a branch; default is head office. */
function centerIdFromBody(req) {
  const raw = req.body.centerId;
  return raw && mongoose.isValidObjectId(raw) ? raw : null;
}

exports.addManualIncome = async (req, res) => {
  const { amount, description } = req.body;
  if (!amount || !description) {
    return res.status(400).json({ success: false, message: 'المبلغ والوصف مطلوبان.' });
  }
  const tx = await cashService.createTransaction(
    'manual_income', Number(amount), 'in', description, null, null, centerIdFromBody(req)
  );
  res.status(201).json({ success: true, message: 'تم تسجيل الدخل.', transaction: tx });
};

exports.addManualExpense = async (req, res) => {
  const { amount, description } = req.body;
  if (!amount || !description) {
    return res.status(400).json({ success: false, message: 'المبلغ والوصف مطلوبان.' });
  }
  const tx = await cashService.createTransaction(
    'manual_expense', Number(amount), 'out', description, null, null, centerIdFromBody(req)
  );
  res.status(201).json({ success: true, message: 'تم تسجيل المصروف.', transaction: tx });
};

exports.addAdjustment = async (req, res) => {
  const { amount, direction, description } = req.body;
  if (!amount || !direction || !description) {
    return res.status(400).json({ success: false, message: 'المبلغ والاتجاه والوصف مطلوبة.' });
  }
  const tx = await cashService.createTransaction(
    'adjustment', Number(amount), direction, description, null, null, centerIdFromBody(req)
  );
  res.status(201).json({ success: true, message: 'تم تسجيل التعديل.', transaction: tx });
};

exports.getSummary = async (req, res) => {
  const scope = scopeFromQuery(req);
  const summary = await cashService.getSummary(req.query.startDate, req.query.endDate, scope);
  const balance = await cashService.getCurrentBalance(scope);
  res.json({ success: true, ...summary, currentBalance: balance, scope });
};
