'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const ctrl = require('../controllers/offerController');
const cache = require('../middleware/cache');

const TEN_MIN = 10 * 60 * 1000;

// Public — cached
router.get('/public', cache('offers:public', TEN_MIN), ctrl.getPublic);

// Protected — promo management isn't part of ringing up a sale
router.get('/', protect, blockCashier, ctrl.getAll);
router.post('/', protect, blockCashier, ctrl.create);
router.put('/:id', protect, blockCashier, ctrl.update);
router.delete('/:id', protect, blockCashier, ctrl.delete);

module.exports = router;
