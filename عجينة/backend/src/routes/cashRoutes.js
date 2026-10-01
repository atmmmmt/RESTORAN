'use strict';

const router = require('express').Router();
const { protect, requireStaff, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/cashController');

router.use(protect, requireRole('admin', 'supervisor', 'viewer'));
router.get('/balance', ctrl.getBalance);
router.get('/balances-by-center', ctrl.getBalancesByCenter);
router.get('/transactions', ctrl.getTransactions);
router.get('/summary', ctrl.getSummary);
router.post('/manual-income', requireStaff, ctrl.addManualIncome);
router.post('/manual-expense', requireStaff, ctrl.addManualExpense);
router.post('/adjustment', requireStaff, ctrl.addAdjustment);

module.exports = router;
