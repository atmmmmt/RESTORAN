'use strict';

const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

/**
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  }

  const { email, password } = req.body;

  const user = await User.findByEmail(email);
  if (!user) {
    return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة.' });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة.' });
  }

  if (user.isActive === false) {
    return res.status(403).json({ success: false, message: 'تم تعطيل هذا الحساب. راجع المدير.' });
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    success: true,
    message: 'تم تسجيل الدخول بنجاح',
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      centerId: user.centerId || null,
    },
  });
};

/**
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id).select('-passwordHash');
  if (!user) {
    return res.status(404).json({ success: false, message: 'المستخدم غير موجود.' });
  }

  res.json({ success: true, user });
};

/**
 * POST /api/auth/change-password
 */
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'كلمة المرور الحالية والجديدة مطلوبتان.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' });
  }

  const user = await User.findById(req.user._id);
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة.' });
  }

  user._password = newPassword;
  await user.save();

  res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح.' });
};

/**
 * POST /api/auth/verify-password
 *
 * Re-checks the signed-in user's own password. Used by pages that stay
 * reachable from an already-open dashboard but must not be opened by
 * accident — payroll and the employee file. Nothing is changed here; the
 * caller only learns whether the password matched.
 */
exports.verifyPassword = async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'أدخل كلمة السر.' });
  }

  const user = await User.findById(req.user._id);
  if (!user) return res.status(401).json({ success: false, message: 'الجلسة غير صالحة.' });

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'كلمة السر غير صحيحة.' });
  }

  res.json({ success: true, message: 'تم التحقق.' });
};
