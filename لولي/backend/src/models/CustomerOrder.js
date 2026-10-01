'use strict';

const mongoose = require('mongoose');

const customerOrderSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: [true, 'اسم العميل مطلوب'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'رقم الهاتف مطلوب'],
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    locationLink: {
      type: String,
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
      min: [1, 'الكمية يجب أن تكون على الأقل 1'],
    },
    unitPrice: {
      type: Number,
      default: 0,
    },
    totalPrice: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
    deliveryMethod: {
      type: String,
      enum: ['delivery', 'pickup'],
      default: 'delivery',
    },
    status: {
      type: String,
      enum: ['new', 'confirmed', 'preparing', 'delivered', 'cancelled'],
      default: 'new',
    },
    whatsappMessage: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
customerOrderSchema.index({ status: 1 });
customerOrderSchema.index({ createdAt: -1 });
customerOrderSchema.index({ phone: 1 });
customerOrderSchema.index({ productId: 1 });

module.exports = mongoose.model('CustomerOrder', customerOrderSchema);
