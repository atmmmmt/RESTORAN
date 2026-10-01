'use strict';

const router       = require('express').Router();
const { protect, requireAdmin } = require('../middleware/auth');
const SiteSettings = require('../models/SiteSettings');
const cache        = require('../middleware/cache');
const cacheService = require('../services/cacheService');

const THIRTY_MIN = 30 * 60 * 1000;

/* ── GET /api/site-settings — public (no auth) — cached ── */
router.get('/', cache('site-settings', THIRTY_MIN), async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const settings = await SiteSettings.getSingleton();
  res.json({ success: true, settings });
});

/* ── PUT /api/site-settings — admin only ── */
router.put('/', protect, requireAdmin, async (req, res) => {
  const { heroImage, waNumber, siteName, tagline, instagramUrl, beholdFeedId, comingSoonEnabled } = req.body;

  const $set = {};
  if (heroImage          !== undefined) $set.heroImage          = heroImage;
  if (waNumber           !== undefined) $set.waNumber           = waNumber;
  if (siteName           !== undefined) $set.siteName           = siteName;
  if (tagline            !== undefined) $set.tagline            = tagline;
  if (instagramUrl       !== undefined) $set.instagramUrl       = instagramUrl;
  if (beholdFeedId       !== undefined) $set.beholdFeedId       = beholdFeedId;
  if (comingSoonEnabled  !== undefined) $set.comingSoonEnabled  = comingSoonEnabled;

  console.log('💾 SiteSettings update:', JSON.stringify($set));

  const settings = await SiteSettings.findOneAndUpdate(
    {},
    { $set },
    { upsert: true, new: true, runValidators: true }
  );

  cacheService.del('site-settings');

  res.json({ success: true, settings, message: 'تم حفظ إعدادات الموقع بنجاح' });
});

module.exports = router;
