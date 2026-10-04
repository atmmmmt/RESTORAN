'use strict';

const router = require('express').Router();
const { protect, blockCashier, requireAdmin, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/orderController');

// Public — customers can place orders
router.post('/', ctrl.create);

// Protected — these are website/WhatsApp orders, separate from the POS counter
router.get('/', protect, blockCashier, ctrl.getAll);
router.get('/:id', protect, blockCashier, ctrl.getOne);
router.put('/:id', protect, requireRole('admin', 'supervisor'), ctrl.update);
router.put('/:id/status', protect, blockCashier, ctrl.updateStatus);
router.delete('/:id', protect, requireAdmin, ctrl.remove);

module.exports = router;
