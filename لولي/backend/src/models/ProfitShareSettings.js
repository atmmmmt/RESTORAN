'use strict';

const mongoose = require('mongoose');

/**
 * Net-profit split — who takes what percentage of each month's net profit.
 * Kept out of SiteSettings on purpose: that document is served publicly to the
 * customer site, and partner shares must never leave the admin panel.
 */
const partnerSchema = new mongoose.Schema(
  {
    name:    { type: String, required: true, trim: true },
    percent: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: true }
);

const profitShareSettingsSchema = new mongoose.Schema(
  {
    partners: { type: [partnerSchema], default: [] },

    /* Investor who takes a cut of every order's takings straight from the till
       (not from net profit): one rate for counter/cashier orders, another for
       website orders. Shown per order on the daily orders printout. */
    investor: {
      enabled:     { type: Boolean, default: true },
      name:        { type: String, trim: true, default: 'الأميركان' },
      posPercent:  { type: Number, min: 0, max: 100, default: 15 },
      sitePercent: { type: Number, min: 0, max: 100, default: 10 },
    },
  },
  { timestamps: true }
);

profitShareSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model('ProfitShareSettings', profitShareSettingsSchema);
