'use strict';

/**
 * لوليز currently has no admin account: the original admin@luliz.com was
 * deleted at some point (the users collection was down to exactly the
 * accounts this session created), and the account that took its place,
 * hukmat@gmail.com, turned out to belong to عجينة وطحينة, not لوليز — so it
 * was re-tagged there instead (see backfillLiveActivity.js). Without this,
 * لوليز would launch with a cashier login and no one able to reach the rest
 * of the dashboard.
 *
 *   node src/scripts/createLulizAdmin.js             ← dry run
 *   node src/scripts/createLulizAdmin.js --apply     ← creates the account
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { runWithTenant } = require('../tenancy/context');
require('mongoose').plugin(require('../tenancy/plugin'));

const APPLY = process.argv.includes('--apply');

const ACCOUNT = {
  name: 'مديرة لوليز',
  email: 'admin@luliz.com',
  password: '123456',
  role: 'admin',
};

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../models/User');

  await runWithTenant('luliz', async () => {
    const existing = await User.findOne({ email: ACCOUNT.email });
    if (existing) {
      console.log(`الحساب ${ACCOUNT.email} موجود مسبقاً — لم يتغيّر شيء.`);
      return;
    }

    console.log(APPLY ? '⚙️  إنشاء الحساب…' : '🔎 وضع تجريبي — لن يُنشأ شيء');
    console.log(`  الاسم:      ${ACCOUNT.name}`);
    console.log(`  الإيميل:    ${ACCOUNT.email}`);
    console.log(`  كلمة السر:  ${ACCOUNT.password}`);
    console.log(`  الصلاحية:   ${ACCOUNT.role}`);

    if (!APPLY) {
      console.log('\nأعد التشغيل مع --apply للتنفيذ.');
      return;
    }

    await User.create({
      name: ACCOUNT.name,
      email: ACCOUNT.email,
      passwordHash: await bcrypt.hash(ACCOUNT.password, 12),
      role: ACCOUNT.role,
      isActive: true,
    });
    console.log('\n✓ تم إنشاء حساب مدير لوليز.');
  });

  await mongoose.disconnect();
})().catch(e => { console.error('فشل:', e.message); process.exit(1); });
