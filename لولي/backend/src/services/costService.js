'use strict';

const costService = {
  /**
   * Calculate total product cost from ingredients + packaging + extra
   * @param {Array} ingredients - Array of ingredient entries with costSnapshot
   * @param {number} packagingCost
   * @param {number} extraCost
   * @returns {number} total calculated cost
   */
  calculateProductCost(ingredients = [], packagingCost = 0, extraCost = 0) {
    const ingredientCost = ingredients.reduce((sum, ing) => {
      return sum + (Number(ing.costSnapshot) || 0);
    }, 0);

    return ingredientCost + Number(packagingCost || 0) + Number(extraCost || 0);
  },

  /**
   * Calculate total nutrition from ingredient snapshots
   * @param {Array} ingredients - Array with nutritionSnapshot and quantityUsed
   * @returns {{ calories, protein, carbs, fat }}
   */
  calculateProductNutrition(ingredients = []) {
    const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

    for (const ing of ingredients) {
      const snap = ing.nutritionSnapshot || {};
      totals.calories += Number(snap.calories) || 0;
      totals.protein += Number(snap.protein) || 0;
      totals.carbs += Number(snap.carbs) || 0;
      totals.fat += Number(snap.fat) || 0;
    }

    return {
      calories: Math.round(totals.calories * 100) / 100,
      protein: Math.round(totals.protein * 100) / 100,
      carbs: Math.round(totals.carbs * 100) / 100,
      fat: Math.round(totals.fat * 100) / 100,
    };
  },

  /**
   * Calculate profit, commission and amount for Luliz
   * @param {number} productCost - total cost of the product
   * @param {number} price - selling price
   * @param {number} commissionPercent - commission percentage (0-100)
   * @returns {{ commission, amountForLuliz, profit, margin }}
   */
  calculateProfit(productCost, price, commissionPercent = 0) {
    const commission = price * (commissionPercent / 100);
    const amountForLuliz = price - commission;
    const profit = amountForLuliz - productCost;
    const margin = price > 0 ? ((profit / price) * 100).toFixed(1) : '0.0';

    return {
      commission: Math.round(commission * 100) / 100,
      amountForLuliz: Math.round(amountForLuliz * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      margin,
    };
  },

  /**
   * Apply discount to a price
   * @param {number} originalPrice
   * @param {'percentage'|'fixed'} discountType
   * @param {number} discountValue
   * @returns {{ discountedPrice, discountAmount }}
   */
  applyDiscount(originalPrice, discountType, discountValue) {
    let discountAmount = 0;

    if (discountType === 'percentage') {
      discountAmount = originalPrice * (discountValue / 100);
    } else if (discountType === 'fixed') {
      discountAmount = discountValue;
    }

    discountAmount = Math.min(discountAmount, originalPrice);
    const discountedPrice = originalPrice - discountAmount;

    return {
      discountedPrice: Math.round(discountedPrice * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
    };
  },
};

module.exports = costService;
