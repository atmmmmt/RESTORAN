'use strict';

const mongoose = require('mongoose');

/**
 * Network thermal-printer configuration — one document per brand (the tenant
 * plugin scopes it automatically, same as AttendanceSettings).
 *
 * Two stations are modelled from day one even though only the cashier's
 * printer exists today: adding the kitchen printer later is then just
 * filling in its IP and flipping `kitchenEnabled`, no schema change.
 */
const printerSettingsSchema = new mongoose.Schema(
  {
    /* ── Cashier / front counter ── */
    cashierIp:      { type: String, default: '', trim: true },
    cashierPort:    { type: Number, default: 9100 },
    cashierEnabled: { type: Boolean, default: false },

    /* ── Kitchen — not wired to a physical printer yet ── */
    kitchenIp:      { type: String, default: '', trim: true },
    kitchenPort:    { type: Number, default: 9100 },
    kitchenEnabled: { type: Boolean, default: false },

    /* ── What prints by itself when the cashier confirms an order ──
       off     → nothing, print from the ticket window by hand
       cashier → the customer receipt only
       both    → customer receipt, then the kitchen ticket right after */
    autoPrint: { type: String, enum: ['off', 'cashier', 'both'], default: 'off' },
  },
  { timestamps: true }
);

/* Singleton — one config document per brand. */
printerSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model('PrinterSettings', printerSettingsSchema);
