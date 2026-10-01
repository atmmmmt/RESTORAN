'use strict';

/**
 * One-off migration: label every existing row with the brand that owns it.
 *
 * Everything already in the database is عجينة وطحينة's, so every collection is
 * stamped `tenant: 'ajeena'`. The single existing login (admin@luliz.com,
 * "مديرة لوليز") is لوليز's account and is stamped `luliz` instead, and a fresh
 * admin is created for عجينة so they can still reach their own data.
 *
 * The migration only ever ADDS a field. Nothing is deleted, moved or rewritten,
 * so re-running it is safe and rows that already carry a tenant are skipped.
 *
 *   node src/scripts/migrateTenancy.js             ← dry run, writes nothing
 *   node src/scripts/migrateTenancy.js --apply     ← performs the migration
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const APPLY = process.argv.includes('--apply');

/* The account that stays with لوليز rather than following the data. */
const LULIZ_ACCOUNT_EMAIL = 'admin@luliz.com';

/* The new login for عجينة وطحينة, who own everything else. */
const AJEENA_ADMIN = {
  name: 'مدير عجينة وطحينة',
  email: 'admin@ajeena.com',
  password: '123456',
  role: 'admin',
};

const line = (label, value) => console.log('  ' + String(label).padEnd(26) + value);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  console.log(APPLY ? '\n⚙️  تنفيذ فعلي — الكتابة مفعّلة\n' : '\n🔎 وضع تجريبي — لن يُكتب أي شيء\n');
  line('قاعدة البيانات', db.databaseName);
  console.log('');

  const collections = (await db.listCollections().toArray()).map(c => c.name).sort();

  /* ── 1. Stamp every untagged row as عجينة وطحينة ── */
  let stamped = 0;
  for (const name of collections) {
    const col = db.collection(name);
    const pending = await col.countDocuments({ tenant: { $exists: false } });
    if (!pending) { line(name, 'لا شيء'); continue; }

    if (APPLY) await col.updateMany({ tenant: { $exists: false } }, { $set: { tenant: 'ajeena' } });
    stamped += pending;
    line(name, `${pending} → ajeena`);
  }

  /* ── 2. Hand the existing login back to لوليز ── */
  console.log('');
  const users = db.collection('users');
  const owner = await users.findOne({ email: LULIZ_ACCOUNT_EMAIL });
  if (owner) {
    if (APPLY) await users.updateOne({ _id: owner._id }, { $set: { tenant: 'luliz' } });
    line('حساب لوليز', `${owner.email} → luliz`);
  } else {
    line('حساب لوليز', `⚠️  ${LULIZ_ACCOUNT_EMAIL} غير موجود`);
  }

  /* ── 3. Give عجينة a way in to their own data ── */
  const existing = await users.findOne({ email: AJEENA_ADMIN.email });
  if (existing) {
    line('حساب عجينة', `${AJEENA_ADMIN.email} موجود مسبقاً — تُرك كما هو`);
  } else if (APPLY) {
    await users.insertOne({
      name: AJEENA_ADMIN.name,
      email: AJEENA_ADMIN.email,
      passwordHash: await bcrypt.hash(AJEENA_ADMIN.password, 12),
      role: AJEENA_ADMIN.role,
      isActive: true,
      tenant: 'ajeena',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    line('حساب عجينة', `${AJEENA_ADMIN.email} → أُنشئ`);
  } else {
    line('حساب عجينة', `${AJEENA_ADMIN.email} → سيُنشأ`);
  }

  /* ── 4. Report the resulting split ── */
  console.log('\nالتوزيع النهائي:');
  for (const name of collections) {
    const col = db.collection(name);
    const [aj, lz, none] = await Promise.all([
      col.countDocuments({ tenant: 'ajeena' }),
      col.countDocuments({ tenant: 'luliz' }),
      col.countDocuments({ tenant: { $exists: false } }),
    ]);
    if (aj + lz + none === 0) continue;
    line(name, `عجينة ${aj}  ·  لوليز ${lz}` + (none ? `  ·  بلا علامة ${none} ⚠️` : ''));
  }

  console.log(`\n${APPLY ? 'تم ترحيل' : 'سيُرحَّل'} ${stamped} سجل.`);
  if (!APPLY) console.log('أعد التشغيل مع --apply للتنفيذ.\n');

  await mongoose.disconnect();
})().catch(e => { console.error('فشل الترحيل:', e.message); process.exit(1); });
