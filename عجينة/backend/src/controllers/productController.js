'use strict';

const { validationResult } = require('express-validator');
const Product = require('../models/Product');
const Offer = require('../models/Offer');
const CustomerOrder = require('../models/CustomerOrder');
const cloudinary = require('../config/cloudinary');
const cacheService = require('../services/cacheService');
const { SPACE_TYPES, BODY_TRACKED_TYPES } = require('../models/schemas/virtualTryOnSchema');

/** Delete a Cloudinary image safely (skip emojis / non-cloud IDs) */
async function deleteCloudinaryImage(publicId) {
  if (!publicId || !publicId.startsWith('luliz/')) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    console.log(`🗑️  صورة محذوفة من Cloudinary: ${publicId}`);
  } catch (err) {
    console.error('تحذير: فشل حذف صورة Cloudinary:', err.message);
  }
}

/**
 * GET /api/products
 */
exports.getAll = async (req, res) => {
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.showInTodayMenu !== undefined) {
    filter.showInTodayMenu = req.query.showInTodayMenu === 'true';
  }
  if (req.query.search) {
    /* Escaped: a search for "(" or "*" must match the character, not throw
       a regex error or match everything. */
    const term = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    /* Name or category — people type the section they want ('مناقيش') as
       often as the dish, and product names rarely repeat it. */
    filter.$or = [
      { name:     { $regex: term, $options: 'i' } },
      { category: { $regex: term, $options: 'i' } },
    ];
  }

  let query = Product.find(filter).sort({ createdAt: -1 });
  if (req.user?.role === 'cashier') {
    query = query.select('name image category kitchenSection directPrice availableQuantity status showInTodayMenu');
  } else {
    query = query.populate('ingredients.ingredientId', 'name unitType currentStock averageCostPerUnit');
  }

  /* Paginate only when the caller asks for a page. */
  if (req.query.page !== undefined) {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 100);
    const total = await Product.countDocuments(filter);
    const pages = Math.max(Math.ceil(total / limit), 1);
    const page  = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), pages);

    const products = await query.skip((page - 1) * limit).limit(limit);
    return res.json({ success: true, count: products.length, total, page, pages, limit, products });
  }

  const products = await query;
  res.json({ success: true, count: products.length, total: products.length, products });
};

/**
 * GET /api/products/public — available + today menu + active offers
 */
exports.getPublic = async (req, res) => {
  const now = new Date();

  const products = await Product.find({
    status: 'available',
    showInTodayMenu: true,
  }).select('-ingredients.costSnapshot -ingredients.nutritionSnapshot').sort({ name: 1 });

  const offers = await Offer.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  const offerMap = {};
  offers.forEach((o) => {
    offerMap[o.productId.toString()] = o;
  });

  const productsWithOffers = products.map((p) => {
    const obj = p.toJSON();
    obj.activeOffer = offerMap[p._id.toString()] || null;
    if (obj.activeOffer) {
      if (obj.activeOffer.discountType === 'percentage') {
        obj.discountedPrice = p.directPrice * (1 - obj.activeOffer.discountValue / 100);
      } else {
        obj.discountedPrice = Math.max(0, p.directPrice - obj.activeOffer.discountValue);
      }
    }

    /* Try-on summary is inlined so a menu of N products costs zero extra
       requests. Only the handful of fields the button needs to decide
       whether to render — the full calibration is fetched on open. */
    const vto = obj.virtualTryOn;
    obj.virtualTryOn = vto && vto.enabled && vto.status === 'ready' && vto.model3DUrl
      ? {
        enabled: true,
        type: vto.type,
        status: vto.status,
        isViewable: true,
        mode: SPACE_TYPES.includes(vto.type) ? 'space'
          : BODY_TRACKED_TYPES.includes(vto.type) ? 'body' : 'none',
        model3DUrl: vto.model3DUrl,
        iosModelUrl: vto.iosModelUrl || '',
        previewImageUrl: vto.previewImageUrl || '',
        placement: vto.placement || 'floor',
      }
      : null;

    return obj;
  });

  res.json({ success: true, count: productsWithOffers.length, products: productsWithOffers });
};

/**
 * GET /api/products/today — today's menu
 */
exports.getToday = async (req, res) => {
  return exports.getPublic(req, res);
};

/**
 * GET /api/products/public/:id — safe storefront product detail.
 * Deliberately excludes recipe costs, internal notes and stock accounting data.
 */
exports.getPublicById = async (req, res) => {
  const product = await Product.findOne({
    _id: req.params.id,
    status: 'available',
    showInTodayMenu: true,
  }).select('-ingredients -packagingCost -extraCost -calculatedCost -regularCenterPrice -specializedCenterDefaultCommissionPercent -notes');

  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود أو غير متاح حاليًا.' });
  }

  const now = new Date();
  const activeOffer = await Offer.findOne({
    productId: product._id,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  const result = product.toJSON();
  result.activeOffer = activeOffer || null;
  if (activeOffer) {
    result.discountedPrice = activeOffer.discountType === 'percentage'
      ? product.directPrice * (1 - activeOffer.discountValue / 100)
      : Math.max(0, product.directPrice - activeOffer.discountValue);
  }

  res.json({ success: true, product: result });
};

/**
 * GET /api/products/:id
 */
exports.getById = async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('ingredients.ingredientId', 'name unitType currentStock averageCostPerUnit nutritionPerUnit');

  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
  }

  res.json({ success: true, product });
};

