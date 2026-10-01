'use strict';
const mongoose = require('mongoose');

const advanceSchema = new mongoose.Schema({
  centerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null },
  employeeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeName: { type: String, required: true, trim: true },
  amount:       { type: Number, required: true, min: 1 },
  date:         { type: Date, default: Date.now },
  reason:       { type: String, trim: true, default: '' },

  isDeducted:       { type: Boolean, default: false },  // هل تم خصمها من الراتب؟
  deductedRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryRecord', default: null },
  deductedPeriod:   { type: String, default: '' },      // الفترة اللي اتخصمت منها
}, { timestamps: true });

advanceSchema.index({ employeeId: 1, isDeducted: 1 });
module.exports = mongoose.model('EmployeeAdvance', advanceSchema);
