'use strict';
const mongoose = require('mongoose');

const salaryRecordSchema = new mongoose.Schema({
  centerId:         { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null },
  employeeId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeName:     { type: String, required: true, trim: true },
  month:            { type: String, required: true }, // Format: "YYYY-MM"

  baseSalary:       { type: Number, required: true },   // الراتب الأساسي
  hourlyRate:       { type: Number, default: 0 },       // سعر الساعة

  lateHours:        { type: Number, default: 0 },       // ساعات التأخر
  lateDeduction:    { type: Number, default: 0 },       // قيمة الخصم
  otherDeductions:  { type: Number, default: 0 },       // خصومات أخرى
  advances:         { type: Number, default: 0 },       // سلف مخصومة
  bonuses:          { type: Number, default: 0 },       // مكافآت
  period:           { type: String, enum: ['monthly', 'weekly'], default: 'monthly' },

  finalSalary:      { type: Number, default: 0 },       // الراتب النهائي

  isPaid:           { type: Boolean, default: false },
  paidDate:         { type: Date },
  notes:            { type: String, trim: true, default: '' },

  lateLog: [{                                           // سجل تفاصيل التأخرات
    date:    { type: String },
    hours:   { type: Number },
    reason:  { type: String, trim: true },
  }],

  /* ── Pulled from the fingerprint terminal ─────────────────
     Written by POST /salary/:id/sync-attendance. Kept separate from the
     manual lateLog so a re-sync can overwrite these without destroying
     anything the manager entered by hand. */
  attendanceSynced:   { type: Boolean, default: false },
  attendanceSyncedAt: { type: Date },
  daysAttended:       { type: Number, default: 0 },
  hoursWorked:        { type: Number, default: 0 },
  expectedHours:      { type: Number, default: 0 },
  /** Pay computed straight from clocked hours × hourly rate. */
  hoursPay:           { type: Number, default: 0 },
  /** 'salary' = fixed monthly wage · 'hours' = pay by the clocked hour. */
  payBasis:           { type: String, enum: ['salary', 'hours'], default: 'salary' },
}, { timestamps: true });

// Unique per employee per month
salaryRecordSchema.index({ employeeId: 1, month: 1 }, { unique: true });
salaryRecordSchema.index({ month: 1 });
salaryRecordSchema.index({ isPaid: 1 });

module.exports = mongoose.model('SalaryRecord', salaryRecordSchema);
