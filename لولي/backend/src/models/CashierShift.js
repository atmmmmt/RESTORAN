'use strict';

const mongoose = require('mongoose');

const typeLineSchema = new mongoose.Schema({
  orderType: { type: String },
  count: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
}, { _id: false });

const schema = new mongoose.Schema({
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null },
  number: { type: Number, required: true },
  status: { type: String, enum: ['open','closed'], default: 'open', index: true },
  businessDay: { type: String, default: '' },
  openedAt: { type: Date, default: Date.now },
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  openedByName: { type: String, trim: true, default: '' },
  openingCash: { type: Number, default: 0, min: 0 },
  closedAt: { type: Date, default: null },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedByName: { type: String, trim: true, default: '' },
  countedCash: { type: Number, default: null },
  expectedCash: { type: Number, default: 0 },
  difference: { type: Number, default: 0 },
  /* Physical drawer handover. This is operational till state, not a P&L
     expense: the money may simply be handed to management/safe. */
  nextOpeningCash: { type: Number, default: 0, min: 0 },
  handedOverCash: { type: Number, default: 0, min: 0 },
  notes: { type: String, trim: true, default: '' },
  summary: {
    ordersCount: { type: Number, default: 0 },
    cancelledCount: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    cashSales: { type: Number, default: 0 },
    cardSales: { type: Number, default: 0 },
    unpaidSales: { type: Number, default: 0 },
    byType: { type: [typeLineSchema], default: [] },
  },
}, { timestamps: true });

schema.index({ centerId: 1 }, {
  unique: true,
  partialFilterExpression: { status: 'open' },
  name: 'one_open_shift_per_center',
});
schema.index({ centerId: 1, openedAt: -1 });

module.exports = mongoose.model('CashierShift', schema);
