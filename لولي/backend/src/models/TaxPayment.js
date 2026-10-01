'use strict';

const mongoose = require('mongoose');

const taxPaymentSchema = new mongoose.Schema({
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null, index: true },
  type: { type: String, enum: ['invoice_tax', 'profit_tax'], required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  paidAt: { type: Date, default: Date.now, index: true },
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  reference: { type: String, trim: true, default: '' },
  notes: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdByName: { type: String, trim: true, default: '' },
}, { timestamps: true });

taxPaymentSchema.index({ centerId: 1, type: 1, paidAt: -1 });

module.exports = mongoose.model('TaxPayment', taxPaymentSchema);
