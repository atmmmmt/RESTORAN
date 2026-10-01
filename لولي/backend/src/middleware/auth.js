'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SalesCenter = require('../models/SalesCenter');

/**
 * Middleware to protect routes — verifies JWT and attaches req.user
 */
const protect = async (req, res, next) => {
  let token;

  // Extract token from Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'غير مصرح. يجب تسجيل الدخول أولاً.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'المستخدم غير موجود.' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ success: false, message: 'تم تعطيل هذا الحساب. راجع المدير.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.' });
    }
    return res.status(401).json({ success: false, message: 'رمز المصادقة غير صالح.' });
  }
};

/**
 * Middleware to require admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'غير مصرح. يجب أن تكون مديراً للقيام بهذه العملية.' });
  }
  next();
};

/**
 * Middleware to require admin OR supervisor (operational staff).
 * Supervisors run day-to-day operations — purchases, sales, production,
 * orders, waste — but cannot touch employees, payroll, users or settings.
 */
const requireStaff = (req, res, next) => {
  if (!req.user || !['admin', 'supervisor'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'غير مصرح. صلاحياتك لا تسمح بهذه العملية.' });
  }
  next();
};

/**
 * Factory — restrict a route to an explicit list of roles.
 * Usage: router.post('/', protect, requireRole('admin', 'supervisor'), handler)
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'غير مصرح. صلاحياتك لا تسمح بهذه العملية.' });
  }
  next();
};

/**
 * Middleware to require admin, supervisor OR cashier — the counter.
 * 'cashier' exists only to ring up orders and watch the kitchen board; it
 * must never inherit access to anything reached through requireStaff.
 */
const requirePOS = requireRole('admin', 'supervisor', 'cashier');

/**
 * Blocks the 'cashier' role from a route outright.
 *
 * Cash, purchasing, inventory, sales and reporting routes were written before
 * 'cashier' existed and only ever checked `protect` (any signed-in account),
 * because every role that could log in back then — admin, supervisor, viewer —
 * was already trusted with the books. 'cashier' breaks that assumption: the
 * whole point of the role is that it must NOT see them. This closes that gap
 * explicitly on each such route rather than relying on the frontend to hide
 * the button.
 */
const blockCashier = (req, res, next) => {
  if (req.user?.role === 'cashier') {
    return res.status(403).json({ success: false, message: 'غير مصرح. حساب الكاشير مخصص لنقطة البيع فقط.' });
  }
  next();
};

/**
 * Middleware for center portal — verifies center JWT and attaches req.center
 */
const protectCenter = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: 'غير مصرح. يجب تسجيل الدخول أولاً.' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'center') {
      return res.status(403).json({ success: false, message: 'هذا الرمز غير مخصص لبوابة المراكز.' });
    }
    const center = await SalesCenter.findById(decoded.centerId);
    if (!center || !center.isActive) {
      return res.status(401).json({ success: false, message: 'المركز غير موجود أو غير نشط.' });
    }
    req.center = center;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مجدداً.' });
    }
    return res.status(401).json({ success: false, message: 'رمز المصادقة غير صالح.' });
  }
};

module.exports = { protect, requireAdmin, requireStaff, requireRole, requirePOS, blockCashier, protectCenter };
