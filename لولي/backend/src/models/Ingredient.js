'use strict';

const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم المكوّن مطلوب'],
      trim: true,
    },
    unitType: {
      type: String,
      enum: {
        values: ['gram', 'kg', 'ml', 'liter', 'piece'],
        message: 'نوع الوحدة يجب أن يكون: gram, kg, ml, liter, piece',
      },
      required: [true, 'نوع الوحدة مطلوب'],
    },
    currentStock: {
      type: Number,
      default: 0,
      min: [0, 'المخزون لا يمكن أن يكون سالباً'],
    },
    averageCostPerUnit: {
      type: Number,
      default: 0,
      min: [0, 'التكلفة لا يمكن أن تكون سالبة'],
    },
    totalPurchasedQuantity: {
      type: Number,
      default: 0,
    },
    totalPurchasedCost: {
      type: Number,
      default: 0,
    },
    nutritionPerUnit: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fat: { type: Number, default: 0 },
    },
    lowStockThreshold: {
      type: Number,
      default: 0,
      min: [0, 'حد المخزون المنخفض لا يمكن أن يكون سالباً'],
    },
    notes: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ingredientSchema.index({ name: 1 });
ingredientSchema.index({ isActive: 1 });
ingredientSchema.index({ currentStock: 1 });

// Virtual: low stock alert
ingredientSchema.virtual('isLowStock').get(function () {
  return this.currentStock <= this.lowStockThreshold;
});

ingredientSchema.set('toJSON', { virtuals: true });
ingredientSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Ingredient', ingredientSchema);
