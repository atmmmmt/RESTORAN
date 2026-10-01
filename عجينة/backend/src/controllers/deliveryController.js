'use strict';

const CenterDelivery = require('../models/CenterDelivery');
const SalesCenter = require('../models/SalesCenter');

exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.centerId) filter.centerId = req.query.centerId;
  if (req.query.status) filter.status = req.query.status;

  const deliveries = await CenterDelivery.find(filter)
    .populate('centerId', 'name type')
    .sort({ deliveryDate: -1 });

  res.json({ success: true, count: deliveries.length, deliveries });
};

exports.create = async (req, res) => {
  const { centerId, items, notes } = req.body;

  if (!centerId || !items || !items.length) {
    return res.status(400).json({ success: false, message: 'centerId والعناصر مطلوبة.' });
  }

  const center = await SalesCenter.findById(centerId);
  if (!center) {
    return res.status(404).json({ success: false, message: 'المركز غير موجود.' });
  }

  // Use expectedGrossAmount sent from frontend, or calculate from quantityDelivered × unitPrice
  const totalExpectedGross = items.reduce((sum, item) =>
    sum + (Number(item.expectedGrossAmount) || (Number(item.quantityDelivered) * Number(item.unitPrice))), 0
  );

  const delivery = await CenterDelivery.create({
    centerId,
    centerNameSnapshot: center.name,
    items,
    totalExpectedGross,
    totalExpectedNetForLuliz: totalExpectedGross,
    status: 'open',
    notes,
    deliveryDate: new Date(),
  });

  // Update center: financial totals
  center.totalDeliveredValue = (center.totalDeliveredValue || 0) + totalExpectedGross;
  center.totalSoldValue      = (center.totalSoldValue      || 0) + totalExpectedGross;
  center.currentBalance      = (center.currentBalance      || 0) + totalExpectedGross;

  // Update center inventory — add delivered quantities
  for (const item of items) {
    const idx = center.inventory.findIndex(
      inv => inv.productId.toString() === item.productId.toString()
    );
    if (idx >= 0) {
      center.inventory[idx].quantity += Number(item.quantityDelivered);
    } else {
      center.inventory.push({
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot || '',
        quantity: Number(item.quantityDelivered),
      });
    }
  }
  center.markModified('inventory');
  await center.save();

  res.status(201).json({ success: true, message: 'تم تسجيل التوصيل بنجاح.', delivery });
};

exports.updateStatus = async (req, res) => {
  const delivery = await CenterDelivery.findById(req.params.id);
  if (!delivery) {
    return res.status(404).json({ success: false, message: 'التوصيلة غير موجودة.' });
  }

  delivery.status = req.body.status;
  await delivery.save();

  res.json({ success: true, message: 'تم تحديث حالة التوصيلة.', delivery });
};
