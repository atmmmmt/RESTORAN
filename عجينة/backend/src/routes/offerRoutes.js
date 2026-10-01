'use strict';

const router = require('express').Router();
const { protect, requireStaff, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/offerController');
const cache = require('../middleware/cache');

const TEN_MIN = 10 * 60 * 1000;

// Public — cached
router.get('/public', cache('offers:public', TEN_MIN), ctrl.getPublic);

// Protected
router.get('/', protect, requireRole('admin', 'supervisor', 'viewer'), ctrl.getAll);
router.post('/', protect, requireStaff, ctrl.create);
router.put('/:id', protect, requireStaff, ctrl.update);
router.delete('/:id', protect, requireStaff, ctrl.delete);

module.exports = router;
