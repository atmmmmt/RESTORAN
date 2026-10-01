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

  const UNITS = ['gram', 'kg', 'ml', 'liter', 'piece'];

  for (const item of items) {
    /* A purchase line may bring a brand-new ingredient (typed straight into
       the purchase form) instead of picking one that already exists — so
       buying something new doesn't mean a trip to the ingredients page first.
       An existing ingredient with the same name is reused, not duplicated. */
    let ingredient = null;
    if (item.ingredientId) {
      ingredient = await Ingredient.findById(item.ingredientId);
    } else if (item.newIngredientName && String(item.newIngredientName).trim()) {
      const name = String(item.newIngredientName).trim();
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      ingredient = await Ingredient.findOne({ name: { $regex: `^${escaped}$`, $options: 'i' } });
      if (!ingredient) {
        if (!UNITS.includes(item.unitType)) {
          return res.status(400).json({ success: false, message: `اختر وحدة القياس للمكوّن "${name}"` });
        }
        ingredient = await Ingredient.create({ name, unitType: item.unitType, currentStock: 0 });
      }
    }
    if (!ingredient) {
      return res.status(404).json({ success: false, message: 'اختر مكوّناً أو اكتب اسم مكوّن جديد لكل سطر.' });
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
    await inventoryService.increaseIngredientStock(item.ingredientId, item.quantity, item.costPerUnit);
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

  /* Deleting a purchase must undo what recording it did: take the quantities
     back out of stock, and — if it was paid from the till — put the money
     back with a journal entry, so the cash log still shows what happened. */
  for (const item of purchase.items || []) {
    const ingredient = await Ingredient.findById(item.ingredientId);
    if (!ingredient) continue;
    const removed = Math.min(ingredient.currentStock || 0, item.quantity);
    ingredient.currentStock = (ingredient.currentStock || 0) - removed;
    ingredient.totalPurchasedQuantity = Math.max(0, (ingredient.totalPurchasedQuantity || 0) - item.quantity);
    ingredient.totalPurchasedCost = Math.max(0, (ingredient.totalPurchasedCost || 0) - (item.totalCost || 0));
    await ingredient.save();
  }

  if (purchase.paidFromCashBalance && purchase.totalPurchaseCost > 0) {
    await cashService.createTransaction(
      'adjustment',
      purchase.totalPurchaseCost,
      'in',
      `حذف عملية شراء من ${purchase.supplierName}`,
      'Purchase',
      purchase._id,
      purchase.centerId || null
    );
  }

  await purchase.deleteOne();
  res.json({ success: true, message: 'تم حذف عملية الشراء وإرجاع المبلغ للصندوق.' });
};

/**
 * PUT /api/purchases/:id
 * Reverses the original purchase's stock/cash effect, then re-applies it as if
 * the corrected items had been purchased fresh — same math as create/delete,
 * just back-to-back, so an admin can fix a typo without deleting history.
 */
exports.update = async (req, res) => {
  const purchase = await Purchase.findById(req.params.id);
  if (!purchase) {
    return res.status(404).json({ success: false, message: 'عملية الشراء غير موجودة.' });
  }

  const { supplierName, items, paymentMethod = 'cash', paidFromCashBalance = true, notes, purchaseDate } = req.body;
  const UNITS = ['gram', 'kg', 'ml', 'liter', 'piece'];

  // ── undo the old purchase's effect on stock ──
  for (const item of purchase.items || []) {
    const ingredient = await Ingredient.findById(item.ingredientId);
    if (!ingredient) continue;
    const removed = Math.min(ingredient.currentStock || 0, item.quantity);
    ingredient.currentStock = (ingredient.currentStock || 0) - removed;
    ingredient.totalPurchasedQuantity = Math.max(0, (ingredient.totalPurchasedQuantity || 0) - item.quantity);
    ingredient.totalPurchasedCost = Math.max(0, (ingredient.totalPurchasedCost || 0) - (item.totalCost || 0));
    await ingredient.save();
  }
  // ── undo its effect on cash ──
  if (purchase.paidFromCashBalance && purchase.totalPurchaseCost > 0) {
    await cashService.createTransaction(
      'adjustment',
      purchase.totalPurchaseCost,
      'in',
      `تعديل عملية شراء من ${purchase.supplierName}`,
      'Purchase',
      purchase._id,
      purchase.centerId || null
    );
  }

  // ── apply the corrected items, same validation/resolution as create ──
  let totalPurchaseCost = 0;
  const processedItems = [];
  for (const item of items) {
    let ingredient = null;
    if (item.ingredientId) {
      ingredient = await Ingredient.findById(item.ingredientId);
    } else if (item.newIngredientName && String(item.newIngredientName).trim()) {
      const name = String(item.newIngredientName).trim();
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      ingredient = await Ingredient.findOne({ name: { $regex: `^${escaped}$`, $options: 'i' } });
      if (!ingredient) {
        if (!UNITS.includes(item.unitType)) {
          return res.status(400).json({ success: false, message: `اختر وحدة القياس للمكوّن "${name}"` });
        }
        ingredient = await Ingredient.create({ name, unitType: item.unitType, currentStock: 0 });
      }
    }
    if (!ingredient) {
      return res.status(404).json({ success: false, message: 'اختر مكوّناً أو اكتب اسم مكوّن جديد لكل سطر.' });
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

  purchase.supplierName = supplierName;
  purchase.items = processedItems;
  purchase.totalPurchaseCost = totalPurchaseCost;
  purchase.paymentMethod = paymentMethod;
  purchase.paidFromCashBalance = paidFromCashBalance;
  purchase.notes = notes;
  if (purchaseDate) purchase.purchaseDate = new Date(purchaseDate);
  await purchase.save();

  for (const item of processedItems) {
    await inventoryService.increaseIngredientStock(item.ingredientId, item.quantity, item.costPerUnit);
  }

  if (paidFromCashBalance) {
    await cashService.createTransaction(
      'purchase_expense',
      totalPurchaseCost,
      'out',
      `شراء من ${supplierName}`,
      'Purchase',
      purchase._id,
      purchase.centerId || null
    );
  }

  const populated = await Purchase.findById(purchase._id).populate('items.ingredientId', 'name unitType currentStock');
  res.json({ success: true, message: 'تم تعديل عملية الشراء بنجاح.', purchase: populated });
};

// Alias for route
exports.create = exports.createPurchase;
