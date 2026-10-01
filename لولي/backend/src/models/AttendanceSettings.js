'use strict';

const mongoose = require('mongoose');

const attendanceSettingsSchema = new mongoose.Schema(
  {
    /* ── Device connection ── */
    deviceIp:      { type: String, default: '192.168.1.201', trim: true },
    devicePort:    { type: Number, default: 4370 },
    deviceTimeout: { type: Number, default: 10000 },   // ms
    deviceName:    { type: String, default: '', trim: true },
    deviceSerial:  { type: String, default: '', trim: true },
    deviceVersion: { type: String, default: '', trim: true },
    lastSyncAt:    { type: Date },
    lastSyncCount: { type: Number, default: 0 },

    /* ── Shift rules ── */
    workStartTime: { type: String, default: '08:00' },  // HH:mm
    workEndTime:   { type: String, default: '17:00' },  // HH:mm
    graceMinutes:  { type: Number, default: 15, min: 0 },

    /* ── Auto sync ── */
    autoSyncEnabled:  { type: Boolean, default: true },
    autoSyncSeconds:  { type: Number, default: 60, min: 5, max: 3600 },
  },
  { timestamps: true }
);

/* Singleton — one config document for the whole restaurant. */
attendanceSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model('AttendanceSettings', attendanceSettingsSchema);
