'use strict';

const mongoose = require('mongoose');

/**
 * A customer bringing part (or all) of an order back.
 *
 * The original order is never rewritten: a return is its own record, so the
 * day's takings still show what was sold and a separate line shows what came
 * back. `restock` says whether the goods went back on the shelf to be sold
 * again — food that cannot be resold is returned for money but not for stock.
 */

const returnItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:      { type: String, required: true, trim: true },   // snapshot
  unitPrice: { type: Number, required: true, min: 0 },
  quantity:  { type: Number, required: true, min: 1 },
  lineTotal: { type: Number, required: true, min: 0 },
}, { _id: false });

const returnRecordSchema = new mongoose.Schema(
  {
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null, index: true },

    returnNumber: { type: String, required: true, unique: true, index: true },

    orderId:     { type: mongoose.Schema.Types.ObjectId, ref: 'InternalOrder', required: true, index: true },
    orderNumber: { type: String, required: true, trim: true },

    items: { type: [returnItemSchema], validate: v => v.length > 0 },

    /* What the customer actually got back. The order's own discount is
       spread across the returned lines so a half-return refunds half the
       discounted price, not half the list price. */
    refundAmount: { type: Number, required: true, min: 0 },

    /* Money out of the till. False when the order was never paid for
       ("آجل") — there is nothing to hand back. */
    refundMethod: { type: String, enum: ['cash', 'card', 'none'], default: 'cash' },
    cashPosted:   { type: Boolean, default: false },

    restocked: { type: Boolean, default: true },
    reason:    { type: String, trim: true, default: '' },

    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

returnRecordSchema.index({ createdAt: -1 });

/** Sequential daily number: RET-YYYYMMDD-0001 */
returnRecordSchema.statics.nextReturnNumber = async function () {
  // Numbered by the working day, like the orders they come back from.
  const businessDay = require('../services/businessDay');
  const { day, start, end } = await businessDay.current();
  const stamp = day.replace(/-/g, '');
  const countToday = await this.countDocuments({ createdAt: { $gte: start, $lt: end } });

  let seq = countToday + 1;
  for (let i = 0; i < 50; i++) {
    const candidate = `RET-${stamp}-${String(seq).padStart(4, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const taken = await this.exists({ returnNumber: candidate });
    if (!taken) return candidate;
    seq++;
  }
  return `RET-${stamp}-${Date.now().toString().slice(-5)}`;
};

module.exports = mongoose.model('ReturnRecord', returnRecordSchema);
