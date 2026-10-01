'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const ctrl = require('../controllers/cashController');

router.use(protect, blockCashier);
router.get('/balance', ctrl.getBalance);
router.get('/balances-by-center', ctrl.getBalancesByCenter);
router.get('/transactions', ctrl.getTransactions);
router.get('/summary', ctrl.getSummary);
router.post('/manual-income', ctrl.addManualIncome);
router.post('/manual-expense', ctrl.addManualExpense);
router.post('/adjustment', ctrl.addAdjustment);

module.exports = router;
