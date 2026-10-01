'use strict';

const mongoose = require('mongoose');

const productionBatchSchema = new mongoose.Schema(
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
    quantityProduced: {
      type: Number,
      required: [true, 'الكمية المنتجة مطلوبة'],
      min: [1, 'الكمية المنتجة يجب أن تكون على الأقل 1'],
    },
    productionDate: {
      type: Date,
      default: Date.now,
    },
    unitCostSnapshot: {
      type: Number,
      default: 0,
      min: [0, 'تكلفة الوحدة لا تكون سالبة'],
    },
    totalCost: {
      type: Number,
      default: 0,
      min: [0, 'التكلفة الإجمالية لا تكون سالبة'],
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
productionBatchSchema.index({ productId: 1 });
productionBatchSchema.index({ productionDate: -1 });

module.exports = mongoose.model('ProductionBatch', productionBatchSchema);
