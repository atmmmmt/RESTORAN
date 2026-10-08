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

    /* Admin-wide branch switcher. Accounts that are permanently assigned to
       a branch keep their own centerId. Unbound management accounts may pick
       an active branch from the admin header; downstream routes can then use
       the same req.user.centerId logic they already use for branch staff. */
    const requestedCenter = String(req.headers['x-admin-center'] || '').trim();
    if (
      requestedCenter &&
      !user.centerId &&
      ['admin', 'supervisor', 'viewer'].includes(user.role)
    ) {
      const selectedCenter = await SalesCenter.findOne({ _id: requestedCenter, isActive: true }).select('_id');
      if (selectedCenter) {
        req.adminCenterId = selectedCenter._id;
        req.user.centerId = selectedCenter._id;
        if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
          req.body.centerId = String(selectedCenter._id);
        }
      }
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

/** Cash-register access without granting inventory, payroll or settings. */
const requirePos = (req, res, next) => {
  if (!req.user || !['admin', 'supervisor', 'cashier'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'هذه العملية مخصصة للكاشير أو الإدارة.' });
  }
  next();
};

/** Kitchen board operators can only consume and advance order tickets. */
const requireKitchen = (req, res, next) => {
  if (!req.user || !['admin', 'supervisor', 'cashier', 'kitchen'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'هذه العملية مخصصة لفريق التشغيل.' });
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

module.exports = { protect, requireAdmin, requireStaff, requirePos, requireKitchen, requireRole, protectCenter };
