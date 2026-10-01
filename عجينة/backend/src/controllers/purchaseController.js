'use strict';

const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const Purchase = require('../models/Purchase');
const Ingredient = require('../models/Ingredient');
const inventoryService = require('../services/inventoryService');
const cashService = require('../services/cashService');

/**
 * GET /api/purchases
 */
exports.getAll = async (req, res) => {
  const { startDate, endDate, supplierName, page = 1, limit = 20 } = req.query;

  const filter = {};

  /* A branch portal only ever sees its own purchases; an admin may filter,
     and 'hq' means central purchasing. */
  if (req.center?._id) {
    filter.centerId = req.center._id;
  } else if (req.query.center && req.query.center !== 'all') {
    filter.centerId = req.query.center === 'hq' ? null : req.query.center;
  }

  if (startDate || endDate) {
    filter.purchaseDate = {};
    if (startDate) filter.purchaseDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.purchaseDate.$lte = end;
    }
  }
  if (supplierName) filter.supplierName = { $regex: supplierName, $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const [purchases, total] = await Promise.all([
    Purchase.find(filter)
      .populate('items.ingredientId', 'name unitType')
      .sort({ purchaseDate: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Purchase.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: purchases.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    purchases,
  });
};

/**
 * GET /api/purchases/:id
 */
exports.getById = async (req, res) => {
  const purchase = await Purchase.findById(req.params.id).populate('items.ingredientId', 'name unitType currentStock');
  if (!purchase) {
    return res.status(404).json({ success: false, message: 'عملية الشراء غير موجودة.' });
  }
  res.json({ success: true, purchase });
};

/**
 * POST /api/purchases
 * Creates purchase, updates ingredient stock (weighted avg), records cash transaction
 */
exports.createPurchase = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const { supplierName, items, paymentMethod = 'cash', paidFromCashBalance = true, notes, purchaseDate } = req.body;

  /* A branch portal supplies req.center; an admin may name a branch. Anything
     else is head office. This decides which till the money comes out of. */
  const centerId = req.center?._id
    || (mongoose.isValidObjectId(req.body.centerId) ? req.body.centerId : null);

  // Validate items and calculate total
  let totalPurchaseCost = 0;
  const processedItems = [];

  for (const item of items) {
    const ingredient = await Ingredient.findById(item.ingredientId);
    if (!ingredient) {
      return res.status(404).json({ success: false, message: `المكوّن غير موجود: ${item.ingredientId}` });
    }

    const costPerUnit = item.totalCost / item.quantity;
    totalPurchaseCost += item.totalCost;

    processedItems.push({
      ingredientId: ingredient._id,
      ingredientNameSnapshot: ingredient.name,
      quantity: item.quantity,
      unitType: item.unitType || ingredient.unitType,
      totalCost: item.totalCost,
      costPerUnit,
    });
  }

  // Create purchase record
  const purchase = await Purchase.create({
    centerId,
    supplierName,
    items: processedItems,
    totalPurchaseCost,
    paymentMethod,
    paidFromCashBalance,
    notes,
    purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
  });

  // Update ingredient stocks (weighted average cost)
  for (const item of processedItems) {
    await inventoryService.increaseIngredientStock(item.ingredientId, item.quantity, item.costPerUnit, centerId);
  }

  // Record cash transaction if paid from cash balance
  if (paidFromCashBalance) {
    await cashService.createTransaction(
      'purchase_expense',
      totalPurchaseCost,
      'out',
      `شراء من ${supplierName}`,
      'Purchase',
      purchase._id,
      centerId          // charge the branch's till, not the company total
    );
  }

  const populated = await Purchase.findById(purchase._id).populate('items.ingredientId', 'name unitType currentStock');

  res.status(201).json({ success: true, message: 'تم تسجيل عملية الشراء بنجاح.', purchase: populated });
};

/**
 * DELETE /api/purchases/:id
 */
exports.delete = async (req, res) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) {
    return res.status(404).json({ success: false, message: 'عملية الشراء غير موجودة.' });
  }

  if (req.center?._id && String(purchase.centerId) !== String(req.center._id)) {
    return res.status(403).json({ success: false, message: 'لا يمكنك عكس عملية فرع آخر.' });
  }
  if (purchase.reversedAt) return res.json({ success: true, message: 'العملية معكوسة مسبقاً.', purchase });

  try {
    for (const item of purchase.items) {
      await inventoryService.decreaseIngredientStock(item.ingredientId, item.quantity, purchase.centerId);
    }
  } catch (err) {
    return res.status(409).json({ success: false, message: `تعذر عكس الشراء: ${err.message}` });
  }

  if (purchase.paidFromCashBalance && purchase.totalPurchaseCost > 0) {
    await cashService.createTransaction(
      'adjustment', purchase.totalPurchaseCost, 'in',
      `عكس شراء من ${purchase.supplierName}`,
      'Purchase', purchase._id, purchase.centerId
    );
  }
  purchase.reversedAt = new Date();
  purchase.reversalReason = req.body?.reason || 'عكس العملية';
  purchase.reversedBy = req.user?.name || req.center?.name || '';
  await purchase.save();
  res.json({ success: true, message: 'تم عكس الشراء والمخزون والكاش دون حذف السجل.', purchase });
};

// Alias for route
exports.create = exports.createPurchase;
exports.update = async (req, res) => {
  res.status(400).json({ success: false, message: 'تعديل عمليات الشراء غير مدعوم. يُرجى الحذف وإعادة الإنشاء.' });
};
