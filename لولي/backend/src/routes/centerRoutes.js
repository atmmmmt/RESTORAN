'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const ctrl = require('../controllers/centerController');
const SalesCenter = require('../models/SalesCenter');
const cache = require('../middleware/cache');

const FIFTEEN_MIN = 15 * 60 * 1000;

/* ── Public — customer frontend — cached ── */
router.get('/public', cache('centers:public', FIFTEEN_MIN), async (req, res) => {
  const centers = await SalesCenter.find({ isActive: true })
    .select('name type phone location notes mapLink availableProducts')
    .populate('availableProducts', 'name image directPrice')
    .sort({ name: 1 });
  res.json({ success: true, centers });
});

router.use(protect, blockCashier);
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
// Must be before /:id to avoid treating 'alerts' as an ID
router.get('/alerts/low-stock', ctrl.getLowStockAlerts);
router.get('/:id/summary', ctrl.getSummary);
router.get('/:id', ctrl.getById);
router.put('/:id/portal', ctrl.setPortal);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.delete);

module.exports = router;
