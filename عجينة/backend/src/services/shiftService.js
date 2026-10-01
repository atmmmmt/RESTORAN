'use strict';

const mongoose = require('mongoose');
const CashierShift = require('../models/CashierShift');
const InternalOrder = require('../models/InternalOrder');
const ReturnRecord = require('../models/ReturnRecord');
const InvestorSettings = require('../models/InvestorSettings');
const businessDay = require('./businessDay');

const toCenterId = centerId => (centerId && mongoose.isValidObjectId(centerId) ? String(centerId) : null);

/** The partner's rate on one order: the rate it was sold at, else today's. */
const rateOf = (order, settings) => {
  if (settings.enabled === false) return 0;
  if (order?.investorPercent !== undefined && order?.investorPercent !== null) return Number(order.investorPercent);
  return settings.percentFor(order?.orderType);
};
const cut = (amount, pct) => Math.round((Number(amount) || 0) * (Number(pct) || 0) / 100);

async function getOpen(centerId) {
  return CashierShift.findOne({ centerId: toCenterId(centerId), status: 'open' });
}

async function nextNumber(centerId) {
  const last = await CashierShift.findOne({ centerId: toCenterId(centerId) }).sort({ number: -1 }).select('number');
  return (last?.number || 0) + 1;
}

/**
 * Open a shift for this branch. Refuses when one is already running — two
 * drawers on one till is exactly the muddle shifts exist to prevent.
 */
async function open(centerId, user, openingCash = 0) {
  const existing = await getOpen(centerId);
  if (existing) {
    const err = new Error('يوجد وردية مفتوحة بالفعل — أغلقها أولاً');
    err.statusCode = 409;
    throw err;
  }
  const { day } = await businessDay.current();
  try {
    return await CashierShift.create({
      centerId: toCenterId(centerId),
      number: await nextNumber(centerId),
      businessDay: day,
      openedBy: user?._id,
      openedByName: user?.name || '',
      openingCash: Math.max(Number(openingCash) || 0, 0),
    });
  } catch (err) {
    // Two tills opening at the same instant: the index lets one through.
    if (err.code === 11000) {
      const clash = new Error('يوجد وردية مفتوحة بالفعل — أغلقها أولاً');
      clash.statusCode = 409;
      throw clash;
    }
    throw err;
  }
}

/**
 * The shift the next sale belongs to. A sale is never refused for want of a
 * shift: if the cashier forgot to open one, it opens itself with an empty
 * drawer and the count at close sorts out the rest.
 */
async function ensureOpen(centerId, user) {
  const current = await getOpen(centerId);
  if (current) return current;
  try {
    return await open(centerId, user, 0);
  } catch (err) {
    if (err.statusCode === 409) return getOpen(centerId);
    throw err;
  }
}

/** Live figures for a shift, worked out from its own orders and the refunds
    paid out of the drawer while it was open. */
async function summarize(shift) {
  const [orders, settings] = await Promise.all([
    InternalOrder.find({ shiftId: shift._id }),
    InvestorSettings.getSingleton(),
  ]);

  const until = shift.closedAt || new Date();
  const returnFilter = { createdAt: { $gte: shift.openedAt, $lte: until } };
  returnFilter.centerId = shift.centerId || null;
  const returns = await ReturnRecord.find(returnFilter);

  const active = orders.filter(o => o.status !== 'cancelled');
  const sum = (list, pick) => list.reduce((s, x) => s + (Number(pick(x)) || 0), 0);

  const byTypeMap = new Map();
  for (const o of active) {
    const line = byTypeMap.get(o.orderType) || { orderType: o.orderType, count: 0, total: 0 };
    line.count += 1;
    line.total += o.total || 0;
    byTypeMap.set(o.orderType, line);
  }

  /* Refunds come off the partner's cut at the rate their order was sold at. */
  const refundOrderIds = [...new Set(returns.map(r => String(r.orderId)))];
  const refundOrders = refundOrderIds.length
    ? await InternalOrder.find({ _id: { $in: refundOrderIds } }).select('orderType investorPercent')
    : [];
  const refundRate = new Map(refundOrders.map(o => [String(o._id), rateOf(o, settings)]));

  const sales = sum(active, o => o.total);
  const cashSales = sum(active.filter(o => o.paymentMethod === 'cash'), o => o.total);
  const cashRefunds = sum(returns.filter(r => r.refundMethod === 'cash'), r => r.refundAmount);
  const cardRefunds = sum(returns.filter(r => r.refundMethod === 'card'), r => r.refundAmount);
  const refunded = sum(returns, r => r.refundAmount);

  const investorShare = sum(active, o => cut(o.total, rateOf(o, settings)))
    - sum(returns, r => cut(r.refundAmount, refundRate.get(String(r.orderId)) || 0));

  return {
    summary: {
      ordersCount: active.length,
      cancelledCount: orders.length - active.length,
      subtotal: sum(active, o => o.subtotal),
      discounts: sum(active, o => o.discount),
      sales,
      cashSales,
      cardSales: sum(active.filter(o => o.paymentMethod === 'card'), o => o.total),
      unpaidSales: sum(active.filter(o => o.paymentMethod === 'unpaid'), o => o.total),
      returnCount: returns.length,
      cashRefunds,
      cardRefunds,
      netSales: sales - refunded,
      investorShare,
      byType: [...byTypeMap.values()],
    },
    expectedCash: (shift.openingCash || 0) + cashSales - cashRefunds,
    investor: settings.present(),
  };
}

/** Count the drawer, freeze the figures, and leave the till at zero. */
async function close(centerId, user, { countedCash, notes = '' } = {}) {
  const shift = await getOpen(centerId);
  if (!shift) {
    const err = new Error('لا توجد وردية مفتوحة');
    err.statusCode = 404;
    throw err;
  }
  const counted = Number(countedCash);
  if (!Number.isFinite(counted) || counted < 0) {
    const err = new Error('أدخل المبلغ الموجود في الدرج');
    err.statusCode = 400;
    throw err;
  }

  shift.closedAt = new Date();
  const { summary, expectedCash } = await summarize(shift);
  shift.summary = summary;
  shift.expectedCash = expectedCash;
  shift.countedCash = counted;
  shift.difference = counted - expectedCash;
  shift.notes = String(notes || '').trim();
  shift.closedBy = user?._id;
  shift.closedByName = user?.name || '';
  shift.status = 'closed';
  await shift.save();
  return shift;
}

module.exports = { getOpen, open, ensureOpen, summarize, close, rateOf, cut, toCenterId };
