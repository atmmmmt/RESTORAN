'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const ctrl = require('../controllers/ingredientController');

router.use(protect);
/* The cashier needs to read the ingredient list to fill in a purchase —
   but creating, editing or deleting ingredients stays with staff. */
router.get('/', ctrl.getAll);
router.post('/', blockCashier, ctrl.create);
router.get('/:id', blockCashier, ctrl.getById);
router.put('/:id', blockCashier, ctrl.update);
router.delete('/:id', blockCashier, ctrl.delete);

module.exports = router;
