'use strict';

const router = require('express').Router();
const { protect, requireStaff, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/orderController');

// Public — customers can place orders
router.post('/', ctrl.create);

// Protected
router.get('/', protect, requireRole('admin', 'supervisor', 'viewer'), ctrl.getAll);
router.put('/:id/status', protect, requireRole('admin', 'supervisor'), requireStaff, ctrl.updateStatus);

module.exports = router;
