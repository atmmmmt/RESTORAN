'use strict';

const mongoose = require('mongoose');

const branchInventorySchema = new mongoose.Schema({
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', required: true },
  itemType: { type: String, enum: ['ingredient', 'product'], required: true },
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', default: null },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  itemNameSnapshot: { type: String, required: true, trim: true },
  quantity: { type: Number, default: 0, min: 0 },
  averageCostPerUnit: { type: Number, default: 0, min: 0 },
  totalPurchasedQuantity: { type: Number, default: 0 },
  totalPurchasedCost: { type: Number, default: 0 },
  lowStockThreshold: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

branchInventorySchema.index(
  { centerId: 1, itemType: 1, ingredientId: 1, productId: 1 },
  { unique: true }
);
branchInventorySchema.index({ centerId: 1, quantity: 1 });

module.exports = mongoose.model('BranchInventory', branchInventorySchema);
