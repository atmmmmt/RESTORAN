'use strict';

const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema(
  {
    ingredientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ingredient',
      required: true,
    },
    ingredientNameSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [0.001, 'الكمية يجب أن تكون أكبر من صفر'],
    },
    unitType: {
      type: String,
      enum: ['gram', 'kg', 'ml', 'liter', 'piece'],
      required: true,
    },
    totalCost: {
      type: Number,
      required: true,
      min: [0, 'التكلفة لا تكون سالبة'],
    },
    costPerUnit: {
      type: Number,
      required: true,
      min: [0, 'التكلفة لكل وحدة لا تكون سالبة'],
    },
  },
  { _id: true }
);

const purchaseSchema = new mongoose.Schema(
  {
    /* Who bought it. null = head office / central purchasing.
       A branch buying gas or cleaning supplies locally records it here so
       the spend lands against that branch's till, not the company total. */
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesCenter',
      default: null,
      index: true,
    },
    supplierName: {
      type: String,
      required: [true, 'اسم المورد مطلوب'],
      trim: true,
    },
    items: {
      type: [purchaseItemSchema],
      validate: {
        validator: (arr) => arr && arr.length > 0,
        message: 'يجب إضافة مكوّن واحد على الأقل',
      },
    },
    totalPurchaseCost: {
      type: Number,
      required: true,
      min: [0, 'إجمالي تكلفة الشراء لا يكون سالباً'],
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank', 'other'],
      default: 'cash',
    },
    paidFromCashBalance: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    reversedAt: { type: Date, default: null, index: true },
    reversalReason: { type: String, trim: true, default: '' },
    reversedBy: { type: String, trim: true, default: '' },
  },
  {
    timestamps: true,
  }
);

// Indexes
purchaseSchema.index({ purchaseDate: -1 });
purchaseSchema.index({ supplierName: 1 });
purchaseSchema.index({ centerId: 1, purchaseDate: -1 });

module.exports = mongoose.model('Purchase', purchaseSchema);
