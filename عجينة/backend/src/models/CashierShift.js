'use strict';

const mongoose = require('mongoose');

/**
 * One cashier's stretch at the till, from opening the drawer to counting it.
 *
 * Every counter order is stamped with the shift that was open when it was rung
 * up. Closing the shift ("تصفير") freezes its figures into `summary`, compares
 * the cash that should be in the drawer with what was counted, and leaves the
 * till at zero for whoever comes next. Nothing is deleted: the orders stay in
 * the day's log and the shift stays on record.
 *
 * Only one shift per branch can be open at a time (see the partial index).
 */

const typeLineSchema = new mongoose.Schema({
  orderType: { type: String },
  count:     { type: Number, default: 0 },
  total:     { type: Number, default: 0 },
}, { _id: false });

const cashierShiftSchema = new mongoose.Schema(
  {
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null },
    number:   { type: Number, required: true },
    status:   { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    businessDay: { type: String, default: '' },     // working day it opened in

    openedAt:     { type: Date, default: Date.now },
    openedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    openedByName: { type: String, trim: true, default: '' },
    openingCash:  { type: Number, default: 0, min: 0 },

    closedAt:     { type: Date, default: null },
    closedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    closedByName: { type: String, trim: true, default: '' },
    countedCash:  { type: Number, default: null },
    expectedCash: { type: Number, default: 0 },
    difference:   { type: Number, default: 0 },          // counted − expected
    notes:        { type: String, trim: true, default: '' },

    /* Frozen on close. While the shift is open the same figures are worked
       out live from its orders. */
    summary: {
      ordersCount:    { type: Number, default: 0 },
      cancelledCount: { type: Number, default: 0 },
      subtotal:       { type: Number, default: 0 },
      discounts:      { type: Number, default: 0 },
      sales:          { type: Number, default: 0 },
      cashSales:      { type: Number, default: 0 },
      cardSales:      { type: Number, default: 0 },
      unpaidSales:    { type: Number, default: 0 },
      returnCount:    { type: Number, default: 0 },
      cashRefunds:    { type: Number, default: 0 },
      cardRefunds:    { type: Number, default: 0 },
      netSales:       { type: Number, default: 0 },
      investorShare:  { type: Number, default: 0 },
      byType:         { type: [typeLineSchema], default: [] },
    },
  },
  { timestamps: true }
);

cashierShiftSchema.index(
  { centerId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' }, name: 'one_open_shift_per_center' }
);
cashierShiftSchema.index({ centerId: 1, openedAt: -1 });

module.exports = mongoose.model('CashierShift', cashierShiftSchema);
