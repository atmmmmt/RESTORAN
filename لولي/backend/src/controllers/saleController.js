'use strict';

const { validationResult } = require('express-validator');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const SalesCenter = require('../models/SalesCenter');
const Offer = require('../models/Offer');
const inventoryService = require('../services/inventoryService');
const cashService = require('../services/cashService');
const costService = require('../services/costService');

/**
 * GET /api/sales
 */
exports.getAll = async (req, res) => {
  const { startDate, endDate, salesChannel, paymentStatus, productId, centerId, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (startDate || endDate) {
    filter.saleDate = {};
    if (startDate) filter.saleDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.saleDate.$lte = end;
    }
  }
  if (salesChannel) filter.salesChannel = salesChannel;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (productId) filter.productId = productId;
  if (centerId) filter.centerId = centerId;

  const skip = (Number(page) - 1) * Number(limit);
  const [sales, total] = await Promise.all([
    Sale.find(filter)
      .populate('productId', 'name directPrice')
      .populate('centerId', 'name type')
      .sort({ saleDate: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Sale.countDocuments(filter),
  ]);

  res.json({
    success: true,
    count: sales.length,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    sales,
  });
};

/**
 * GET /api/sales/:id
 */
exports.getById = async (req, res) => {
  const sale = await Sale.findById(req.params.id)
    .populate('productId', 'name directPrice calculatedCost')
    .populate('centerId', 'name type commissionPercent');

  if (!sale) {
    return res.status(404).json({ success: false, message: 'عملية البيع غير موجودة.' });
  }
  res.json({ success: true, sale });
};

/**
 * POST /api/sales
 */
exports.createSale = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const {
    productId, quantity, salesChannel, centerId,
    paymentStatus = 'paid', paidAmount: paidAmountInput,
    customerName, customerPhone, deliveryLocation, notes, saleDate,
    unitPriceOverride,
  } = req.body;

  // Get product
  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({ success: false, message: 'المنتج غير موجود.' });
  }

  if (product.availableQuantity < quantity) {
    return res.status(400).json({
      success: false,
      message: `الكمية المتاحة غير كافية. المتاح: ${product.availableQuantity}، المطلوب: ${quantity}`,
    });
  }

  // Determine unit price based on channel
  let unitPrice = 0;
  let commissionPercent = 0;
  let center = null;

  if (salesChannel === 'direct' || salesChannel === 'whatsapp') {
    unitPrice = unitPriceOverride || product.directPrice;
  } else if (salesChannel === 'regular_center') {
    if (!centerId) {
      return res.status(400).json({ success: false, message: 'يجب تحديد المركز لعمليات البيع عبر المراكز.' });
    }
    center = await SalesCenter.findById(centerId);
    if (!center) {
      return res.status(404).json({ success: false, message: 'المركز غير موجود.' });
    }
    unitPrice = unitPriceOverride || product.regularCenterPrice;
    commissionPercent = 0;
  } else if (salesChannel === 'specialized_center') {
    if (!centerId) {
      return res.status(400).json({ success: false, message: 'يجب تحديد المركز لعمليات البيع عبر المراكز المتخصصة.' });
    }
    center = await SalesCenter.findById(centerId);
    if (!center) {
      return res.status(404).json({ success: false, message: 'المركز غير موجود.' });
    }
    unitPrice = unitPriceOverride || product.directPrice;
    commissionPercent = center.commissionPercent || product.specializedCenterDefaultCommissionPercent;
  }

  // Check for active offer
  const now = new Date();
  const activeOffer = await Offer.findOne({
    productId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  let discountAmount = 0;
  const grossAmount = unitPrice * quantity;

  if (activeOffer) {
    const { discountAmount: singleDiscount } = costService.applyDiscount(unitPrice, activeOffer.discountType, activeOffer.discountValue);
    discountAmount = singleDiscount * quantity;
  }

  const netAmount = grossAmount - discountAmount;
  const productCostSnapshot = product.calculatedCost || 0;
  const totalCost = productCostSnapshot * quantity;

  const commissionAmount = netAmount * (commissionPercent / 100);
  const amountForLuliz = netAmount - commissionAmount;
  const profit = amountForLuliz - totalCost;

  const paidAmount = paymentStatus === 'paid' ? netAmount : (paidAmountInput || 0);
  const remainingAmount = netAmount - paidAmount;

  // Decrease product stock
  await inventoryService.decreaseProductStock(productId, quantity);

  // Create sale record
  const sale = await Sale.create({
    productId: product._id,
    productNameSnapshot: product.name,
    quantity,
    unitPrice,
    grossAmount,
    discountAmount,
    netAmount,
    productCostSnapshot,
    totalCost,
    profit,
    salesChannel,
    centerId: center ? center._id : undefined,
    centerNameSnapshot: center ? center.name : undefined,
    commissionPercent,
    commissionAmount,
    amountForLuliz,
    paymentStatus,
    paidAmount,
    remainingAmount,
    customerName,
    customerPhone,
    deliveryLocation,
    notes,
    saleDate: saleDate ? new Date(saleDate) : new Date(),
  });

  // Record cash transaction if paid
  if (paidAmount > 0) {
    await cashService.createTransaction(
      'sale_income',
      paidAmount,
      'in',
      `مبيعات: ${product.name} (${quantity} وحدة)`,
      'Sale',
      sale._id
    );
  }

  // Update center stats if applicable
  if (center) {
    center.totalSoldValue = (center.totalSoldValue || 0) + netAmount;
    center.totalCommission = (center.totalCommission || 0) + commissionAmount;
    center.currentBalance = (center.currentBalance || 0) + amountForLuliz;
    if (paymentStatus === 'paid') {
      center.totalCollected = (center.totalCollected || 0) + paidAmount;
      center.currentBalance = Math.max(0, center.currentBalance - paidAmount);
    }
    await center.save();
  }

  res.status(201).json({
    success: true,
    message: `تم تسجيل البيع بنجاح. صافي الربح: ${profit.toLocaleString()} ل.س`,
    sale,
  });
};

exports.create = exports.createSale;

/**
 * PUT /api/sales/:id
 */
exports.update = async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ success: false, message: 'عملية البيع غير موجودة.' });
  }

  // Allow updating payment status and notes only
  const { paymentStatus, paidAmount, notes } = req.body;

  if (paymentStatus) sale.paymentStatus = paymentStatus;
  if (notes !== undefined) sale.notes = notes;

  if (paidAmount !== undefined) {
    const additionalPayment = paidAmount - sale.paidAmount;
    sale.paidAmount = paidAmount;
    sale.remainingAmount = sale.netAmount - paidAmount;

    if (additionalPayment > 0) {
      await cashService.createTransaction(
        'sale_income',
        additionalPayment,
        'in',
        `دفعة إضافية: ${sale.productNameSnapshot}`,
        'Sale',
        sale._id
      );
    }
  }

  await sale.save();
  res.json({ success: true, message: 'تم تحديث عملية البيع.', sale });
};

/**
 * DELETE /api/sales/:id
 */
exports.delete = async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ success: false, message: 'عملية البيع غير موجودة.' });
  }
  await sale.deleteOne();
  res.json({ success: true, message: 'تم حذف عملية البيع.' });
};
