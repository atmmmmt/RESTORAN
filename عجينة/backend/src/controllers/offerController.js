'use strict';

const Offer = require('../models/Offer');
const Product = require('../models/Product');
const cacheService = require('../services/cacheService');

exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

  const offers = await Offer.find(filter)
    .populate('productId', 'name image directPrice')
    .sort({ createdAt: -1 });

  res.json({ success: true, count: offers.length, offers });
};

exports.getPublic = async (req, res) => {
  const now = new Date();
  const offers = await Offer.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).populate('productId', 'name image directPrice description');

  res.json({ success: true, count: offers.length, offers });
};

exports.create = async (req, res) => {
  const { productId, title, description, discountType, discountValue, startDate, endDate, image, isActive } = req.body;

  if (!productId || !title || !discountType || !discountValue || !startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة.' });
  }

  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
  }

  const offer = await Offer.create({
    productId,
    title,
    description,
    discountType,
    discountValue: Number(discountValue),
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    image,
    isActive: isActive !== undefined ? isActive : true,
  });

  await offer.populate('productId', 'name image directPrice');
  cacheService.del('offers:public');
  cacheService.invalidate('products:');
  res.status(201).json({ success: true, message: 'تم إنشاء العرض بنجاح.', offer });
};

exports.update = async (req, res) => {
  const offer = await Offer.findById(req.params.id);
  if (!offer) {
    return res.status(404).json({ success: false, message: 'العرض غير موجود.' });
  }

  const allowed = ['title', 'description', 'discountType', 'discountValue', 'startDate', 'endDate', 'image', 'isActive'];
  for (const field of allowed) {
    if (req.body[field] !== undefined) offer[field] = req.body[field];
  }

  await offer.save();
  await offer.populate('productId', 'name image directPrice');
  cacheService.del('offers:public');
  cacheService.invalidate('products:');
  res.json({ success: true, message: 'تم تحديث العرض بنجاح.', offer });
};

exports.delete = async (req, res) => {
  const offer = await Offer.findById(req.params.id);
  if (!offer) {
    return res.status(404).json({ success: false, message: 'العرض غير موجود.' });
  }
  await offer.deleteOne();
  cacheService.del('offers:public');
  cacheService.invalidate('products:');
  res.json({ success: true, message: 'تم حذف العرض.' });
};
