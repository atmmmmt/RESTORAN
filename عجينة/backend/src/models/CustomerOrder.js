'use strict';

const mongoose = require('mongoose');

const customerOrderSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: [true, 'اسم العميل مطلوب'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'رقم الهاتف مطلوب'],
      trim: true,
    },
    location: { type: String, trim: true },
    locationLink: { type: String, trim: true },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'المنتج مطلوب'],
    },
    productNameSnapshot: {
      type: String,
      required: [true, 'اسم المنتج مطلوب'],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'الكمية مطلوبة'],
      min: [1, 'الكمية يجب أن تكون على الأقل 1'],
    },
    unitPrice: { type: Number, default: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },
    profit: { type: Number, default: 0 },

    /* netAmount belongs to the restaurant. totalPrice is what the customer
       pays after the configured invoice levy is added. */
    netAmount: { type: Number, default: 0, min: 0 },
    invoiceTaxPercent: { type: Number, default: 0, min: 0, max: 100 },
    invoiceTaxAmount: { type: Number, default: 0, min: 0 },
    consumptionTaxPercent: { type: Number, default: 5, min: 0, max: 100 },
    consumptionTaxAmount: { type: Number, default: 0, min: 0 },
    localAdminPercent: { type: Number, default: 5, min: 0, max: 100 },
    localAdminAmount: { type: Number, default: 0, min: 0 },
    totalPrice: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },

    notes: { type: String, trim: true },
    deliveryMethod: {
      type: String,
      enum: ['delivery', 'pickup'],
      default: 'delivery',
    },
    status: {
      type: String,
      enum: ['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'],
      default: 'new',
    },
    whatsappMessage: { type: String, trim: true },
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null },
    centerNameSnapshot: { type: String, trim: true, default: '' },
    stockApplied: { type: Boolean, default: false },
    cashPosted: { type: Boolean, default: false },
    reversedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

customerOrderSchema.index({ status: 1 });
customerOrderSchema.index({ createdAt: -1 });
customerOrderSchema.index({ phone: 1 });
customerOrderSchema.index({ productId: 1 });
customerOrderSchema.index({ centerId: 1 });

module.exports = mongoose.model('CustomerOrder', customerOrderSchema);
