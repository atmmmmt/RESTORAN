'use strict';

const router = require('express').Router();
const { protect, requireStaff, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/saleController');

router.use(protect, requireRole('admin', 'supervisor', 'viewer'));
router.get('/', ctrl.getAll);
router.post('/', requireStaff, ctrl.createSale);
router.get('/:id', ctrl.getById);
router.put('/:id', requireStaff, ctrl.update);
router.delete('/:id', requireStaff, ctrl.delete);

module.exports = router;
