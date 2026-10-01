'use strict';

const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const ProductionBatch = require('../models/ProductionBatch');
const inventoryService = require('../services/inventoryService');

/**
 * GET /api/production
 */
exports.getAll = async (req, res) => {
  const { startDate, endDate, productId, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (startDate || endDate) {
    filter.productionDate = {};
    if (startDate) filter.productionDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.productionDate.$lte = end;
    }
  }
  if (productId) filter.productId = productId;

  const skip = (Number(page) - 1) * Number(limit);
  const [batches, total] = await Promise.all([
    ProductionBatch.find(filter)
      .populate('productId', 'name availableQuantity calculatedCost')
      .sort({ productionDate: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ProductionBatch.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: batches.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    batches,
  });
};

/**
 * GET /api/production/:id
 */
exports.getById = async (req, res) => {
  const batch = await ProductionBatch.findById(req.params.id).populate('productId', 'name calculatedCost ingredients');
  if (!batch) {
    return res.status(404).json({ success: false, message: 'دفعة الإنتاج غير موجودة.' });
  }
  res.json({ success: true, batch });
};

/**
 * POST /api/production
 * Creates production batch, deducts ingredient stock, increases product stock
 */
exports.createBatch = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const { productId, quantityProduced, productionDate, notes } = req.body;

  // Get product with ingredients
  const product = await Product.findById(productId).populate('ingredients.ingredientId', 'name currentStock unitType');
  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
  }

  if (!product.ingredients || product.ingredients.length === 0) {
    return res.status(400).json({ success: false, message: 'المنتج لا يحتوي على مكوّنات محددة.' });
  }

  // Check ingredient sufficiency
  const { sufficient, shortages } = await inventoryService.checkIngredientSufficiency(
    product.ingredients,
    quantityProduced
  );

  if (!sufficient) {
    return res.status(400).json({
      success: false,
      message: 'المخزون غير كافٍ لإنتاج هذه الكمية.',
      shortages,
    });
  }

  // Deduct ingredients
  for (const ing of product.ingredients) {
    const totalNeeded = ing.quantityUsed * quantityProduced;
    await inventoryService.decreaseIngredientStock(ing.ingredientId._id || ing.ingredientId, totalNeeded);
  }

  // Increase product stock
  await inventoryService.increaseProductStock(productId, quantityProduced);

  const unitCostSnapshot = product.calculatedCost || 0;
  const totalCost = unitCostSnapshot * quantityProduced;

  // Create production batch record
  const batch = await ProductionBatch.create({
    productId: product._id,
    productNameSnapshot: product.name,
    quantityProduced,
    productionDate: productionDate ? new Date(productionDate) : new Date(),
    unitCostSnapshot,
    totalCost,
    notes,
  });

  // Refresh product to get updated quantities
  const updatedProduct = await Product.findById(productId).select('name availableQuantity producedQuantity');

  res.status(201).json({
    success: true,
    message: `تم تسجيل إنتاج ${quantityProduced} وحدة من "${product.name}" بنجاح.`,
    batch,
    product: updatedProduct,
  });
};

// Alias
exports.create = exports.createBatch;

exports.update = async (req, res) => {
  res.status(400).json({ success: false, message: 'تعديل دفعات الإنتاج غير مدعوم.' });
};

exports.delete = async (req, res) => {
  const batch = await ProductionBatch.findById(req.params.id);
  if (!batch) {
    return res.status(404).json({ success: false, message: 'دفعة الإنتاج غير موجودة.' });
  }
  await batch.deleteOne();
  res.json({ success: true, message: 'تم حذف دفعة الإنتاج.' });
};
