'use strict';

const router = require('express').Router();
const { protect, requireStaff, requireRole } = require('../middleware/auth');
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

// Protected routes
router.get('/', protect, requireRole('admin', 'supervisor', 'viewer', 'cashier'), ctrl.getAll);
router.post('/', protect, requireStaff, ctrl.create);
router.get('/:id', protect, requireRole('admin', 'supervisor', 'viewer'), ctrl.getById);
router.put('/:id', protect, requireStaff, ctrl.update);
router.delete('/:id', protect, requireStaff, ctrl.delete);
router.delete('/:id/permanent', protect, requireRole('admin'), ctrl.purge);

module.exports = router;
