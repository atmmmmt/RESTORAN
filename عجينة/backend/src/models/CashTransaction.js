'use strict';

const mongoose = require('mongoose');

const cashTransactionSchema = new mongoose.Schema(
  {
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesCenter',
      default: null,
    },
    type: {
      type: String,
      enum: {
        values: [
          'opening_balance',
          'sale_income',
          'center_collection',
          'purchase_expense',
          'manual_expense',
          'manual_income',
          'adjustment',
        ],
        message: 'نوع المعاملة المالية غير صالح',
      },
      required: [true, 'نوع المعاملة مطلوب'],
    },
    amount: {
      type: Number,
      required: [true, 'المبلغ مطلوب'],
      min: [0.01, 'المبلغ يجب أن يكون أكبر من صفر'],
    },
    direction: {
      type: String,
      enum: {
        values: ['in', 'out'],
        message: 'اتجاه المعاملة يجب أن يكون: in أو out',
      },
      required: [true, 'اتجاه المعاملة مطلوب'],
    },
    description: {
      type: String,
      trim: true,
    },
    referenceType: {
      type: String,
      trim: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    transactionDate: {
      type: Date,
      default: Date.now,
    },
    reversedAt: { type: Date, default: null },
    reversalOfId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashTransaction', default: null },
    reversalTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashTransaction', default: null },
  },
  {
    timestamps: true,
  }
);

// Indexes
cashTransactionSchema.index({ transactionDate: -1 });
cashTransactionSchema.index({ type: 1 });
cashTransactionSchema.index({ direction: 1 });
cashTransactionSchema.index({ centerId: 1 });

/**
 * Static: get current cash balance (IN - OUT)
 */
cashTransactionSchema.statics.getCurrentBalance = async function () {
  const result = await this.aggregate([
    {
      $group: {
        _id: '$direction',
        total: { $sum: '$amount' },
      },
    },
  ]);

  let balance = 0;
  result.forEach((r) => {
    if (r._id === 'in') balance += r.total;
    else balance -= r.total;
  });

  return balance;
};

module.exports = mongoose.model('CashTransaction', cashTransactionSchema);
