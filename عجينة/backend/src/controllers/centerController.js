'use strict';

const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const SalesCenter = require('../models/SalesCenter');
const CenterDelivery = require('../models/CenterDelivery');
const CenterSettlement = require('../models/CenterSettlement');
const Sale = require('../models/Sale');
const cacheService = require('../services/cacheService');

/**
 * GET /api/centers
 */
exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  if (req.query.type) filter.type = req.query.type;

  const centers = await SalesCenter.find(filter).sort({ name: 1 });
  res.json({ success: true, count: centers.length, centers });
};

/**
 * GET /api/centers/:id
 */
exports.getById = async (req, res) => {
  const center = await SalesCenter.findById(req.params.id);
  if (!center) {
    return res.status(404).json({ success: false, message: 'المركز غير موجود.' });
  }

  // Get ALL deliveries and settlements for accurate totals
  const [allDeliveries, allSettlements] = await Promise.all([
    CenterDelivery.find({ centerId: center._id }).sort({ deliveryDate: -1 }),
    CenterSettlement.find({ centerId: center._id }).sort({ settlementDate: -1 }),
  ]);

  // Recalculate totals from actual data (handles legacy records with totalValue=0)
  const calcTotal = (d) => {
    if (d.totalExpectedGross > 0) return d.totalExpectedGross;
    if (d.totalValue > 0) return d.totalValue;
    return (d.items || []).reduce((s, it) =>
      s + (Number(it.expectedGrossAmount) || (Number(it.quantityDelivered) * Number(it.unitPrice))), 0);
  };

  const totalDelivered  = allDeliveries.reduce((s, d) => s + calcTotal(d), 0);
  const totalCollected  = allSettlements.reduce((s, st) => s + st.amountCollected, 0);
  const currentBalance  = Math.max(0, totalDelivered - totalCollected);

  // Sync center stored values if they're stale
  if (center.totalSoldValue !== totalDelivered || center.currentBalance !== currentBalance) {
    center.totalSoldValue     = totalDelivered;
    center.totalDeliveredValue = totalDelivered;
    center.totalCollected     = totalCollected;
    center.currentBalance     = currentBalance;
    await center.save();
  }

  res.json({
    success: true,
    center,
    recentDeliveries: allDeliveries,
    recentSettlements: allSettlements,
    computed: { totalDelivered, totalCollected, currentBalance },
  });
};

/**
 * GET /api/centers/:id/summary
 */
exports.getSummary = async (req, res) => {
  const center = await SalesCenter.findById(req.params.id);
  if (!center) {
    return res.status(404).json({ success: false, message: 'المركز غير موجود.' });
  }

  const { startDate, endDate } = req.query;
  const match = { centerId: center._id };
  if (startDate || endDate) {
    match.saleDate = {};
    if (startDate) match.saleDate.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match.saleDate.$lte = end;
    }
  }

  const [salesAgg, openDeliveries] = await Promise.all([
    Sale.aggregate([
      { $match: { ...match, status: { $ne: 'reversed' } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$netAmount' },
          totalCommission: { $sum: '$commissionAmount' },
          totalAmountForLuliz: { $sum: '$amountForLuliz' },
          salesCount: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
        },
      },
    ]),
    CenterDelivery.find({ centerId: center._id, status: { $in: ['open', 'partially_settled'] } }),
  ]);

  const salesStats = salesAgg[0] || {
    totalRevenue: 0, totalCommission: 0, totalAmountForLuliz: 0, salesCount: 0, totalQuantity: 0,
  };

  res.json({
    success: true,
    center,
    summary: salesStats,
    openDeliveries,
    openDeliveriesCount: openDeliveries.length,
  });
};

/**
 * POST /api/centers
 */
exports.create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const { name, type, commissionPercent, contactPerson, phone, location, notes, mapLink, availableProducts } = req.body;

  const center = await SalesCenter.create({
    name,
    type,
    commissionPercent: commissionPercent || 0,
    contactPerson,
    phone,
    location,
    notes,
    mapLink: mapLink || '',
    availableProducts: availableProducts || [],
  });

  res.status(201).json({ success: true, message: 'تم إنشاء المركز بنجاح.', center });
};

/**
 * PUT /api/centers/:id
 */
exports.update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const center = await SalesCenter.findById(req.params.id);
  if (!center) {
    return res.status(404).json({ success: false, message: 'المركز غير موجود.' });
  }

  const allowedFields = ['name', 'type', 'commissionPercent', 'contactPerson', 'phone', 'location', 'notes', 'isActive', 'mapLink', 'availableProducts'];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      center[field] = req.body[field];
    }
  }

  await center.save();
  cacheService.del('centers:public');
  res.json({ success: true, message: 'تم تحديث المركز بنجاح.', center });
};

/**
 * DELETE /api/centers/:id
 */
exports.delete = async (req, res) => {
  const center = await SalesCenter.findById(req.params.id);
  if (!center) {
    return res.status(404).json({ success: false, message: 'المركز غير موجود.' });
  }

  center.isActive = false;
  await center.save();
  cacheService.del('centers:public');
  res.json({ success: true, message: 'تم تعطيل المركز بنجاح.' });
};

/**
 * PUT /api/centers/:id/portal
 * Admin sets portal username + password for center owner login
 */
exports.setPortal = async (req, res) => {
  const { username, password, lowStockThreshold } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة السر مطلوبان.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'كلمة السر يجب أن تكون 6 أحرف على الأقل.' });
  }

  // Check uniqueness — exclude current center
  const existing = await SalesCenter.findOne({ portalUsername: username, _id: { $ne: req.params.id } });
  if (existing) {
    return res.status(400).json({ success: false, message: 'اسم المستخدم مستخدم من قبل مركز آخر.' });
  }

  const center = await SalesCenter.findById(req.params.id).select('+portalPasswordHash');
  if (!center) {
    return res.status(404).json({ success: false, message: 'المركز غير موجود.' });
  }

  center.portalUsername    = username;
  center.portalPasswordHash = await bcrypt.hash(password, 10);
  if (lowStockThreshold !== undefined) center.lowStockThreshold = Number(lowStockThreshold);
  await center.save();

  res.json({ success: true, message: 'تم تعيين بيانات دخول البوابة بنجاح.' });
};

/**
 * GET /api/centers/alerts/low-stock
 * Returns all inventory items below threshold across all centers
 */
exports.getLowStockAlerts = async (req, res) => {
  const centers = await SalesCenter.find({ isActive: true, 'inventory.0': { $exists: true } })
    .select('name lowStockThreshold inventory');

  const alerts = [];
  for (const center of centers) {
    for (const item of center.inventory) {
      if (item.quantity < center.lowStockThreshold) {
        alerts.push({
          centerId:   center._id,
          centerName: center.name,
          productId:  item.productId,
          productName: item.productNameSnapshot,
          quantity:   item.quantity,
          threshold:  center.lowStockThreshold,
        });
      }
    }
  }

  res.json({ success: true, count: alerts.length, alerts });
};
