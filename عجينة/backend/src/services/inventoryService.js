'use strict';

const Ingredient = require('../models/Ingredient');
const Product = require('../models/Product');
const BranchInventory = require('../models/BranchInventory');

async function branchItem(centerId, itemType, itemId, create = false) {
  const idField = itemType === 'ingredient' ? 'ingredientId' : 'productId';
  const Model = itemType === 'ingredient' ? Ingredient : Product;
  let row = await BranchInventory.findOne({ centerId, itemType, [idField]: itemId });
  if (!row && create) {
    const source = await Model.findById(itemId).select('name averageCostPerUnit calculatedCost');
    if (!source) throw new Error(`${itemType === 'ingredient' ? 'المكوّن' : 'المنتج'} غير موجود: ${itemId}`);
    row = await BranchInventory.create({
      centerId, itemType, [idField]: itemId, itemNameSnapshot: source.name,
      averageCostPerUnit: source.averageCostPerUnit || source.calculatedCost || 0,
    });
  }
  return row;
}

const inventoryService = {
  /**
   * Decrease ingredient stock by quantity
   */
  async decreaseIngredientStock(ingredientId, quantity, centerId = null) {
    if (centerId) {
      const row = await branchItem(centerId, 'ingredient', ingredientId, false);
      if (!row || row.quantity < quantity) {
        throw new Error(`مخزون الفرع غير كافٍ للمكوّن "${row?.itemNameSnapshot || ingredientId}". المتاح: ${row?.quantity || 0}, المطلوب: ${quantity}`);
      }
      const updated = await BranchInventory.findOneAndUpdate(
        { _id: row._id, quantity: { $gte: quantity } }, { $inc: { quantity: -quantity } }, { new: true }
      );
      if (!updated) throw new Error('تغيّر مخزون الفرع أثناء العملية، حاول مجدداً.');
      return updated;
    }
    const ingredient = await Ingredient.findById(ingredientId);
    if (!ingredient) {
      throw new Error(`المكوّن غير موجود: ${ingredientId}`);
    }

    if (ingredient.currentStock < quantity) {
      throw new Error(
        `مخزون غير كافٍ للمكوّن "${ingredient.name}". المتاح: ${ingredient.currentStock}, المطلوب: ${quantity}`
      );
    }

    ingredient.currentStock = Math.max(0, ingredient.currentStock - quantity);
    await ingredient.save();

    return ingredient;
  },

  /**
   * Increase ingredient stock using weighted average cost calculation
   */
  async increaseIngredientStock(ingredientId, quantity, newCostPerUnit, centerId = null) {
    if (centerId) {
      const row = await branchItem(centerId, 'ingredient', ingredientId, true);
      const currentStock = row.quantity || 0;
      const newTotalStock = currentStock + quantity;
      row.averageCostPerUnit = newTotalStock > 0
        ? Math.round(((currentStock * (row.averageCostPerUnit || 0) + quantity * newCostPerUnit) / newTotalStock) * 100) / 100
        : newCostPerUnit;
      row.quantity = newTotalStock;
      row.totalPurchasedQuantity += quantity;
      row.totalPurchasedCost += quantity * newCostPerUnit;
      return row.save();
    }
    const ingredient = await Ingredient.findById(ingredientId);
    if (!ingredient) {
      throw new Error(`المكوّن غير موجود: ${ingredientId}`);
    }

    const currentStock = ingredient.currentStock || 0;
    const currentAvg = ingredient.averageCostPerUnit || 0;
    const totalCostForNewBatch = quantity * newCostPerUnit;

    // Weighted average cost
    const newTotalStock = currentStock + quantity;
    const newAvgCost =
      newTotalStock > 0
        ? (currentStock * currentAvg + totalCostForNewBatch) / newTotalStock
        : newCostPerUnit;

    ingredient.currentStock = newTotalStock;
    ingredient.averageCostPerUnit = Math.round(newAvgCost * 100) / 100;
    ingredient.totalPurchasedQuantity = (ingredient.totalPurchasedQuantity || 0) + quantity;
    ingredient.totalPurchasedCost = (ingredient.totalPurchasedCost || 0) + totalCostForNewBatch;

    await ingredient.save();

    return ingredient;
  },

  /**
   * Decrease product available quantity
   */
  async decreaseProductStock(productId, quantity, centerId = null) {
    if (centerId) {
      const row = await branchItem(centerId, 'product', productId, false);
      if (!row || row.quantity < quantity) throw new Error(`مخزون الفرع غير كافٍ للمنتج "${row?.itemNameSnapshot || productId}".`);
      return BranchInventory.findOneAndUpdate(
        { _id: row._id, quantity: { $gte: quantity } }, { $inc: { quantity: -quantity } }, { new: true }
      );
    }
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error(`المنتج غير موجود: ${productId}`);
    }

    if (product.availableQuantity < quantity) {
      throw new Error(
        `مخزون المنتج غير كافٍ. المتاح: ${product.availableQuantity}, المطلوب: ${quantity}`
      );
    }

    product.availableQuantity = Math.max(0, product.availableQuantity - quantity);

    // Auto-update status
    if (product.availableQuantity === 0 && product.status === 'available') {
      product.status = 'sold_out';
    }

    await product.save();

    return product;
  },

  /**
   * Increase product available quantity
   */
  async increaseProductStock(productId, quantity, centerId = null) {
    if (centerId) {
      const row = await branchItem(centerId, 'product', productId, true);
      row.quantity += quantity;
      return row.save();
    }
    const product = await Product.findById(productId);
    if (!product) {
      throw new Error(`المنتج غير موجود: ${productId}`);
    }

    product.availableQuantity = (product.availableQuantity || 0) + quantity;
    product.producedQuantity = (product.producedQuantity || 0) + quantity;

    // Re-activate if it was sold out
    if (product.status === 'sold_out' && product.availableQuantity > 0) {
      product.status = 'available';
    }

    await product.save();

    return product;
  },

  /**
   * Check if there are enough ingredients to produce a given quantity of a product
   * @param {Array} productIngredients - product.ingredients array
   * @param {number} quantityToProduce
   * @returns {{ sufficient: boolean, shortages: Array }}
   */
  async checkIngredientSufficiency(productIngredients, quantityToProduce, centerId = null) {
    const shortages = [];

    for (const ing of productIngredients) {
      const ingredient = await Ingredient.findById(ing.ingredientId);
      const branchStock = centerId
        ? await branchItem(centerId, 'ingredient', ing.ingredientId?._id || ing.ingredientId, false)
        : null;
      if (!ingredient) {
        shortages.push({
          ingredientId: ing.ingredientId,
          name: ing.ingredientNameSnapshot,
          required: ing.quantityUsed * quantityToProduce,
          available: 0,
          shortage: ing.quantityUsed * quantityToProduce,
        });
        continue;
      }

      const required = ing.quantityUsed * quantityToProduce;
      const available = centerId ? (branchStock?.quantity || 0) : ingredient.currentStock;
      if (available < required) {
        shortages.push({
          ingredientId: ing.ingredientId,
          name: ingredient.name,
          required,
          available,
          shortage: required - available,
          unitType: ingredient.unitType,
        });
      }
    }

    return {
      sufficient: shortages.length === 0,
      shortages,
    };
  },

  async getBranchInventory(centerId) {
    return BranchInventory.find({ centerId })
      .populate('ingredientId', 'name unitType')
      .populate('productId', 'name image category')
      .sort({ itemType: 1, itemNameSnapshot: 1 });
  },
};

module.exports = inventoryService;
