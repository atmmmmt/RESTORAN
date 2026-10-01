'use strict';

const mongoose = require('mongoose');

const productionBatchSchema = new mongoose.Schema(
  {
    centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null, index: true },
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
    ingredientUsages: [{
      ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
      nameSnapshot: { type: String, required: true },
      quantity: { type: Number, required: true, min: 0 },
      costPerUnit: { type: Number, default: 0 },
    }],
    reversedAt: { type: Date, default: null, index: true },
    reversalReason: { type: String, trim: true, default: '' },
    reversedBy: { type: String, trim: true, default: '' },
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
