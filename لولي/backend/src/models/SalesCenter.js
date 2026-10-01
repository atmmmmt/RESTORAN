'use strict';

const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productNameSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const salesCenterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم المركز مطلوب'],
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      enum: {
        values: ['regular_price_center', 'commission_based_specialized_center'],
        message: 'نوع المركز غير صالح',
      },
      required: [true, 'نوع المركز مطلوب'],
    },
    commissionPercent: {
      type: Number,
      default: 0,
      min: [0, 'نسبة العمولة لا تكون سالبة'],
      max: [100, 'نسبة العمولة لا تتجاوز 100%'],
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    mapLink: {
      type: String,
      trim: true,
      default: '',
    },
    availableProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    }],
    totalDeliveredValue: {
      type: Number,
      default: 0,
    },
    totalSoldValue: {
      type: Number,
      default: 0,
    },
    totalCommission: {
      type: Number,
      default: 0,
    },
    totalCollected: {
      type: Number,
      default: 0,
    },
    currentBalance: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // ── Center Portal (login credentials for center owner) ──
    portalUsername: {
      type: String,
      trim: true,
    },
    portalPasswordHash: {
      type: String,
      select: false,
    },

    // ── Inventory Tracking ──
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 1,
    },
    inventory: {
      type: [inventoryItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

salesCenterSchema.index({ type: 1 });
salesCenterSchema.index({ isActive: 1 });
salesCenterSchema.index({ portalUsername: 1 }, { sparse: true, unique: true });

module.exports = mongoose.model('SalesCenter', salesCenterSchema);
