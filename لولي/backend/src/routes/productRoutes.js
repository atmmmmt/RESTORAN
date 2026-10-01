'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const ctrl = require('../controllers/productController');
const cache = require('../middleware/cache');
const virtualTryOnRoutes = require('./virtualTryOnRoutes');

const FIVE_MIN = 5 * 60 * 1000;

/* WebAR Virtual Try-On lives on its own router so the module stays portable
   between stores. It handles its own auth — reads public, writes admin. */
router.use('/:productId/virtual-try-on', virtualTryOnRoutes);

// Public routes (no auth) — cached
router.get('/public', cache('products:public', FIVE_MIN), ctrl.getPublic);
router.get('/public/:id', ctrl.getPublicById);
router.get('/today',  cache('products:today',  FIVE_MIN), ctrl.getToday);

// Protected routes — reads stay open to the cashier (POS needs the menu),
// writes don't (editing the catalogue isn't a POS job).
router.get('/', protect, ctrl.getAll);
router.post('/', protect, blockCashier, ctrl.create);
router.get('/:id', protect, ctrl.getById);
router.put('/:id', protect, blockCashier, ctrl.update);
router.delete('/:id', protect, blockCashier, ctrl.delete);

module.exports = router;
