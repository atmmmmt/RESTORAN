'use strict';

const DailyClosing = require('../models/DailyClosing');
const reportService = require('../services/reportService');
const businessDay = require('../services/businessDay');

exports.getAll = async (req, res) => {
  const closings = await DailyClosing.find().sort({ date: -1 }).limit(60);
  res.json({ success: true, count: closings.length, closings });
};

exports.create = async (req, res) => {
  // Default to the working day running now, which after midnight may be yesterday.
  const dateStr = req.body.date || (await businessDay.current()).day;

  // Check if closing already exists for this date
  const existing = await DailyClosing.findOne({ date: dateStr });
  if (existing) {
    return res.status(400).json({ success: false, message: `يوجد إغلاق مسجل بالفعل ليوم ${dateStr}.` });
  }

  // Get report data for that day
  const reportData = await reportService.getDailyReport(dateStr);
  const { summary } = reportData;

  const closing = await DailyClosing.create({
    date: dateStr,
    totalRevenue: summary.totalRevenue,
    totalCost: summary.totalCost,
    totalPurchases: summary.totalPurchases,
    totalExpenses: 0,
    totalWasteCost: summary.totalWasteCost,
    totalCommissions: summary.totalCommissions,
    netProfit: summary.netProfit,
    cashBalance: summary.cashBalance,
    productsSummary: reportData.productBreakdown,
    notes: req.body.notes || '',
  });

  res.status(201).json({
    success: true,
    message: `تم إغلاق يوم ${dateStr} بنجاح. صافي الربح: ${summary.netProfit.toLocaleString()} ل.س`,
    closing,
  });
};
