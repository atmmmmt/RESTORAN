'use strict';

const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema(
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
    discountType: {
      type: String,
      enum: {
        values: ['percentage', 'fixed'],
        message: 'نوع الخصم يجب أن يكون: percentage أو fixed',
      },
      required: [true, 'نوع الخصم مطلوب'],
    },
    discountValue: {
      type: Number,
      required: [true, 'قيمة الخصم مطلوبة'],
      min: [0.01, 'قيمة الخصم يجب أن تكون أكبر من صفر'],
    },
    startDate: {
      type: Date,
      required: [true, 'تاريخ بداية العرض مطلوب'],
    },
    endDate: {
      type: Date,
      required: [true, 'تاريخ نهاية العرض مطلوب'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    showOnHomepage: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual: isCurrentlyActive
offerSchema.virtual('isCurrentlyActive').get(function () {
  const now = new Date();
  return this.isActive && now >= this.startDate && now <= this.endDate;
});

// Indexes
offerSchema.index({ productId: 1 });
offerSchema.index({ isActive: 1 });
offerSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('Offer', offerSchema);
