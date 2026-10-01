'use strict';

const mongoose = require('mongoose');

const centerSaleSchema = new mongoose.Schema(
  {
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesCenter',
      required: [true, 'المركز مطلوب'],
    },
    centerNameSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
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
      min: [1, 'الكمية يجب أن تكون 1 على الأقل'],
    },
    saleDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

centerSaleSchema.index({ centerId: 1 });
centerSaleSchema.index({ saleDate: -1 });

module.exports = mongoose.model('CenterSale', centerSaleSchema);
