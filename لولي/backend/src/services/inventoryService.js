'use strict';

const Ingredient = require('../models/Ingredient');
const Product = require('../models/Product');

const inventoryService = {
  /**
   * Decrease ingredient stock by quantity
   */
  async decreaseIngredientStock(ingredientId, quantity) {
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
  async increaseIngredientStock(ingredientId, quantity, newCostPerUnit) {
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
  async decreaseProductStock(productId, quantity) {
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
  async increaseProductStock(productId, quantity) {
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
  async checkIngredientSufficiency(productIngredients, quantityToProduce) {
    const shortages = [];

    for (const ing of productIngredients) {
      const ingredient = await Ingredient.findById(ing.ingredientId);
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
      if (ingredient.currentStock < required) {
        shortages.push({
          ingredientId: ing.ingredientId,
          name: ingredient.name,
          required,
          available: ingredient.currentStock,
          shortage: required - ingredient.currentStock,
          unitType: ingredient.unitType,
        });
      }
    }

    return {
      sufficient: shortages.length === 0,
      shortages,
    };
  },
};

module.exports = inventoryService;
