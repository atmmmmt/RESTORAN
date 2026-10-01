'use strict';

const router = require('express').Router();
const { protect, blockCashier, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/orderController');

// Public — customers can place orders
router.post('/', ctrl.create);

// Protected — these are website/WhatsApp orders, separate from the POS counter
router.get('/', protect, blockCashier, ctrl.getAll);
router.put('/:id/status', protect, blockCashier, ctrl.updateStatus);
router.delete('/:id', protect, requireAdmin, ctrl.remove);

module.exports = router;
