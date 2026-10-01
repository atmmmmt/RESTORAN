'use strict';
const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  centerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null },
  name:          { type: String, required: [true, 'اسم الموظف مطلوب'], trim: true },
  hireDate:      { type: Date,   default: Date.now },
  monthlySalary: { type: Number, required: [true, 'الراتب الشهري مطلوب'], min: 0 },
  dailyHours:    { type: Number, default: 8, min: 1, max: 24 },   // ساعات الدوام اليومي
  workingDays:   { type: Number, default: 26 },                   // أيام العمل بالشهر
  payPeriod:     { type: String, enum: ['monthly', 'weekly'], default: 'monthly' }, // دورية الراتب
  role:          { type: String, trim: true, default: '' },
  department:    { type: String, trim: true, default: '' },
  phone:         { type: String, trim: true, default: '' },
  notes:         { type: String, trim: true, default: '' },
  isActive:      { type: Boolean, default: true },

  /* ── Manual hourly rate override ──────────────────────────
     When > 0 this wins over the salary-derived rate, letting the manager
     price an hour directly instead of through a monthly figure. */
  hourlyRateOverride: { type: Number, default: 0, min: 0 },

  /* ── Fingerprint device link ──────────────────────────────
     devicePin is the user id held on the ZKTeco unit. */
  devicePin:           { type: String, trim: true, default: '', index: true },
  fingerprintEnrolled: { type: Boolean, default: false },
  syncedToDevice:      { type: Boolean, default: false },
}, { timestamps: true });

// Hourly rate — manual override wins, otherwise derived from the salary.
employeeSchema.virtual('hourlyRate').get(function () {
  if (this.hourlyRateOverride > 0) return this.hourlyRateOverride;
  const days = this.payPeriod === 'weekly' ? 5 : (this.workingDays || 26);
  const hours = (this.dailyHours || 8) * days;
  return hours > 0 ? this.monthlySalary / hours : 0;
});

employeeSchema.set('toJSON', { virtuals: true });
module.exports = mongoose.model('Employee', employeeSchema);
