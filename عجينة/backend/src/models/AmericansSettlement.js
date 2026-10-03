'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  brand: { type: String, enum: ['ajeena','luliz'], required: true, index: true },
  centerId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  centerName: { type: String, trim: true, default: '' },
  type: { type: String, enum: ['investor_share','invoice_tax','profit_tax'], required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  paidAt: { type: Date, default: Date.now, index: true },
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  notes: { type: String, trim: true, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdByName: { type: String, trim: true, default: '' },
  sourceCashTransactionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sourceTaxPaymentId: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });

schema.index({ brand: 1, centerId: 1, paidAt: -1 });
schema.index({ brand: 1, centerId: 1, type: 1, periodStart: 1, periodEnd: 1 });

module.exports = mongoose.model('AmericansSettlement', schema);
