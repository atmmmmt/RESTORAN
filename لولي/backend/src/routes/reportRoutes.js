'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const ctrl = require('../controllers/reportController');

router.use(protect, blockCashier);
router.get('/dashboard', ctrl.getDashboard);
router.get('/daily', ctrl.getDaily);
router.get('/monthly', ctrl.getMonthly);
router.get('/products', ctrl.getProducts);
router.get('/centers', ctrl.getCenters);
router.get('/waste', ctrl.getWaste);
router.get('/profit-loss', ctrl.getProfitLoss);

module.exports = router;
