'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  employeeName: { type: String, required: true, trim: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  fullDays: { type: Number, default: 0 },
  halfDays: { type: Number, default: 0 },
  absentDays: { type: Number, default: 0 },
  equivalentDays: { type: Number, default: 0 },
  dailyWage: { type: Number, default: 0 },
  basePay: { type: Number, default: 0 },
  bonuses: { type: Number, default: 0 },
  deductions: { type: Number, default: 0 },
  advances: { type: Number, default: 0 },
  finalPay: { type: Number, default: 0 },
  paidAt: { type: Date, default: Date.now },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  paidByName: { type: String, trim: true, default: '' },
  entryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DailyWageEntry' }],
}, { timestamps: true });

schema.index({ employeeId: 1, paidAt: -1 });

module.exports = mongoose.model('DailyWageSettlement', schema);
