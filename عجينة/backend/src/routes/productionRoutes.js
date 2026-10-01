'use strict';

const router = require('express').Router();
const { protect, requireStaff, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/productionController');

router.use(protect, requireRole('admin', 'supervisor', 'viewer'));
router.get('/', ctrl.getAll);
router.post('/', requireStaff, ctrl.create);
router.delete('/:id', requireStaff, ctrl.delete);

module.exports = router;
