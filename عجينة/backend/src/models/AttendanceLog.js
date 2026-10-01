'use strict';

const mongoose = require('mongoose');

/**
 * One raw punch pulled from a fingerprint unit (or entered by hand).
 *
 * Direction is NOT stored as truth from the device — most ZKTeco units in
 * this price range report every punch identically. We derive in/out by
 * alternating within the employee's day: 1st punch = in, 2nd = out, 3rd = in…
 * The derived value is cached here so the daily board doesn't recompute it,
 * and it is recalculated whenever that day's punches change.
 */
const attendanceLogSchema = new mongoose.Schema(
  {
    /* Which branch's terminal recorded this. Device PINs restart at 1 on
       every unit, so a punch is only identifiable as `centerId + pin`. */
    centerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null, index: true },

    employeeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
    employeeName: { type: String, trim: true, default: '' },

    devicePin:    { type: String, trim: true, index: true },   // user id on the device
    timestamp:    { type: Date, required: true, index: true },
    date:         { type: String, required: true, index: true }, // 'YYYY-MM-DD' local

    direction:    { type: String, enum: ['in', 'out'], default: 'in' },
    source:       { type: String, enum: ['device', 'manual'], default: 'device' },
    notes:        { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

/* Dedup guard — an agent re-sending its backlog must not double-insert.
   A person physically cannot punch the same second twice on the same unit.
   centerId is part of the key because PIN 1 at one branch and PIN 1 at
   another are different people who may well clock in at the same instant. */
attendanceLogSchema.index({ centerId: 1, devicePin: 1, timestamp: 1 }, { unique: true });
attendanceLogSchema.index({ date: 1, employeeId: 1 });

module.exports = mongoose.model('AttendanceLog', attendanceLogSchema);
