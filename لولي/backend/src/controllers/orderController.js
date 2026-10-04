'use strict';

const CustomerOrder = require('../models/CustomerOrder');
const Product       = require('../models/Product');
const Offer         = require('../models/Offer');
const SalesCenter   = require('../models/SalesCenter');
const cacheService  = require('../services/cacheService');
const cashService   = require('../services/cashService');
const financeService = require('../services/financeService');

exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.center && req.query.center !== 'all') {
    filter.centerId = req.query.center === 'hq' ? null : req.query.center;
  }
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
  const {
    productId, quantity, customerName, customerPhone,
    deliveryLocation, deliveryMethod, notes, centerId,
  } = req.body;

  if (!productId || !quantity || !customerName || !customerPhone) {
    return res.status(400).json({ success: false, message: 'productId, quantity, customerName, customerPhone مطلوبة.' });
  }

  const product = await Product.findById(productId);
  if (!product) return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });

  let center = null;
  if (centerId) center = await SalesCenter.findById(centerId);

  const now = new Date();
  const activeOffer = await Offer.findOne({
    productId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  const qty = Number(quantity);
  const unitPrice = Number(product.directPrice) || 0;
  let discountAmount = 0;
  if (activeOffer) {
    if (activeOffer.discountType === 'percentage') {
      discountAmount = unitPrice * (activeOffer.discountValue / 100) * qty;
    } else {
      discountAmount = activeOffer.discountValue * qty;
    }
  }

  const restaurantAmount = Math.max(unitPrice * qty - discountAmount, 0);
  const taxQuote = await financeService.quote(restaurantAmount, center?._id || null);
  const unitCost = Number(product.calculatedCost) || 0;
  const totalCost = unitCost * qty;

  const order = await CustomerOrder.create({
    productId,
    productNameSnapshot: product.name,
    quantity: qty,
    unitPrice,
    unitCost,
    totalCost,
    profit: taxQuote.baseAmount - totalCost,
    discountAmount,
    netAmount: taxQuote.baseAmount,
    invoiceTaxPercent: taxQuote.invoiceTaxPercent,
    invoiceTaxAmount: taxQuote.invoiceTaxAmount,
    consumptionTaxPercent: taxQuote.consumptionTaxPercent,
    consumptionTaxAmount: taxQuote.consumptionTaxAmount,
    localAdminPercent: taxQuote.localAdminPercent,
    localAdminAmount: taxQuote.localAdminAmount,
    totalPrice: taxQuote.customerTotal,
    totalAmount: taxQuote.customerTotal,
    customerName,
    phone: customerPhone,
    location: deliveryLocation,
    deliveryMethod: deliveryMethod || 'delivery',
    notes,
    status: 'new',
    centerId: center ? center._id : null,
    centerNameSnapshot: center ? center.name : '',
  });

  res.status(201).json({
    success: true,
    message: 'تم استلام الطلب بنجاح.',
    order,
    finance: {
      restaurantAmount: taxQuote.baseAmount,
      invoiceTaxPercent: taxQuote.invoiceTaxPercent,
      invoiceTaxAmount: taxQuote.invoiceTaxAmount,
      consumptionTaxPercent: taxQuote.consumptionTaxPercent,
      consumptionTaxAmount: taxQuote.consumptionTaxAmount,
      localAdminPercent: taxQuote.localAdminPercent,
      localAdminAmount: taxQuote.localAdminAmount,
      customerTotal: taxQuote.customerTotal,
    },
  });
};


exports.getOne = async (req, res) => {
  const order = await CustomerOrder.findById(req.params.id).populate('productId', 'name image directPrice');
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود.' });
  res.json({ success: true, order });
};

exports.update = async (req, res) => {
  const order = await CustomerOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود.' });
  if (order.status === 'cancelled') {
    return res.status(400).json({ success: false, message: 'الطلب الملغى للعرض فقط. أعد تفعيله قبل تعديله.' });
  }

  const oldProductId = String(order.productId);
  const oldQuantity = Number(order.quantity) || 0;
  const oldTotal = Number(order.totalPrice || order.totalAmount) || 0;
  const oldCashPosted = Boolean(order.cashPosted);

  const nextProductId = String(req.body.productId || oldProductId);
  const nextQuantity = Number(req.body.quantity ?? oldQuantity);
  if (!(nextQuantity >= 1)) {
    return res.status(400).json({ success: false, message: 'الكمية يجب أن تكون 1 على الأقل.' });
  }

  const product = await Product.findById(nextProductId);
  if (!product) return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });

  const financialChanged = nextProductId !== oldProductId || nextQuantity !== oldQuantity;
  let pricing = {
    unitPrice: Number(order.unitPrice) || 0,
    discountAmount: Number(order.discountAmount) || 0,
    unitCost: Number(order.unitCost) || 0,
    totalCost: Number(order.totalCost) || 0,
    taxQuote: {
      baseAmount: Number(order.netAmount) || 0,
      invoiceTaxPercent: Number(order.invoiceTaxPercent) || 0,
      invoiceTaxAmount: Number(order.invoiceTaxAmount) || 0,
      consumptionTaxPercent: Number(order.consumptionTaxPercent) || 5,
      consumptionTaxAmount: Number(order.consumptionTaxAmount) || 0,
      localAdminPercent: Number(order.localAdminPercent) || 5,
      localAdminAmount: Number(order.localAdminAmount) || 0,
      customerTotal: oldTotal,
    },
  };

  if (financialChanged) {
    const now = new Date();
    const activeOffer = await Offer.findOne({
      productId: nextProductId,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
    const unitPrice = Number(product.directPrice) || 0;
    let discountAmount = 0;
    if (activeOffer) {
      discountAmount = activeOffer.discountType === 'percentage'
        ? unitPrice * (Number(activeOffer.discountValue) || 0) / 100 * nextQuantity
        : (Number(activeOffer.discountValue) || 0) * nextQuantity;
    }
    const restaurantAmount = Math.max(unitPrice * nextQuantity - discountAmount, 0);
    const taxQuote = await financeService.quote(restaurantAmount, order.centerId);
    const unitCost = Number(product.calculatedCost) || 0;
    pricing = {
      unitPrice,
      discountAmount,
      unitCost,
      totalCost: unitCost * nextQuantity,
      taxQuote,
    };

    if (order.stockApplied) {
      await Product.findByIdAndUpdate(order.productId, { $inc: { availableQuantity: oldQuantity } });
      const consumed = await Product.findOneAndUpdate(
        { _id: product._id, availableQuantity: { $gte: nextQuantity } },
        { $inc: { availableQuantity: -nextQuantity } },
        { new: true }
      );
      if (!consumed) {
        await Product.findByIdAndUpdate(order.productId, { $inc: { availableQuantity: -oldQuantity } });
        return res.status(409).json({ success: false, message: `الكمية المتاحة من "${product.name}" غير كافية للتعديل.` });
      }
    }
  }

  order.productId = product._id;
  order.productNameSnapshot = product.name;
  order.quantity = nextQuantity;
  order.unitPrice = pricing.unitPrice;
  order.unitCost = pricing.unitCost;
  order.totalCost = pricing.totalCost;
  order.discountAmount = pricing.discountAmount;
  order.netAmount = pricing.taxQuote.baseAmount;
  order.invoiceTaxPercent = pricing.taxQuote.invoiceTaxPercent;
  order.invoiceTaxAmount = pricing.taxQuote.invoiceTaxAmount;
  order.consumptionTaxPercent = pricing.taxQuote.consumptionTaxPercent;
  order.consumptionTaxAmount = pricing.taxQuote.consumptionTaxAmount;
  order.localAdminPercent = pricing.taxQuote.localAdminPercent;
  order.localAdminAmount = pricing.taxQuote.localAdminAmount;
  order.totalPrice = pricing.taxQuote.customerTotal;
  order.totalAmount = pricing.taxQuote.customerTotal;
  order.profit = pricing.taxQuote.baseAmount - pricing.totalCost;

  if (req.body.customerName !== undefined) order.customerName = String(req.body.customerName || '').trim();
  if (req.body.customerPhone !== undefined || req.body.phone !== undefined) {
    order.phone = String(req.body.customerPhone ?? req.body.phone ?? '').trim();
  }
  if (req.body.deliveryLocation !== undefined || req.body.location !== undefined) {
    order.location = String(req.body.deliveryLocation ?? req.body.location ?? '').trim();
  }
  if (req.body.deliveryMethod !== undefined) order.deliveryMethod = req.body.deliveryMethod;
  if (req.body.notes !== undefined) order.notes = String(req.body.notes || '').trim();

  await order.save();

  if (oldCashPosted && financialChanged) {
    const delta = Number(order.totalPrice) - oldTotal;
    if (delta > 0.009) {
      await cashService.createTransaction(
        'sale_income', delta, 'in',
        `فرق تعديل طلب ${order.productNameSnapshot} — ${order.customerName}`,
        'CustomerOrder', order._id, order.centerId
      );
    } else if (delta < -0.009) {
      await cashService.createTransaction(
        'adjustment', Math.abs(delta), 'out',
        `إرجاع فرق تعديل طلب ${order.productNameSnapshot} — ${order.customerName}`,
        'CustomerOrder', order._id, order.centerId
      );
    }
  }

  cacheService.invalidate('products:');
  res.json({ success: true, message: 'تم تعديل الطلب وإعادة احتساب المبلغ بنجاح.', order });
};

exports.updateStatus = async (req, res) => {
  const order = await CustomerOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود.' });

  const { status } = req.body;
  const allowed = ['new', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: 'حالة غير صالحة.' });
  }

  if (status === 'delivered' && !order.stockApplied) {
    await Product.findByIdAndUpdate(order.productId, { $inc: { availableQuantity: -order.quantity } });
    order.stockApplied = true;
  }

  if (status === 'delivered' && !order.cashPosted) {
    await cashService.createTransaction(
      'sale_income',
      order.totalPrice || order.totalAmount,
      'in',
      `طلب واتساب: ${order.productNameSnapshot} × ${order.quantity} — ${order.customerName}`,
      'CustomerOrder',
      order._id,
      order.centerId
    );
    order.cashPosted = true;
  }

  if (status === 'cancelled' && order.stockApplied) {
    await Product.findByIdAndUpdate(order.productId, { $inc: { availableQuantity: order.quantity } });
    order.stockApplied = false;
  }

  if (status === 'cancelled' && order.cashPosted) {
    await cashService.createTransaction(
      'adjustment',
      order.totalPrice || order.totalAmount,
      'out',
      `عكس طلب واتساب: ${order.productNameSnapshot} × ${order.quantity} — ${order.customerName}`,
      'CustomerOrder',
      order._id,
      order.centerId
    );
    order.cashPosted = false;
    order.reversedAt = new Date();
  }

  order.status = status;
  await order.save();
  cacheService.invalidate('products:');
  res.json({ success: true, message: 'تم تحديث حالة الطلب.', order });
};

exports.remove = async (req, res) => {
  const order = await CustomerOrder.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'الطلب غير موجود.' });

  if (order.stockApplied || order.status === 'delivered') {
    await Product.findByIdAndUpdate(order.productId, { $inc: { availableQuantity: order.quantity } });
  }
  if (order.cashPosted || order.status === 'delivered') {
    await cashService.createTransaction(
      'adjustment',
      order.totalPrice || order.totalAmount,
      'out',
      `حذف طلب واتساب: ${order.productNameSnapshot} × ${order.quantity} — ${order.customerName}`,
      'CustomerOrder',
      order._id,
      order.centerId
    );
  }

  await order.deleteOne();
  cacheService.invalidate('products:');
  res.json({ success: true, message: 'تم حذف الطلب.' });
};
