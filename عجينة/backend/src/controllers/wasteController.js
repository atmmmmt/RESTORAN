'use strict';

const { validationResult } = require('express-validator');
const mongoose = require('mongoose');
const WasteRecord = require('../models/WasteRecord');
const Product = require('../models/Product');
const Ingredient = require('../models/Ingredient');
const inventoryService = require('../services/inventoryService');

/**
 * GET /api/waste
 */
exports.getAll = async (req, res) => {
  const { type, reason, startDate, endDate, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (type) filter.type = type;
  if (reason) filter.reason = reason;

  /* Branch scope. A branch portal only ever sees its own losses; an admin
     may filter, and 'hq' means the central kitchen's own waste. */
  if (req.center?._id) {
    filter.centerId = req.center._id;
  } else if (req.query.center && req.query.center !== 'all') {
    filter.centerId = req.query.center === 'hq' ? null : req.query.center;
  }
  if (startDate || endDate) {
    filter.wasteDate = {};
    if (startDate) filter.wasteDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.wasteDate.$lte = end;
    }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [waste, total] = await Promise.all([
    WasteRecord.find(filter)
      .populate('productId', 'name')
      .populate('ingredientId', 'name unitType')
      .sort({ wasteDate: -1 })
      .skip(skip)
      .limit(Number(limit)),
    WasteRecord.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: waste.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    waste,
  });
};

/**
 * GET /api/waste/:id
 */
exports.getById = async (req, res) => {
  const record = await WasteRecord.findById(req.params.id)
    .populate('productId', 'name calculatedCost')
    .populate('ingredientId', 'name unitType averageCostPerUnit');

  if (!record) {
    return res.status(404).json({ success: false, message: 'سجل الهدر غير موجود.' });
  }
  res.json({ success: true, waste: record });
};

/**
 * POST /api/waste
 */
exports.createWaste = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const { type, productId, ingredientId, nameSnapshot, quantity, unitType, reason, estimatedUnitCost, notes, wasteDate } = req.body;

  /* A branch portal passes its own id via req.center; an admin may name a
     branch explicitly. Anything else is head office. */
  const centerId = req.center?._id
    || (mongoose.isValidObjectId(req.body.centerId) ? req.body.centerId : null);

  let actualUnitCost = estimatedUnitCost || 0;
  let resolvedName = nameSnapshot;

  if (type === 'product') {
    if (!productId) {
      return res.status(400).json({ success: false, message: 'يجب تحديد المنتج لهدر المنتجات.' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
    }

    resolvedName = resolvedName || product.name;
    actualUnitCost = actualUnitCost || product.calculatedCost || 0;

    await inventoryService.decreaseProductStock(productId, quantity, centerId);

  } else if (type === 'ingredient') {
    if (!ingredientId) {
      return res.status(400).json({ success: false, message: 'يجب تحديد المكوّن لهدر المكوّنات.' });
    }

    const ingredient = await Ingredient.findById(ingredientId);
    if (!ingredient) {
      return res.status(404).json({ success: false, message: 'المكوّن غير موجود.' });
    }

    resolvedName = resolvedName || ingredient.name;
    actualUnitCost = actualUnitCost || ingredient.averageCostPerUnit || 0;

    await inventoryService.decreaseIngredientStock(ingredientId, quantity, centerId);
  }

  const totalLossCost = actualUnitCost * quantity;

  const waste = await WasteRecord.create({
    type,
    productId: type === 'product' ? productId : undefined,
    ingredientId: type === 'ingredient' ? ingredientId : undefined,
    nameSnapshot: resolvedName,
    quantity,
    unitType,
    reason,
    estimatedUnitCost: actualUnitCost,
    totalLossCost,
    notes,
    centerId,
    wasteDate: wasteDate ? new Date(wasteDate) : new Date(),
  });

  res.status(201).json({
    success: true,
    message: `تم تسجيل هدر ${quantity} وحدة من "${resolvedName}". الخسارة: ${totalLossCost.toLocaleString()} ل.س`,
    waste,
    impact: { totalLossCost },
  });
};

exports.create = exports.createWaste;

/**
 * GET /api/waste/by-center — loss per branch for a date range.
 * Answers "which site is losing me the most?", which the flat total can't.
 */
exports.getByCenter = async (req, res) => {
  const SalesCenter = require('../models/SalesCenter');

  const match = {};
  if (req.query.startDate || req.query.endDate) {
    match.wasteDate = {};
    if (req.query.startDate) match.wasteDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      match.wasteDate.$lte = end;
    }
  }

  const rows = await WasteRecord.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    {
      $group: {
        _id: '$centerId',
        totalLoss: { $sum: '$totalLossCost' },
        records: { $sum: 1 },
        quantity: { $sum: '$quantity' },
      },
    },
    { $sort: { totalLoss: -1 } },
  ]);

  const ids = rows.map(r => r._id).filter(Boolean);
  const centers = await SalesCenter.find({ _id: { $in: ids } }).select('name');
  const nameById = new Map(centers.map(c => [String(c._id), c.name]));

  const breakdown = rows.map(r => ({
    centerId: r._id || null,
    name: r._id ? (nameById.get(String(r._id)) || 'فرع محذوف') : 'المركز الرئيسي',
    totalLoss: r.totalLoss,
    records: r.records,
    quantity: r.quantity,
  }));

  res.json({
    success: true,
    breakdown,
    total: breakdown.reduce((s, b) => s + b.totalLoss, 0),
  });
};

/**
 * PUT /api/waste/:id
 */
exports.update = async (req, res) => {
  const record = await WasteRecord.findById(req.params.id);
  if (!record) {
    return res.status(404).json({ success: false, message: 'سجل الهدر غير موجود.' });
  }

  if (req.body.notes !== undefined) record.notes = req.body.notes;
  if (req.body.reason) record.reason = req.body.reason;

  await record.save();
  res.json({ success: true, message: 'تم تحديث سجل الهدر.', waste: record });
};

/**
 * DELETE /api/waste/:id
 */
exports.delete = async (req, res) => {
  const record = await WasteRecord.findById(req.params.id);
  if (!record) {
    return res.status(404).json({ success: false, message: 'سجل الهدر غير موجود.' });
  }

  if (req.center?._id && String(record.centerId) !== String(req.center._id)) {
    return res.status(403).json({ success: false, message: 'لا يمكنك عكس سجل فرع آخر.' });
  }
  if (record.reversedAt) return res.json({ success: true, message: 'السجل معكوس مسبقاً.', waste: record });

  if (record.type === 'product') {
    await inventoryService.increaseProductStock(record.productId, record.quantity, record.centerId);
  } else {
    await inventoryService.increaseIngredientStock(
      record.ingredientId, record.quantity, record.estimatedUnitCost || 0, record.centerId
    );
  }
  record.reversedAt = new Date();
  record.reversalReason = req.body?.reason || 'عكس الهدر';
  record.reversedBy = req.user?.name || req.center?.name || '';
  await record.save();
  res.json({ success: true, message: 'تم عكس الهدر وإرجاع المخزون دون حذف السجل.', waste: record });
};
