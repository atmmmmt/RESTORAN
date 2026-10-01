'use strict';

const CustomerOrder = require('../models/CustomerOrder');
const Product       = require('../models/Product');
const Offer         = require('../models/Offer');
const SalesCenter   = require('../models/SalesCenter');
const cashService   = require('../services/cashService');
const whatsappService = require('../services/whatsappService');
const inventoryService = require('../services/inventoryService');

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
  const { productId, quantity, customerName, customerPhone, deliveryLocation, deliveryMethod, notes, channel, centerId } = req.body;

  if (!productId || !quantity || !customerName || !customerPhone) {
    return res.status(400).json({ success: false, message: 'productId, quantity, customerName, customerPhone مطلوبة.' });
  }

  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
  }

  // اختيار الفرع اختياري — إذا الزبون اختار فرع، نجيب بياناته لحفظ اسمه ولإرسال
  // إشعار واتساب لاحقًا لمدير الفرع المعني (فعليًا فقط لما تتوفر إعدادات واتساب بالـ env).
  let center = null;
  if (centerId) {
    center = await SalesCenter.findById(centerId);
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
  const unitCost = Number(product.calculatedCost) || 0;

  const order = await CustomerOrder.create({
    productId,
    productNameSnapshot: product.name,
    quantity: Number(quantity),
    unitPrice,
    unitCost,
    totalCost: unitCost * Number(quantity),
    profit: totalAmount - unitCost * Number(quantity),
    discountAmount,
    totalPrice: totalAmount,
    customerName,
    phone: customerPhone,
    location: deliveryLocation,
    deliveryMethod: deliveryMethod || 'delivery',
    notes,
    status: 'new',
    centerId: center ? center._id : null,
    centerNameSnapshot: center ? center.name : '',
  });

  // إشعار واتساب فوري لمدير الفرع (no-op بهدوء إذا إعدادات واتساب غير مكتملة).
  if (center && center.phone) {
    const message = whatsappService.buildOrderNotificationMessage({
      customerName,
      phone: customerPhone,
      productName: product.name,
      quantity,
      deliveryMethod,
      location: deliveryLocation,
    });
    whatsappService.sendOrderNotification(center.phone, message);
  }

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
  if (status === 'delivered' && !order.stockApplied) {
    try {
      await inventoryService.decreaseProductStock(order.productId, order.quantity, order.centerId);
      order.stockApplied = true;
    } catch (err) {
      return res.status(409).json({ success: false, message: err.message });
    }
  }
  if (status === 'delivered' && !order.cashPosted) {
    // 1. Add income to cash
    await cashService.createTransaction(
      'sale_income',
      order.totalPrice,
      'in',
      `طلب واتساب: ${order.productNameSnapshot} × ${order.quantity} — ${order.customerName}`,
      'CustomerOrder',
      order._id,
      order.centerId
    );
    order.cashPosted = true;
  }

  if (status === 'cancelled' && order.stockApplied) {
    await inventoryService.increaseProductStock(order.productId, order.quantity, order.centerId);
    order.stockApplied = false;
  }
  if (status === 'cancelled' && order.cashPosted) {
    await cashService.createTransaction(
      'adjustment', order.totalPrice, 'out',
      `عكس طلب ${order.productNameSnapshot} × ${order.quantity}`,
      'CustomerOrder', order._id, order.centerId
    );
    order.cashPosted = false;
    order.reversedAt = new Date();
  }

  order.status = status;
  await order.save();
  res.json({ success: true, message: 'تم تحديث حالة الطلب.', order });
};
