'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const ctrl = require('../controllers/wasteController');

router.use(protect, blockCashier);
router.get('/summary', ctrl.getAll);
router.get('/by-center', ctrl.getByCenter);
router.get('/', ctrl.getAll);
router.post('/', ctrl.createWaste);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

module.exports = router;
