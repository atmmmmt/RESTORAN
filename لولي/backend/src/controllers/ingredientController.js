'use strict';

const { validationResult } = require('express-validator');
const Ingredient = require('../models/Ingredient');

/**
 * GET /api/ingredients
 */
exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  } else {
    filter.isActive = true;
  }

  if (req.query.search) {
    filter.name = { $regex: req.query.search, $options: 'i' };
  }

  const ingredients = await Ingredient.find(filter).sort({ name: 1 });

  const withAlerts = ingredients.map((ing) => {
    const obj = ing.toJSON();
    obj.lowStockAlert = ing.currentStock <= ing.lowStockThreshold;
    return obj;
  });

  res.json({ success: true, count: withAlerts.length, ingredients: withAlerts });
};

/**
 * GET /api/ingredients/:id
 */
exports.getById = async (req, res) => {
  const ingredient = await Ingredient.findById(req.params.id);
  if (!ingredient) {
    return res.status(404).json({ success: false, message: 'المكوّن غير موجود.' });
  }

  const obj = ingredient.toJSON();
  obj.lowStockAlert = ingredient.currentStock <= ingredient.lowStockThreshold;

  res.json({ success: true, ingredient: obj });
};

/**
 * POST /api/ingredients
 */
exports.create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const { name, unitType, currentStock, averageCostPerUnit, nutritionPerUnit, lowStockThreshold, notes } = req.body;

  const ingredient = await Ingredient.create({
    name,
    unitType,
    currentStock: currentStock || 0,
    averageCostPerUnit: averageCostPerUnit || 0,
    nutritionPerUnit: nutritionPerUnit || {},
    lowStockThreshold: lowStockThreshold || 0,
    notes,
  });

  res.status(201).json({ success: true, message: 'تم إنشاء المكوّن بنجاح.', ingredient });
};

/**
 * PUT /api/ingredients/:id
 */
exports.update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const ingredient = await Ingredient.findById(req.params.id);
  if (!ingredient) {
    return res.status(404).json({ success: false, message: 'المكوّن غير موجود.' });
  }

  const allowedFields = ['name', 'unitType', 'nutritionPerUnit', 'lowStockThreshold', 'notes', 'isActive'];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      ingredient[field] = req.body[field];
    }
  }

  await ingredient.save();

  res.json({ success: true, message: 'تم تحديث المكوّن بنجاح.', ingredient });
};

/**
 * DELETE /api/ingredients/:id (soft delete)
 */
exports.delete = async (req, res) => {
  const ingredient = await Ingredient.findById(req.params.id);
  if (!ingredient) {
    return res.status(404).json({ success: false, message: 'المكوّن غير موجود.' });
  }

  ingredient.isActive = false;
  await ingredient.save();

  res.json({ success: true, message: 'تم حذف المكوّن بنجاح (حذف ناعم).' });
};
