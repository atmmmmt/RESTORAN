'use strict';

const CenterSettlement = require('../models/CenterSettlement');
const SalesCenter = require('../models/SalesCenter');
const cashService = require('../services/cashService');

exports.getAll = async (req, res) => {
  const filter = {};
  if (req.query.centerId) filter.centerId = req.query.centerId;

  const settlements = await CenterSettlement.find(filter)
    .populate('centerId', 'name type')
    .sort({ settlementDate: -1 });

  res.json({ success: true, count: settlements.length, settlements });
};

exports.create = async (req, res) => {
  const { centerId, amountCollected, notes } = req.body;

  if (!centerId || !amountCollected) {
    return res.status(400).json({ success: false, message: 'centerId والمبلغ المحصل مطلوبان.' });
  }

  const center = await SalesCenter.findById(centerId);
  if (!center) {
    return res.status(404).json({ success: false, message: 'المركز غير موجود.' });
  }

  const settlement = await CenterSettlement.create({
    centerId,
    centerNameSnapshot: center.name,
    amountCollected: Number(amountCollected),
    notes,
    settlementDate: new Date(),
  });

  // Update center balance
  center.currentBalance = Math.max(0, (center.currentBalance || 0) - Number(amountCollected));
  center.totalCollected = (center.totalCollected || 0) + Number(amountCollected);
  await center.save();

  // Record cash in
  await cashService.createTransaction(
    'center_collection',
    Number(amountCollected),
    'in',
    `تسوية مع مركز ${center.name}`,
    'CenterSettlement',
    settlement._id
  );

  res.status(201).json({ success: true, message: 'تم تسجيل التسوية بنجاح.', settlement });
};
