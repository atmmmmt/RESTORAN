'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User   = require('../models/User');

/* GET /api/setup/init — يُنشئ المدير إذا ما في مستخدمين */
router.get('/init', async (req, res) => {
  const count = await User.countDocuments();
  if (count > 0) {
    return res.json({ success: false, message: 'المستخدمون موجودون مسبقاً — لا حاجة للإعداد.' });
  }

  const passwordHash = await bcrypt.hash('123456', 12);
  await User.create({
    name: 'مديرة لوليز',
    email: 'admin@luliz.com',
    phone: '0991234567',
    passwordHash,
    role: 'admin',
  });

  res.json({
    success: true,
    message: 'تم إنشاء حساب المدير بنجاح',
    email: 'admin@luliz.com',
    password: '123456',
  });
});

module.exports = router;
