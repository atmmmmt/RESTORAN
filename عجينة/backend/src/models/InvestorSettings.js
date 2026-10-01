'use strict';

const mongoose = require('mongoose');

/**
 * Investor who takes a flat cut of every order's takings straight from the
 * till (not from net profit). Printed per order on the end-of-day report.
 * Kept out of SiteSettings on purpose: that document is served publicly.
 *
 * The cut depends on how the order left the shop: takeaway and dine-in each
 * have their own rate, and `percent` covers everything else (delivery and
 * website orders).
 */
const investorSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    name:    { type: String, trim: true, default: 'الأميركان' },
    takeawayPercent: { type: Number, min: 0, max: 100, default: 10 },
    dineInPercent:   { type: Number, min: 0, max: 100, default: 15 },
    percent: { type: Number, min: 0, max: 100, default: 15 },   // delivery + website
  },
  { timestamps: true }
);

/** The rate that applies to an order of this type, or 0 when switched off. */
investorSettingsSchema.methods.percentFor = function (orderType) {
  if (this.enabled === false) return 0;
  if (orderType === 'takeaway') return Number(this.takeawayPercent ?? 10);
  if (orderType === 'dine_in') return Number(this.dineInPercent ?? 15);
  return Number(this.percent ?? 15);
};

investorSettingsSchema.methods.present = function () {
  return {
    enabled: this.enabled !== false,
    name: this.name || 'الأميركان',
    takeawayPercent: Number(this.takeawayPercent ?? 10),
    dineInPercent: Number(this.dineInPercent ?? 15),
    percent: Number(this.percent ?? 15),
  };
};

investorSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model('InvestorSettings', investorSettingsSchema);
