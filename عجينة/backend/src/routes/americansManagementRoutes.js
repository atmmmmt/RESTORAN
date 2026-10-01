'use strict';

const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const americansManagementService = require('../services/americansManagementService');

router.use(protect, requireRole('admin', 'americans_manager'));

router.get('/summary', async (req, res) => {
  try {
    const data = await americansManagementService.getSummary(req.query);
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'تعذّر تحميل بيانات إدارة الأميركان',
    });
  }
});

module.exports = router;
