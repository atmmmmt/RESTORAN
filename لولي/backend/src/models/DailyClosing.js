'use strict';

const mongoose = require('mongoose');

const productSummarySchema = new mongoose.Schema(
  {
    productId: mongoose.Schema.Types.ObjectId,
    name: String,
    produced: { type: Number, default: 0 },
    sold: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
    waste: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
  },
  { _id: false }
);

const centerSummarySchema = new mongoose.Schema(
  {
    centerId: mongoose.Schema.Types.ObjectId,
    name: String,
    delivered: { type: Number, default: 0 },
    sold: { type: Number, default: 0 },
    collected: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
  },
  { _id: false }
);

const dailyClosingSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, 'تاريخ الإغلاق مطلوب'],
      unique: true,
    },
    totalRevenue: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    totalPurchases: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    totalWasteCost: { type: Number, default: 0 },
    totalCommissions: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    cashBalance: { type: Number, default: 0 },
    productsSummary: {
      type: [productSummarySchema],
      default: [],
    },
    centersSummary: {
      type: [centerSummarySchema],
      default: [],
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
dailyClosingSchema.index({ date: -1 }, { unique: true });

module.exports = mongoose.model('DailyClosing', dailyClosingSchema);
