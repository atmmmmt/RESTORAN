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

/* Snapshot of whichever product.modifiers the cashier picked for this line —
   name + deltas copied at sale time, same reasoning as unitCost below: a
   later edit to the product's modifier prices must never reach back and
   change what a past order says it charged. */
const orderItemModifierSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  priceDelta: { type: Number, default: 0 },
  costDelta:  { type: Number, default: 0 },
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:        { type: String, required: true, trim: true },   // snapshot
  unitPrice:   { type: Number, required: true, min: 0 },
  unitCost:    { type: Number, default: 0, min: 0 },           // snapshot, for profit
  modifiers:   { type: [orderItemModifierSchema], default: [] },
  quantity:    { type: Number, required: true, min: 1 },
  lineTotal:   { type: Number, required: true, min: 0 },
  notes:       { type: String, trim: true, default: '' },
}, { _id: false });

const internalOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    qrPayload:   { type: String, default: '' },     // what the QR encodes
    qrDataUrl:   { type: String, default: '' },     // rendered PNG data URI

    items:       { type: [orderItemSchema], validate: v => v.length > 0 },

    subtotal:    { type: Number, default: 0 },
    discount:    { type: Number, default: 0, min: 0 },
    total:       { type: Number, default: 0 },

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

    /* Same idea for money: the cash entry is posted once, and cancelling
       writes a matching reversal rather than deleting history. */
    cashPosted:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

internalOrderSchema.index({ createdAt: -1 });
internalOrderSchema.index({ status: 1, createdAt: -1 });
internalOrderSchema.index({ scheduledFor: 1 });

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
 * Counting today's documents is fine at this shop's volume and keeps the
 * numbers restarting each morning, which is what the staff expect.
 */
internalOrderSchema.statics.nextOrderNumber = async function () {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay   = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const countToday = await this.countDocuments({ createdAt: { $gte: startOfDay, $lt: endOfDay } });

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
