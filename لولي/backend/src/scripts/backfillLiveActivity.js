'use strict';

/**
 * Backfill `tenant` on rows created on live production AFTER migrateTenancy.js
 * ran — production has no tenant awareness at all, so anything written there
 * since the migration landed with no tag.
 *
 * Traced by hand (2026-08-21 activity): a branch "الاميركان" (contact حكمت),
 * a Pepsi purchase against it, the ingredient/employee that purchase touched,
 * its cash entry, and حكمت's own account (hukmat@gmail.com). The owner
 * confirmed حكمت and this activity belong to عجينة وطحينة, not لوليز — so all
 * of it gets 'ajeena', matching the rest of the pre-migration catalogue.
 *
 *   node src/scripts/backfillLiveActivity.js             ← dry run
 *   node src/scripts/backfillLiveActivity.js --apply     ← writes it
 */

require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const TENANT = 'ajeena';

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  console.log(APPLY ? '⚙️  تنفيذ فعلي\n' : '🔎 وضع تجريبي — لن يُكتب أي شيء\n');

  const cols = (await db.listCollections().toArray()).map(c => c.name).sort();
  let total = 0;
  for (const name of cols) {
    const col = db.collection(name);
    const pending = await col.countDocuments({ tenant: { $exists: false } });
    if (!pending) continue;
    if (APPLY) await col.updateMany({ tenant: { $exists: false } }, { $set: { tenant: TENANT } });
    total += pending;
    console.log(`  ${name.padEnd(22)} ${pending} → ${TENANT}`);
  }

  console.log(`\n${APPLY ? 'تم وسم' : 'سيُوسم'} ${total} سجل.`);
  if (!APPLY) console.log('أعد التشغيل مع --apply للتنفيذ.');

  await mongoose.disconnect();
})().catch(e => { console.error('فشل:', e.message); process.exit(1); });
