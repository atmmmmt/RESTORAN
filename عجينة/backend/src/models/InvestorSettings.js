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
    takeawayPercent: { type: Number, min: 0, max: 100, default: 15.5 },
    dineInPercent:   { type: Number, min: 0, max: 100, default: 20.5 },
    percent: { type: Number, min: 0, max: 100, default: 15.5 },   // delivery + website
  },
  { timestamps: true }
);

/** The rate that applies to an order of this type, or 0 when switched off. */
investorSettingsSchema.methods.percentFor = function (orderType) {
  if (this.enabled === false) return 0;
  if (orderType === 'takeaway') return Number(this.percent ?? 15.5);
  if (orderType === 'dine_in') return Number(this.dineInPercent ?? 20.5);
  return Number(this.percent ?? 15.5);
};

investorSettingsSchema.methods.present = function () {
  return {
    enabled: this.enabled !== false,
    name: this.name || 'الأميركان',
    takeawayPercent: Number(this.percent ?? 15.5),
    dineInPercent: Number(this.dineInPercent ?? 20.5),
    percent: Number(this.percent ?? 15.5),
    internalPercent: 20.5,
    deliveryPercent: 15.5,
  };
};

investorSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({ takeawayPercent: 15.5, dineInPercent: 20.5, percent: 15.5 });
  let changed = false;
  if (Number(doc.takeawayPercent) !== 15.5) { doc.takeawayPercent = 15.5; changed = true; }
  if (Number(doc.dineInPercent) !== 20.5) { doc.dineInPercent = 20.5; changed = true; }
  if (Number(doc.percent) !== 15.5) { doc.percent = 15.5; changed = true; }
  if (changed) await doc.save();
  return doc;
};

module.exports = mongoose.model('InvestorSettings', investorSettingsSchema);
