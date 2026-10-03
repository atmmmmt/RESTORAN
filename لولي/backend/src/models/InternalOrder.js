'use strict';

const mongoose = require('mongoose');

const STATUSES = ['new', 'preparing', 'ready', 'delivered', 'cancelled'];

const orderItemModifierSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  priceDelta: { type: Number, default: 0 },
  costDelta:  { type: Number, default: 0 },
}, { _id: false });

const orderItemSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:        { type: String, required: true, trim: true },
  unitPrice:   { type: Number, required: true, min: 0 },
  unitCost:    { type: Number, default: 0, min: 0 },
  modifiers:   { type: [orderItemModifierSchema], default: [] },
  quantity:    { type: Number, required: true, min: 1 },
  lineTotal:   { type: Number, required: true, min: 0 },
  notes:       { type: String, trim: true, default: '' },
}, { _id: false });

const internalOrderSchema = new mongoose.Schema(
  {
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null, index: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashierShift', default: null, index: true },
    orderNumber: { type: String, required: true, unique: true, index: true },
    qrPayload:   { type: String, default: '' },
    qrDataUrl:   { type: String, default: '' },
    items:       { type: [orderItemSchema], validate: v => v.length > 0 },
    subtotal:    { type: Number, default: 0 },
    discount:    { type: Number, default: 0, min: 0 },
    netAmount:         { type: Number, default: 0, min: 0 },
    invoiceTaxPercent: { type: Number, default: 0, min: 0, max: 100 },
    invoiceTaxAmount:  { type: Number, default: 0, min: 0 },
    total:             { type: Number, default: 0 },
    totalCost:   { type: Number, default: 0 },
    profit:      { type: Number, default: 0 },
    customerName:  { type: String, trim: true, default: '' },
    customerPhone: { type: String, trim: true, default: '' },
    orderType:     { type: String, enum: ['dine_in', 'takeaway', 'delivery'], default: 'takeaway' },
    fulfillmentType: { type: String, enum: ['asap', 'scheduled'], default: 'asap' },
    scheduledFor:    { type: Date },
    paymentMethod: { type: String, enum: ['cash', 'card', 'unpaid'], default: 'cash' },
    notes:         { type: String, trim: true, default: '' },
    status: { type: String, enum: STATUSES, default: 'new', index: true },
    timeline: [{
      status: { type: String, enum: STATUSES },
      at:     { type: Date, default: Date.now },
      by:     { type: String, trim: true, default: '' },
    }],
    createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, trim: true, default: '' },
    stockApplied: { type: Boolean, default: false },
    cashPosted:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

internalOrderSchema.pre('validate', async function (next) {
  try {
    if (!this.isNew) return next();
    const base = Math.max((Number(this.subtotal) || 0) - (Number(this.discount) || 0), 0);
    const FinanceSettings = require('./FinanceSettings');
    const settings = await FinanceSettings.getSingleton();
    const resolved = settings.resolveFor(this.centerId);
    const pct = resolved.invoiceTax.enabled ? Number(resolved.invoiceTax.percent || 0) : 0;
    const tax = Math.round(base * pct) / 100;
    this.netAmount = base;
    this.invoiceTaxPercent = pct;
    this.invoiceTaxAmount = tax;
    this.total = Math.round((base + tax) * 100) / 100;
    this.profit = Math.round((base - (Number(this.totalCost) || 0)) * 100) / 100;
    return next();
  } catch (err) {
    return next(err);
  }
});

internalOrderSchema.index({ createdAt: -1 });
internalOrderSchema.index({ status: 1, createdAt: -1 });
internalOrderSchema.index({ scheduledFor: 1 });
internalOrderSchema.index({ centerId: 1, status: 1, createdAt: -1 });

internalOrderSchema.virtual('dueAt').get(function () {
  return this.fulfillmentType === 'scheduled' && this.scheduledFor ? this.scheduledFor : this.createdAt;
});

internalOrderSchema.set('toJSON',   { virtuals: true });
internalOrderSchema.set('toObject', { virtuals: true });

internalOrderSchema.statics.nextOrderNumber = async function () {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay   = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  const countToday = await this.countDocuments({ createdAt: { $gte: startOfDay, $lt: endOfDay } });
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
