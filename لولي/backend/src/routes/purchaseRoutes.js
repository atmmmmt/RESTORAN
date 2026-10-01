'use strict';

const router = require('express').Router();
const { protect, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/purchaseController');

/* Open to the cashier too: the counter records the day's purchases as they
   come in (and the purchase is paid out of the till). Everything else in the
   books — cash, reports, sales, inventory edits — stays blocked for them. */
router.use(protect);
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', requireAdmin, ctrl.update);
router.delete('/:id', requireAdmin, ctrl.delete);

module.exports = router;
