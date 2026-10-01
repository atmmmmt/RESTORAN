'use strict';

const CustomerOrder = require('../models/CustomerOrder');
const Product       = require('../models/Product');
const Offer         = require('../models/Offer');
const cacheService  = require('../services/cacheService');
const cashService   = require('../services/cashService');

exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    CustomerOrder.find(filter)
      .populate('productId', 'name image directPrice')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CustomerOrder.countDocuments(filter),
  ]);

  res.json({ success: true, orders, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
};

exports.create = async (req, res) => {
  const { productId, quantity, customerName, customerPhone, deliveryLocation, notes, channel } = req.body;

  if (!productId || !quantity || !customerName || !customerPhone) {
    return res.status(400).json({ success: false, message: 'productId, quantity, customerName, customerPhone مطلوبة.' });
  }

  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
  }

  const now = new Date();
  const activeOffer = await Offer.findOne({
    productId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  let unitPrice = product.directPrice;
  let discountAmount = 0;

  if (activeOffer) {
    if (activeOffer.discountType === 'percentage') {
      discountAmount = unitPrice * (activeOffer.discountValue / 100) * Number(quantity);
    } else {
      discountAmount = activeOffer.discountValue * Number(quantity);
    }
  }

  const totalAmount = unitPrice * Number(quantity) - discountAmount;

  const order = await CustomerOrder.create({
    productId,
    productNameSnapshot: product.name,
    quantity: Number(quantity),
    unitPrice,
    discountAmount,
    totalAmount,
    customerName,
    phone: customerPhone,
    location: deliveryLocation,
    notes,
    status: 'new',
  });

  res.status(201).json({ success: true, message: 'تم استلام الطلب بنجاح.', order });
};

exports.updateStatus = async (req, res) => {
  const order = await CustomerOrder.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'الطلب غير موجود.' });
  }

  const { status } = req.body;
  const allowed = ['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: 'حالة غير صالحة.' });
  }

  const prevStatus = order.status;
  order.status = status;

  if (status === 'delivered' && prevStatus !== 'delivered') {
    // 1. Add income to cash
    await cashService.createTransaction(
      'sale_income',
      order.totalAmount,
      'in',
      `طلب واتساب: ${order.productNameSnapshot} × ${order.quantity} — ${order.customerName}`,
      'CustomerOrder',
      order._id
    );
    // 2. Deduct from product available quantity
    await Product.findByIdAndUpdate(order.productId, {
      $inc: { availableQuantity: -order.quantity },
    });
  }

  // If cancelled after being delivered — reverse deduction
  if (status === 'cancelled' && prevStatus === 'delivered') {
    await Product.findByIdAndUpdate(order.productId, {
      $inc: { availableQuantity: order.quantity },
    });
  }

  await order.save();
  cacheService.invalidate('products:');
  res.json({ success: true, message: 'تم تحديث حالة الطلب.', order });
};

/**
 * DELETE /api/orders/:id — admin only.
 * A delivered order already moved stock and cash, so both are undone first
 * (stock returned, income reversed with a journal entry) before removal.
 */
exports.remove = async (req, res) => {
  const order = await CustomerOrder.findById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, message: 'الطلب غير موجود.' });
  }

  if (order.status === 'delivered') {
    await Product.findByIdAndUpdate(order.productId, { $inc: { availableQuantity: order.quantity } });
    await cashService.createTransaction(
      'adjustment',
      order.totalAmount,
      'out',
      `حذف طلب واتساب: ${order.productNameSnapshot} × ${order.quantity} — ${order.customerName}`,
      'CustomerOrder',
      order._id
    );
  }

  await order.deleteOne();
  cacheService.invalidate('products:');
  res.json({ success: true, message: 'تم حذف الطلب.' });
};
