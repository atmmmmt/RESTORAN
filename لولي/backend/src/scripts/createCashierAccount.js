'use strict';

/**
 * One-off: create the cashier login for لوليز's POS counter.
 *
 * Runs inside لوليز's tenant scope explicitly (this account belongs to the
 * shop that asked for it, not whichever brand happens to be DEFAULT_TENANT).
 *
 *   node src/scripts/createCashierAccount.js             ← dry run
 *   node src/scripts/createCashierAccount.js --apply     ← creates the account
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { runWithTenant } = require('../tenancy/context');
require('mongoose').plugin(require('../tenancy/plugin'));

const APPLY = process.argv.includes('--apply');

const ACCOUNT = {
  name: 'كاشير',
  email: 'cashier@luliz.com',
  password: '123456',
  role: 'cashier',
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
    console.log('\n✓ تم إنشاء حساب الكاشير.');
  });

  await mongoose.disconnect();
})().catch(e => { console.error('فشل:', e.message); process.exit(1); });
