'use strict';
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  customerName: { type: String, required: [true, 'اسم العميل مطلوب'], trim: true },
  content:      { type: String, required: [true, 'نص الرأي مطلوب'], trim: true },
  rating:       { type: Number, min: 1, max: 5, default: 5 },
  emoji:        { type: String, default: '😊' },
  isVisible:    { type: Boolean, default: true },
  order:        { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Review', reviewSchema);
