'use strict';

const mongoose = require('mongoose');

/**
 * When the shop opens and closes. A night that runs past midnight is still
 * one working day: with 10:00 → 04:00, an order at 02:30 belongs to the day
 * that opened the previous morning, not to a new one. Every "today" in the
 * till — order numbers, the day's log, the end-of-day report — is cut on
 * these hours rather than on the calendar's midnight.
 */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const businessSettingsSchema = new mongoose.Schema(
  {
    openingTime: { type: String, default: '10:00', match: [TIME, 'صيغة الوقت HH:MM'] },
    closingTime: { type: String, default: '04:00', match: [TIME, 'صيغة الوقت HH:MM'] },
  },
  { timestamps: true }
);

businessSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model('BusinessSettings', businessSettingsSchema);
module.exports.TIME = TIME;
