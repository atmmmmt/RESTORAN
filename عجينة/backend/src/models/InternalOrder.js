'use strict';

const mongoose = require('mongoose');

/**
 * An order rung up inside the shop (counter / phone / staff), as opposed to
 * CustomerOrder which arrives from the public site.
 *
 * Every order gets a human-readable number and a QR payload so the kitchen
 * ticket can be scanned back to this record.
 */

const STATUSES = ['new', 'preparing', 'ready', 'delivered', 'cancelled'];

const orderItemSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:        { type: String, required: true, trim: true },   // snapshot
  unitPrice:   { type: Number, required: true, min: 0 },
  unitCost:    { type: Number, default: 0, min: 0 },           // snapshot, for profit
  quantity:    { type: Number, required: true, min: 1 },
  lineTotal:   { type: Number, required: true, min: 0 },
  notes:       { type: String, trim: true, default: '' },
}, { _id: false });

const internalOrderSchema = new mongoose.Schema(
  {
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null, index: true },
    orderNumber: { type: String, required: true, unique: true, index: true },
    qrPayload:   { type: String, default: '' },     // what the QR encodes
    qrDataUrl:   { type: String, default: '' },     // rendered PNG data URI

    items:       { type: [orderItemSchema], validate: v => v.length > 0 },

    subtotal:    { type: Number, default: 0 },
    discount:    { type: Number, default: 0, min: 0 },   // the amount taken off, always
    /* How the cashier entered it: a flat amount, or a percentage of the
       subtotal (a delivery company's agreed cut, say). `discount` holds the
       resulting amount either way, so totals never need to know. */
    discountType:    { type: String, enum: ['amount', 'percent'], default: 'amount' },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountReason:  { type: String, trim: true, default: '' },
    total:       { type: Number, default: 0 },

    /* The partner's rate at the moment of sale, so changing the rate later
       never rewrites what an old order owed. Absent on older orders, which
       fall back to the current rate for their type. */
    investorPercent: { type: Number, min: 0, max: 100 },

    /* The cashier shift this sale was rung up in. */
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashierShift', default: null, index: true },

    /* Cost & profit, snapshotted at sale time so later recipe edits
       can never rewrite the history of a completed order. */
    totalCost:   { type: Number, default: 0 },
    profit:      { type: Number, default: 0 },

    customerName:  { type: String, trim: true, default: '' },
    customerPhone: { type: String, trim: true, default: '' },
    orderType:     { type: String, enum: ['dine_in', 'takeaway', 'delivery'], default: 'takeaway' },

    /* ── When it's wanted ─────────────────────────────────────
       'asap'      — start now, the usual counter order.
       'scheduled' — wanted at `scheduledFor`; the kitchen board
                     holds it back and counts down to that moment
                     instead of ageing it from the order time. */
    fulfillmentType: { type: String, enum: ['asap', 'scheduled'], default: 'asap' },
    scheduledFor:    { type: Date },
    paymentMethod: { type: String, enum: ['cash', 'card', 'unpaid'], default: 'cash' },
    notes:         { type: String, trim: true, default: '' },

    status: { type: String, enum: STATUSES, default: 'new', index: true },

    /* Timeline — each transition stamps its moment so the log tells the story. */
    timeline: [{
      status: { type: String, enum: STATUSES },
      at:     { type: Date, default: Date.now },
      by:     { type: String, trim: true, default: '' },
    }],

    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true, default: '' },

    /* Set once stock has been taken off the products, so a re-save or a
       cancel/uncancel cycle can never double-deduct. */
    stockApplied: { type: Boolean, default: false },
    stockMovements: [{
      itemType: { type: String, enum: ['product', 'ingredient'], required: true },
      itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
      quantity: { type: Number, required: true, min: 0 },
      nameSnapshot: { type: String, trim: true, default: '' },
    }],

    /* Same idea for money: the cash entry is posted once, and cancelling
       writes a matching reversal rather than deleting history. */
    cashPosted:   { type: Boolean, default: false },
    printedAt: { type: Date, default: null },
    printCount: { type: Number, default: 0, min: 0 },
    lastPrintedBy: { type: String, trim: true, default: '' },
    printerId: { type: String, trim: true, default: '' },
    printStatus: { type: String, enum: ['never', 'printed', 'failed'], default: 'never' },
  },
  { timestamps: true }
);

internalOrderSchema.index({ createdAt: -1 });
internalOrderSchema.index({ status: 1, createdAt: -1 });
internalOrderSchema.index({ scheduledFor: 1 });
internalOrderSchema.index({ centerId: 1, status: 1, createdAt: -1 });

/** The moment the order is actually wanted — drives kitchen ordering. */
internalOrderSchema.virtual('dueAt').get(function () {
  return this.fulfillmentType === 'scheduled' && this.scheduledFor
    ? this.scheduledFor
    : this.createdAt;
});

internalOrderSchema.set('toJSON',   { virtuals: true });
internalOrderSchema.set('toObject', { virtuals: true });

/**
 * Sequential daily number: ORD-YYYYMMDD-0001
 * The date is the working day, not the calendar one: a night that runs past
 * midnight keeps counting on the same day's numbers instead of restarting at
 * 0001 at 12:00, and the count restarts when the shop's next day begins.
 */
internalOrderSchema.statics.nextOrderNumber = async function () {
  // Required here, not at the top: the service loads models of its own.
  const businessDay = require('../services/businessDay');
  const { day, start, end } = await businessDay.current();
  const stamp = day.replace(/-/g, '');

  const countToday = await this.countDocuments({ createdAt: { $gte: start, $lt: end } });

  // Guard against a same-second collision by walking forward until free.
  let seq = countToday + 1;
  for (let i = 0; i < 50; i++) {
    const candidate = `ORD-${stamp}-${String(seq).padStart(4, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const taken = await this.exists({ orderNumber: candidate });
    if (!taken) return candidate;
    seq++;
  }
  return `ORD-${stamp}-${Date.now().toString().slice(-5)}`;
};

module.exports = mongoose.model('InternalOrder', internalOrderSchema);
module.exports.STATUSES = STATUSES;
