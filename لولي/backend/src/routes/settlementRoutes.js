'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const ctrl = require('../controllers/settlementController');

router.use(protect, blockCashier);
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);

module.exports = router;
