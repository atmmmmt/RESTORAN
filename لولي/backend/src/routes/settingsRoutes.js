'use strict';

const router = require('express').Router();
const { protect } = require('../middleware/auth');
const authController = require('../controllers/authController');

router.use(protect);

router.get('/', (req, res) => {
  res.json({ success: true, user: req.user });
});

router.put('/', async (req, res) => {
  const User = require('../models/User');
  const { name, phone } = req.body;
  const user = await User.findById(req.user._id);
  if (name) user.name = name;
  if (phone) user.phone = phone;
  await user.save();
  res.json({ success: true, message: 'تم تحديث الإعدادات.', user });
});

router.put('/password', authController.changePassword);

module.exports = router;
