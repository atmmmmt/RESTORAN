'use strict';

/**
 * Promote the free-text `product.category` values into real Category rows.
 *
 * Until now a category existed only as a string repeated across products, and
 * its picture was a hardcoded map in the storefront bundle. This walks the
 * products, creates one row per distinct name, and carries over the picture
 * each name had in that map so the menu looks identical the moment the
 * storefront switches to reading categories from the API.
 *
 * Safe to re-run: existing rows are left alone, only missing ones are added.
 *
 *   node src/seed/migrateCategories.js            # apply
 *   node src/seed/migrateCategories.js --dry-run  # report only
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product  = require('../models/Product');

/* Lifted verbatim from frontend/src/pages/customer/MenuPage.jsx, which is the
   only place these pairings ever existed. Once this has run, that map is
   dead weight and the storefront reads the database instead. */
const LEGACY_IMAGES = {
  'مناقيش':               '/menu/brand-categories-v2/manakish.webp',
  'فطيرات':               '/menu/categories/2021756210822.png',
  'الصفيحة واللحوم':      '/menu/brand-categories-v2/meat-pastries.webp',
  'بيتزا':                '/menu/brand-categories-v2/pizza.webp',
  'صواني':                '/menu/brand-categories-v2/trays.webp',
  'صندويش المشاوي':       '/menu/brand-categories-v2/sandwiches.webp',
  'مقبلات':               '/menu/brand-categories-v2/appetizers.webp',
  'وجبات المشاوي':        '/menu/brand-categories-v2/mixed-grill.webp',
  'وجبات مشاوي دجاج':     '/menu/brand-categories-v2/chicken-grill.webp',
  'سلطات':                '/menu/brand-categories-v2/salads.webp',
  'اصناف عجينه وطحينه':   '/menu/brand-categories-v2/signature.webp',
  'مشروبات':              '/menu/brand-categories-v2/drinks.webp',
};

/* The order the storefront used to show, which was the order of that map. */
const LEGACY_ORDER = Object.keys(LEGACY_IMAGES);

const dryRun = process.argv.includes('--dry-run');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const used = await Product.aggregate([
    { $match: { category: { $nin: [null, ''] } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const existing = new Set((await Category.find().select('name').lean()).map(c => c.name));

  console.log(`وُجد ${used.length} تصنيف مستخدم على المنتجات، و${existing.size} تصنيف مسجّل مسبقاً\n`);

  const toCreate = [];
  for (const { _id: name, count } of used) {
    if (existing.has(name)) {
      console.log(`  · موجود   ${name} (${count} منتج)`);
      continue;
    }

    const image = LEGACY_IMAGES[name] || '';
    /* Names the old map knew keep their position; anything else lands after
       them, in order of how many products carry it. */
    const idx = LEGACY_ORDER.indexOf(name);
    const sortOrder = idx >= 0 ? idx : LEGACY_ORDER.length + toCreate.length;

    toCreate.push({ name, image, sortOrder, isActive: true });
    console.log(`  + جديد    ${name} (${count} منتج)${image ? ' — مع صورة' : ' — بلا صورة'}`);
  }

  if (!toCreate.length) {
    console.log('\nلا يوجد ما يُضاف.');
  } else if (dryRun) {
    console.log(`\n[تجربة فقط] كان سيُنشأ ${toCreate.length} تصنيف.`);
  } else {
    await Category.insertMany(toCreate);
    console.log(`\n✓ أُنشئ ${toCreate.length} تصنيف.`);
  }

  /* Names in the legacy map that no product uses any more are worth flagging
     rather than creating — an empty section on the storefront is a bug. */
  const usedNames = new Set(used.map(u => u._id));
  const unused = LEGACY_ORDER.filter(n => !usedNames.has(n) && !existing.has(n));
  if (unused.length) {
    console.log(`\nملاحظة — أسماء في القائمة القديمة بلا منتجات (لم تُنشأ): ${unused.join('، ')}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('ERR', err.message);
  process.exit(1);
});
