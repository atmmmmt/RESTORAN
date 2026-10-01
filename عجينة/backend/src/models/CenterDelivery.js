'use strict';

const mongoose = require('mongoose');

const deliveryItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productNameSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    quantityDelivered: {
      type: Number,
      required: true,
      min: [1, 'الكمية المسلّمة يجب أن تكون على الأقل 1'],
    },
    priceType: {
      type: String,
      enum: ['regular_center_price', 'commission_percentage'],
      required: true,
    },
    unitPrice: {
      type: Number,
      default: 0,
    },
    commissionPercent: {
      type: Number,
      default: 0,
    },
    expectedGrossAmount: {
      type: Number,
      default: 0,
    },
    expectedCommission: {
      type: Number,
      default: 0,
    },
    expectedNetForLuliz: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const centerDeliverySchema = new mongoose.Schema(
  {
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesCenter',
      required: [true, 'المركز مطلوب'],
    },
    centerNameSnapshot: {
      type: String,
      required: [true, 'اسم المركز مطلوب'],
      trim: true,
    },
    items: {
      type: [deliveryItemSchema],
      validate: {
        validator: (arr) => arr && arr.length > 0,
        message: 'يجب إضافة منتج واحد على الأقل',
      },
    },
    totalExpectedGross: {
      type: Number,
      default: 0,
    },
    totalExpectedCommission: {
      type: Number,
      default: 0,
    },
    totalExpectedNetForLuliz: {
      type: Number,
      default: 0,
    },
    deliveryDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'partially_settled', 'closed'],
      default: 'open',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
centerDeliverySchema.index({ centerId: 1 });
centerDeliverySchema.index({ deliveryDate: -1 });
centerDeliverySchema.index({ status: 1 });

module.exports = mongoose.model('CenterDelivery', centerDeliverySchema);
