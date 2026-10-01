'use strict';

const router = require('express').Router();
const { protect, requireStaff, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/deliveryController');

router.use(protect, requireRole('admin', 'supervisor', 'viewer'));
router.get('/', ctrl.getAll);
router.post('/', requireStaff, ctrl.create);
router.patch('/:id/status', requireStaff, ctrl.updateStatus);

module.exports = router;