/**
 * POST /api/products
 */
exports.create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const {
    name, image, imagePublicId, description, category, kitchenSection, ingredients, packagingCost, extraCost,
    nutrition, directPrice, regularCenterPrice, specializedCenterDefaultCommissionPercent,
    availableQuantity, status, showInTodayMenu, allergyNotes, notes,
  } = req.body;

  const product = await Product.create({
    name,
    image,
    imagePublicId: imagePublicId || null,
    description,
    category,
    kitchenSection: kitchenSection || '',
    ingredients: ingredients || [],
    packagingCost: packagingCost || 0,
    extraCost: extraCost || 0,
    nutrition: nutrition || {},
    directPrice: directPrice || 0,
    regularCenterPrice: regularCenterPrice || 0,
    specializedCenterDefaultCommissionPercent: specializedCenterDefaultCommissionPercent || 20,
    availableQuantity: availableQuantity || 0,
    status: status || 'available',
    showInTodayMenu: showInTodayMenu !== undefined ? showInTodayMenu : true,
    allergyNotes,
    notes,
  });

  cacheService.invalidate('products:');
  res.status(201).json({ success: true, message: 'تم إنشاء المنتج بنجاح.', product });
};

/**
 * PUT /api/products/:id
 */
exports.update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
  }

  const allowedFields = [
    'name', 'image', 'imagePublicId', 'description', 'category', 'kitchenSection', 'ingredients', 'packagingCost',
    'extraCost', 'nutrition', 'directPrice', 'regularCenterPrice',
    'specializedCenterDefaultCommissionPercent', 'availableQuantity',
    'status', 'showInTodayMenu', 'allergyNotes', 'notes',
  ];

  // Keep the old file alive until the database update succeeds.
  const oldImage = product.image;
  const oldImagePublicId = product.imagePublicId;
  const imageIsChanging = req.body.image !== undefined && req.body.image !== oldImage;

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  }

  // Mark ingredients as modified to trigger pre-save hook
  if (req.body.ingredients !== undefined) {
    product.markModified('ingredients');
  }

  await product.save();

  if (imageIsChanging && oldImagePublicId && oldImagePublicId !== product.imagePublicId) {
    await deleteCloudinaryImage(oldImagePublicId);
  }

  cacheService.invalidate('products:');
  res.json({ success: true, message: 'تم تحديث المنتج بنجاح.', product });
};

/**
 * DELETE /api/products/:id
 */
exports.delete = async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
  }

  // Check for active orders
  const activeOrders = await CustomerOrder.countDocuments({
    productId: req.params.id,
    status: { $in: ['new', 'confirmed', 'preparing'] },
  });

  if (activeOrders > 0) {
    return res.status(400).json({
      success: false,
      message: `لا يمكن حذف المنتج. يوجد ${activeOrders} طلب نشط مرتبط به.`,
    });
  }

  product.status = 'hidden';
  product.showInTodayMenu = false;
  await product.save();

  cacheService.invalidate('products:');
  res.json({ success: true, message: 'تم إخفاء المنتج بنجاح.' });

};

/**
 * DELETE /api/products/:id/permanent — erase a product.
 *
 * Anything that recorded money or stock against the product blocks this:
 * deleting it would leave those rows pointing at nothing and quietly break
 * the reports built on them. "Hide" is the answer for those. Configuration
 * that merely lists the product (offers, branch menus, branch stock rows) is
 * cleaned up instead, since it has no meaning without the product.
 */
exports.purge = async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
  }

  const id = product._id;
  const model = name => require('../models/' + name);

  const history = [
    ['مبيعات',          model('Sale'),             { productId: id }],
    ['مبيعات فروع',     model('CenterSale'),       { productId: id }],
    ['طلبات زبائن',     model('CustomerOrder'),    { productId: id }],
    ['طلبات داخلية',    model('InternalOrder'),    { 'items.productId': id }],
    ['إنتاج',           model('ProductionBatch'),  { productId: id }],
    ['هدر',             model('WasteRecord'),      { productId: id }],
    ['توريد للفروع',    model('CenterDelivery'),   { 'items.productId': id }],
    ['تسويات فروع',     model('CenterSettlement'), { $or: [{ 'soldItems.productId': id }, { 'returnedItems.productId': id }] }],
  ];

  const counts = await Promise.all(history.map(([, M, q]) => M.countDocuments(q)));
  const used = history.map(([label], i) => [label, counts[i]]).filter(([, n]) => n > 0);

  if (used.length) {
    return res.status(409).json({
      success: false,
      references: Object.fromEntries(used),
      message: 'لا يمكن حذف المنتج نهائياً — مرتبط بـ ' +
        used.map(([label, n]) => n + ' ' + label).join('، ') +
        '. استخدم «إخفاء» بدلاً من ذلك.',
    });
  }

  await Promise.all([
    model('Offer').deleteMany({ productId: id }),
    model('BranchInventory').deleteMany({ productId: id }),
    model('SalesCenter').updateMany({}, {
      $pull: {
        inventory: { productId: id },
        availableProducts: id,
        unavailableProductIds: id,
      },
    }),
  ]);

  if (product.imagePublicId) {
    await cloudinary.uploader.destroy(product.imagePublicId).catch(() => { /* litter, not a failure */ });
  }

  await product.deleteOne();
  cacheService.invalidate('products:');
  res.json({ success: true, message: 'تم حذف المنتج نهائياً.' });
};
