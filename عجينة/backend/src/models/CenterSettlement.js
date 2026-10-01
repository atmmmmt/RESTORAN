'use strict';

const mongoose = require('mongoose');

const soldItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    productNameSnapshot: {
      type: String,
      trim: true,
    },
    quantitySold: {
      type: Number,
      default: 0,
      min: [0, 'الكمية المباعة لا تكون سالبة'],
    },
    unitPrice: {
      type: Number,
      default: 0,
    },
    commissionPercent: {
      type: Number,
      default: 0,
    },
    commissionAmount: {
      type: Number,
      default: 0,
    },
    netForLuliz: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const returnedItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    productNameSnapshot: {
      type: String,
      trim: true,
    },
    quantityReturned: {
      type: Number,
      default: 0,
      min: [0, 'الكمية المرتجعة لا تكون سالبة'],
    },
    condition: {
      type: String,
      enum: ['good', 'damaged'],
      default: 'good',
    },
  },
  { _id: true }
);

const centerSettlementSchema = new mongoose.Schema(
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
    soldItems: {
      type: [soldItemSchema],
      default: [],
    },
    returnedItems: {
      type: [returnedItemSchema],
      default: [],
    },
    amountCollected: {
      type: Number,
      default: 0,
      min: [0, 'المبلغ المحصّل لا يكون سالباً'],
    },
    remainingBalance: {
      type: Number,
      default: 0,
    },
    settlementDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
centerSettlementSchema.index({ centerId: 1 });
centerSettlementSchema.index({ settlementDate: -1 });

module.exports = mongoose.model('CenterSettlement', centerSettlementSchema);
