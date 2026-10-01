'use strict';

const router = require('express').Router();
const { protect, blockCashier } = require('../middleware/auth');

const FACTOR = { gram: 0.01, kg: 0.1, ml: 0.01, liter: 0.1, piece: 1 };

/**
 * GET /api/nutrition/search?q=chicken&unit=gram
 * Proxies Open Food Facts so the browser never faces CORS issues.
 */
router.get('/search', protect, blockCashier, async (req, res) => {
  const { q, unit = 'gram' } = req.query;
  if (!q) return res.status(400).json({ success: false, message: 'أدخل اسم المكون' });

  const url =
    `https://world.openfoodfacts.org/cgi/search.pl` +
    `?search_terms=${encodeURIComponent(q)}&json=1&page_size=5` +
    `&fields=product_name,nutriments`;

  // 8-second timeout so a slow/hung upstream never holds a worker indefinitely
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8_000);
  let raw;
  try {
    raw = await fetch(url, { headers: { 'User-Agent': 'LolizKitchen/1.0' }, signal: abort.signal });
  } catch (fetchErr) {
    return res.status(504).json({ success: false, message: 'انتهت مهلة الاتصال بقاعدة البيانات الخارجية' });
  } finally {
    clearTimeout(timer);
  }
  if (!raw.ok) return res.status(502).json({ success: false, message: 'خطأ في قاعدة البيانات الخارجية' });

  const data = await raw.json();
  const hit  = (data.products || []).find(p => p.nutriments?.['energy-kcal_100g'] > 0);

  if (!hit) return res.json({ success: false, message: 'لم يُعثر على بيانات — جرّب اسماً أبسط بالإنجليزي' });

  const n    = hit.nutriments;
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0);
  const f    = FACTOR[unit] ?? 0.01;

  res.json({
    success: true,
    source: hit.product_name || q,
    nutritionPerUnit: {
      calories: Math.round(kcal                             * f * 1000) / 1000,
      protein:  Math.round((n['proteins_100g']      ?? 0)  * f * 1000) / 1000,
      carbs:    Math.round((n['carbohydrates_100g'] ?? 0)  * f * 1000) / 1000,
      fat:      Math.round((n['fat_100g']           ?? 0)  * f * 1000) / 1000,
    },
  });
});

module.exports = router;
