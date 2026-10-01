'use strict';

const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
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
    unitPrice: {
      type: Number,
      required: [true, 'سعر الوحدة مطلوب'],
      min: [0, 'سعر الوحدة لا يكون سالباً'],
    },
    grossAmount: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    netAmount: {
      type: Number,
      default: 0,
    },
    productCostSnapshot: {
      type: Number,
      default: 0,
    },
    totalCost: {
      type: Number,
      default: 0,
    },
    profit: {
      type: Number,
      default: 0,
    },
    salesChannel: {
      type: String,
      enum: {
        values: ['direct', 'whatsapp', 'regular_center', 'specialized_center'],
        message: 'قناة البيع غير صالحة',
      },
      required: [true, 'قناة البيع مطلوبة'],
    },
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesCenter',
    },
    centerNameSnapshot: {
      type: String,
      trim: true,
    },
    commissionPercent: {
      type: Number,
      default: 0,
      min: [0, 'نسبة العمولة لا تكون سالبة'],
      max: [100, 'نسبة العمولة لا تتجاوز 100%'],
    },
    commissionAmount: {
      type: Number,
      default: 0,
    },
    amountForLuliz: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ['paid', 'unpaid', 'partially_paid'],
      default: 'paid',
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
    },
    customerName: {
      type: String,
      trim: true,
    },
    customerPhone: {
      type: String,
      trim: true,
    },
    deliveryLocation: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    saleDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['active', 'reversed'],
      default: 'active',
      index: true,
    },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reversalReason: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
  }
);

// Indexes
saleSchema.index({ saleDate: -1 });
saleSchema.index({ productId: 1 });
saleSchema.index({ salesChannel: 1 });
saleSchema.index({ centerId: 1 });
saleSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Sale', saleSchema);
