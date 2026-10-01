'use strict';

const router = require('express').Router();
const { protect, requireAdmin, requireRole } = require('../middleware/auth');
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

router.use(protect, requireRole('admin', 'supervisor', 'viewer'));
router.get('/', ctrl.getAll);
router.post('/', requireAdmin, ctrl.create);
// Must be before /:id to avoid treating 'alerts' as an ID
router.get('/alerts/low-stock', ctrl.getLowStockAlerts);
router.get('/:id/summary', ctrl.getSummary);
router.get('/:id', ctrl.getById);
router.put('/:id/portal', requireAdmin, ctrl.setPortal);
router.put('/:id', requireAdmin, ctrl.update);
router.delete('/:id', requireAdmin, ctrl.delete);

module.exports = router;
