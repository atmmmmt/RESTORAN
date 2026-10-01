'use strict';

const mongoose = require('mongoose');

const wasteRecordSchema = new mongoose.Schema(
  {
    /* Which branch threw this away. null = head office / central kitchen.
       Without it an owner can see the total loss but not which site is
       causing it, which is the number that actually drives action. */
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesCenter',
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: ['product', 'ingredient'],
        message: 'نوع الهدر يجب أن يكون: product أو ingredient',
      },
      required: [true, 'نوع الهدر مطلوب'],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
    },
    nameSnapshot: {
      type: String,
      required: [true, 'اسم العنصر مطلوب'],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'الكمية مطلوبة'],
      min: [0.001, 'الكمية يجب أن تكون أكبر من صفر'],
    },
    unitType: {
      type: String,
      enum: ['gram', 'kg', 'ml', 'liter', 'piece'],
    },
    reason: {
      type: String,
      enum: {
        values: ['damaged', 'spilled', 'expired', 'returned_damaged', 'preparation_mistake', 'unsold', 'other'],
        message: 'سبب الهدر غير صالح',
      },
      required: [true, 'سبب الهدر مطلوب'],
    },
    estimatedUnitCost: {
      type: Number,
      default: 0,
      min: [0, 'التكلفة التقديرية للوحدة لا تكون سالبة'],
    },
    totalLossCost: {
      type: Number,
      default: 0,
      min: [0, 'إجمالي خسارة الهدر لا تكون سالبة'],
    },
    notes: {
      type: String,
      trim: true,
    },
    wasteDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
wasteRecordSchema.index({ wasteDate: -1 });
wasteRecordSchema.index({ type: 1 });
wasteRecordSchema.index({ reason: 1 });
wasteRecordSchema.index({ productId: 1 });
wasteRecordSchema.index({ ingredientId: 1 });

module.exports = mongoose.model('WasteRecord', wasteRecordSchema);
