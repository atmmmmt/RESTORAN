'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const ctrl = require('../controllers/saleController');

router.use(protect, blockCashier);
router.get('/', ctrl.getAll);
router.post('/', ctrl.createSale);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

module.exports = router;
