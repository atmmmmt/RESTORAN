'use strict';
const router       = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');
const Review       = require('../models/Review');
const cache        = require('../middleware/cache');
const cacheService = require('../services/cacheService');

const FIFTEEN_MIN = 15 * 60 * 1000;

/* ── Public — cached ── */
router.get('/public', cache('reviews:public', FIFTEEN_MIN), async (req, res) => {
  const reviews = await Review.find({ isVisible: true }).sort({ order: 1, createdAt: -1 });
  res.json({ success: true, reviews });
});

/* ── Admin ── */
router.use(protect, blockCashier);

router.get('/', async (req, res) => {
  const reviews = await Review.find().sort({ order: 1, createdAt: -1 });
  res.json({ success: true, reviews });
});

router.post('/', async (req, res) => {
  const { customerName, content, rating, emoji, isVisible, order } = req.body;
  if (!customerName || !content) return res.status(400).json({ success: false, message: 'الاسم والرأي مطلوبان' });
  const review = await Review.create({ customerName, content, rating: rating || 5, emoji: emoji || '😊', isVisible: isVisible !== false, order: order || 0 });
  cacheService.del('reviews:public');
  res.status(201).json({ success: true, review });
});

router.put('/:id', async (req, res) => {
  const review = await Review.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!review) return res.status(404).json({ success: false, message: 'الرأي غير موجود' });
  cacheService.del('reviews:public');
  res.json({ success: true, review });
});

router.delete('/:id', async (req, res) => {
  await Review.findByIdAndDelete(req.params.id);
  cacheService.del('reviews:public');
  res.json({ success: true, message: 'تم الحذف' });
});

module.exports = router;
