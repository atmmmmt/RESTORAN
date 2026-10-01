'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
  console.error('❌ تم إيقاف seed لأنه يمسح قاعدة البيانات قبل إعادة إنشاء البيانات التجريبية.');
  console.error('إذا كنت على بيئة تطوير وتريد المتابعة، ضع ALLOW_DESTRUCTIVE_SEED=true مؤقتاً.');
  process.exit(1);
}

require('./seed');
