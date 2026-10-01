'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User   = require('../models/User');

/* GET /api/setup/init — يُنشئ المدير إذا ما في مستخدمين */
router.get('/init', async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_SETUP_INIT !== 'true') {
    return res.status(404).json({ success: false, message: 'الإعداد الأولي معطّل.' });
  }
  const count = await User.countDocuments();
  if (count > 0) {
    return res.json({ success: false, message: 'المستخدمون موجودون مسبقاً — لا حاجة للإعداد.' });
  }

  const passwordHash = await bcrypt.hash('123456', 12);
  await User.create({
    name: 'إدارة عجينة وطحينة',
    email: 'admin@ajineh-w-tahineh.com',
    phone: '0991234567',
    passwordHash,
    role: 'admin',
  });

  res.json({
    success: true,
    message: 'تم إنشاء حساب المدير بنجاح',
    email: 'admin@ajineh-w-tahineh.com',
    password: '123456',
  });
});

module.exports = router;
