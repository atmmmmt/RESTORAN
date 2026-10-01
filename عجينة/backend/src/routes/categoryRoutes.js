'use strict';

/**
 * Menu categories.
 *
 * Products store the category *name*, not an id, so the two writes that can
 * corrupt the menu are rename and delete — both are handled here rather than
 * left to the caller:
 *
 *   • rename  → every product carrying the old name is rewritten in the same
 *               request, so the storefront never shows an orphaned section.
 *   • delete  → refused while products still reference it, unless the caller
 *               names a category to move them to.
 */

const router = require('express').Router();
const { protect, requireAdmin, requireStaff } = require('../middleware/auth');
const Category = require('../models/Category');
const Product  = require('../models/Product');
const { destroy } = require('../controllers/uploadController');

/* ── GET /api/categories ───────────────────────────────────
   Public: the customer menu needs the pictures and the order. Product counts
   come along because both the menu and the admin list show them, and a
   second round trip per category would be silly. */
router.get('/', async (req, res) => {
  const includeInactive = req.query.all === 'true';
  const filter = includeInactive ? {} : { isActive: true };

  const categories = await Category.find(filter).sort({ sortOrder: 1, name: 1 }).lean();

  const counts = await Product.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const byName = new Map(counts.map(c => [c._id, c.count]));

  res.json({
    success: true,
    categories: categories.map(c => ({ ...c, productCount: byName.get(c.name) || 0 })),
  });
});

/* Everything below changes the menu. */
router.use(protect);

/* ── GET /api/categories/orphans ───────────────────────────
   Category names sitting on products with no row of their own — what you get
   after importing a menu, or after someone typed a new name into the product
   form. Surfacing them is how the admin page offers to adopt them. */
router.get('/orphans', requireStaff, async (req, res) => {
  const known = new Set((await Category.find().select('name').lean()).map(c => c.name));

  const used = await Product.aggregate([
    { $match: { category: { $nin: [null, ''] } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  res.json({
    success: true,
    orphans: used.filter(u => !known.has(u._id)).map(u => ({ name: u._id, productCount: u.count })),
  });
});

/* ── POST /api/categories ── */
router.post('/', requireAdmin, async (req, res) => {
  const { name, image, imagePublicId, description, sortOrder } = req.body || {};

  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return res.status(400).json({ success: false, message: 'اسم التصنيف مطلوب' });
  }

  if (await Category.findOne({ name: trimmed })) {
    return res.status(409).json({ success: false, message: 'يوجد تصنيف بهذا الاسم' });
  }

  /* Append by default so a new section lands at the end rather than silently
     sharing position 0 with everything else. */
  const last = await Category.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();

  const category = await Category.create({
    name: trimmed,
    image: image || '',
    imagePublicId: imagePublicId || null,
    description: description || '',
    sortOrder: sortOrder ?? ((last?.sortOrder ?? 0) + 1),
  });

  res.status(201).json({ success: true, category, message: 'تم إنشاء التصنيف' });
});

/* ── PUT /api/categories/:id ──────────────────────────────
   A rename here rewrites the products too; that is the whole point of
   routing it through the server instead of editing the field. */
router.put('/:id', requireAdmin, async (req, res) => {
  const { name, image, imagePublicId, description, sortOrder, isActive } = req.body || {};

  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ success: false, message: 'التصنيف غير موجود' });

  let movedProducts = 0;

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ success: false, message: 'اسم التصنيف مطلوب' });

    if (trimmed !== category.name) {
      const clash = await Category.findOne({ name: trimmed, _id: { $ne: category._id } });
      if (clash) return res.status(409).json({ success: false, message: 'يوجد تصنيف بهذا الاسم' });

      const result = await Product.updateMany(
        { category: category.name },
        { $set: { category: trimmed } }
      );
      movedProducts = result.modifiedCount || 0;
      category.name = trimmed;
    }
  }

  /* Replacing the picture orphans the old Cloudinary file unless we say so. */
  if (image !== undefined && image !== category.image && category.imagePublicId) {
    await destroy(category.imagePublicId).catch(() => { /* a stale file is not worth failing the save */ });
    category.imagePublicId = null;
  }

  if (image         !== undefined) category.image         = image || '';
  if (imagePublicId !== undefined) category.imagePublicId = imagePublicId || null;
  if (description   !== undefined) category.description   = description;
  if (sortOrder     !== undefined) category.sortOrder     = Number(sortOrder);
  if (isActive      !== undefined) category.isActive      = !!isActive;

  await category.save();

  res.json({
    success: true,
    category,
    movedProducts,
    message: movedProducts
      ? `تم الحفظ — ونُقل ${movedProducts} منتج للاسم الجديد`
      : 'تم حفظ التصنيف',
  });
});

/* ── PUT /api/categories/reorder ──────────────────────────
   One request for a whole drag-and-drop, so the list can never be left
   half-reordered by a dropped connection. */
router.put('/order/bulk', requireAdmin, async (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order) || !order.length) {
    return res.status(400).json({ success: false, message: 'الترتيب مطلوب كمصفوفة' });
  }

  await Category.bulkWrite(order.map((id, i) => ({
    updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } },
  })));

  res.json({ success: true, message: 'تم حفظ الترتيب' });
});

/* ── DELETE /api/categories/:id ───────────────────────────
   `moveTo` lets the caller empty the category first; without it a category
   holding products is refused, because deleting it would leave those
   products in a section the storefront no longer knows how to draw. */
router.delete('/:id', requireAdmin, async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ success: false, message: 'التصنيف غير موجود' });

  const count = await Product.countDocuments({ category: category.name });

  if (count) {
    const moveTo = String(req.body?.moveTo || '').trim();
    if (!moveTo) {
      return res.status(409).json({
        success: false,
        productCount: count,
        message: `التصنيف يحتوي ${count} منتج — اختر تصنيفاً لنقلها إليه أولاً`,
      });
    }

    const target = await Category.findOne({ name: moveTo });
    if (!target) {
      return res.status(400).json({ success: false, message: 'التصنيف المستهدف غير موجود' });
    }

    await Product.updateMany({ category: category.name }, { $set: { category: moveTo } });
  }

  if (category.imagePublicId) {
    await destroy(category.imagePublicId).catch(() => { /* best effort */ });
  }
  await category.deleteOne();

  res.json({
    success: true,
    movedProducts: count,
    message: count ? `تم الحذف ونُقل ${count} منتج` : 'تم حذف التصنيف',
  });
});

module.exports = router;
