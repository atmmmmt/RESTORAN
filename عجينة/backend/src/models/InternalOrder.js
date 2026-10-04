'use strict';

const mongoose = require('mongoose');

const STATUSES = ['new', 'preparing', 'ready', 'delivered', 'cancelled'];

const orderItemSchema = new mongoose.Schema({
  productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:        { type: String, required: true, trim: true },
  unitPrice:   { type: Number, required: true, min: 0 },
  unitCost:    { type: Number, default: 0, min: 0 },
  quantity:    { type: Number, required: true, min: 1 },
  lineTotal:   { type: Number, required: true, min: 0 },
  notes:       { type: String, trim: true, default: '' },
}, { _id: false });

const internalOrderSchema = new mongoose.Schema(
  {
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null, index: true },
    orderNumber: { type: String, required: true, unique: true, index: true },
    qrPayload:   { type: String, default: '' },
    qrDataUrl:   { type: String, default: '' },
    items:       { type: [orderItemSchema], validate: v => v.length > 0 },
    subtotal:    { type: Number, default: 0 },
    discount:    { type: Number, default: 0, min: 0 },
    discountType:    { type: String, enum: ['amount', 'percent'], default: 'amount' },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountReason:  { type: String, trim: true, default: '' },
    netAmount:         { type: Number, default: 0, min: 0 },
    invoiceTaxPercent: { type: Number, default: 0, min: 0, max: 100 },
    invoiceTaxAmount:  { type: Number, default: 0, min: 0 },
    consumptionTaxPercent: { type: Number, default: 5, min: 0, max: 100 },
    consumptionTaxAmount:  { type: Number, default: 0, min: 0 },
    localAdminPercent: { type: Number, default: 5, min: 0, max: 100 },
    localAdminAmount:  { type: Number, default: 0, min: 0 },
    total:             { type: Number, default: 0 },
    investorPercent: { type: Number, min: 0, max: 100 },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashierShift', default: null, index: true },
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
    stockMovements: [{
      itemType: { type: String, enum: ['product', 'ingredient'], required: true },
      itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
      quantity: { type: Number, required: true, min: 0 },
      nameSnapshot: { type: String, trim: true, default: '' },
    }],
    cashPosted:   { type: Boolean, default: false },
    printedAt: { type: Date, default: null },
    printCount: { type: Number, default: 0, min: 0 },
    lastPrintedBy: { type: String, trim: true, default: '' },
    printerId: { type: String, trim: true, default: '' },
    printStatus: { type: String, enum: ['never', 'printed', 'failed'], default: 'never' },
  },
  { timestamps: true }
);

/* New POS orders always snapshot the finance rule that was effective at the
   moment of sale. Historic orders are never recalculated when settings change. */
internalOrderSchema.pre('validate', async function (next) {
  try {
    if (!this.isNew) return next();
    const base = Math.max((Number(this.subtotal) || 0) - (Number(this.discount) || 0), 0);
    const financeService = require('../services/financeService');
    const quote = await financeService.quote(base, this.centerId);
    this.netAmount = quote.baseAmount;
    this.consumptionTaxPercent = quote.consumptionTaxPercent;
    this.consumptionTaxAmount = quote.consumptionTaxAmount;
    this.localAdminPercent = quote.localAdminPercent;
    this.localAdminAmount = quote.localAdminAmount;
    this.invoiceTaxPercent = quote.invoiceTaxPercent;
    this.invoiceTaxAmount = quote.invoiceTaxAmount;
    this.total = quote.customerTotal;
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
  const businessDay = require('../services/businessDay');
  const { day, start, end } = await businessDay.current();
  const stamp = day.replace(/-/g, '');
  const countToday = await this.countDocuments({ createdAt: { $gte: start, $lt: end } });
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
