'use strict';

const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  employeeName: { type: String, required: true, trim: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, enum: ['present','half','absent'], default: 'present' },
  dayUnits: { type: Number, enum: [0,0.5,1], default: 1 },
  dailyWageSnapshot: { type: Number, default: 0, min: 0 },
  bonus: { type: Number, default: 0, min: 0 },
  deduction: { type: Number, default: 0, min: 0 },
  note: { type: String, trim: true, default: '' },
  settlementId: { type: mongoose.Schema.Types.ObjectId, ref: 'DailyWageSettlement', default: null, index: true },
}, { timestamps: true });

schema.index({ employeeId: 1, date: 1 }, { unique: true });
schema.index({ date: 1, settlementId: 1 });

module.exports = mongoose.model('DailyWageEntry', schema);
