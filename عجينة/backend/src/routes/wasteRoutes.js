'use strict';

const router = require('express').Router();
const { protect, requireStaff, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/wasteController');

router.use(protect, requireRole('admin', 'supervisor', 'viewer'));
router.get('/summary', ctrl.getAll);
router.get('/by-center', ctrl.getByCenter);
router.get('/', ctrl.getAll);
router.post('/', requireStaff, ctrl.createWaste);
router.get('/:id', ctrl.getById);
router.put('/:id', requireStaff, ctrl.update);
router.delete('/:id', requireStaff, ctrl.delete);

module.exports = router;
