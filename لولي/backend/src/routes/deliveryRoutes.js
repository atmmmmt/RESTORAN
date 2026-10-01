'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const ctrl = require('../controllers/deliveryController');

router.use(protect, blockCashier);
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.patch('/:id/status', ctrl.updateStatus);

module.exports = router;
