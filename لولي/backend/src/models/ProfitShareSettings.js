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
      // New business rule for Luliz:
      // delivery = 15%, any counter/internal order = 20%.
      // Keep the legacy fields for compatibility with older deployments,
      // but all new calculations use deliveryPercent/internalPercent.
      deliveryPercent: { type: Number, min: 0, max: 100, default: 15 },
      internalPercent: { type: Number, min: 0, max: 100, default: 20 },
      posPercent:  { type: Number, min: 0, max: 100, default: 20 },
      sitePercent: { type: Number, min: 0, max: 100, default: 15 },
    },
  },
  { timestamps: true }
);

profitShareSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({
    investor: { deliveryPercent: 15, internalPercent: 20, posPercent: 20, sitePercent: 15 },
  });

  // Existing production documents were created before delivery/internal rates
  // existed. Backfill them once so today and all historical reports use the
  // requested Luliz percentages immediately after deploy.
  const inv = doc.investor || {};
  let changed = false;
  if (inv.deliveryPercent === undefined || inv.deliveryPercent === null) { inv.deliveryPercent = 15; changed = true; }
  if (inv.internalPercent === undefined || inv.internalPercent === null) { inv.internalPercent = 20; changed = true; }
  if (Number(inv.posPercent) !== 20) { inv.posPercent = 20; changed = true; }
  if (Number(inv.sitePercent) !== 15) { inv.sitePercent = 15; changed = true; }
  doc.investor = inv;
  if (changed) {
    doc.markModified('investor');
    await doc.save();
  }
  return doc;
};

module.exports = mongoose.model('ProfitShareSettings', profitShareSettingsSchema);
