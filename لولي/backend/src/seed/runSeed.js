'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
  console.error('❌ تم إيقاف seed لأنه يمسح بيانات العلامة قبل إعادة إنشائها.');
  console.error('إذا كنت على بيئة تطوير وتريد المتابعة، ضع ALLOW_DESTRUCTIVE_SEED=true مؤقتاً.');
  process.exit(1);
}

const mongoose = require('mongoose');
const tenantPlugin = require('../tenancy/plugin');
const { isTenant, runWithTenant } = require('../tenancy/context');

const tenant = String(process.env.SEED_TENANT || 'luliz').trim().toLowerCase();
if (!isTenant(tenant)) {
  console.error(`❌ SEED_TENANT غير صالح: ${tenant}`);
  process.exit(1);
}

// Register before seed.js imports any models, so every model gets tenant scoping.
mongoose.plugin(tenantPlugin);

console.log(`⚠️  تشغيل seed للعلامة: ${tenant}`);
runWithTenant(tenant, () => {
  require('./seed');
});
