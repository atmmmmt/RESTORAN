'use strict';

const router = require('express').Router();
const { protect, requireAdmin } = require('../middleware/auth');
const User = require('../models/User');

/* Managing dashboard accounts is strictly an admin job. */
router.use(protect, requireAdmin);

const ROLES = ['admin', 'supervisor', 'viewer', 'cashier'];

/* ── GET /api/users ── */
router.get('/', async (req, res) => {
  const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
  res.json({ success: true, users });
});

/* ── POST /api/users ── */
router.post('/', async (req, res) => {
  const { name, email, phone, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'الاسم والبريد وكلمة المرور مطلوبة' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }
  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: 'الصلاحية غير صحيحة' });
  }

  const exists = await User.findByEmail(email);
  if (exists) {
    return res.status(409).json({ success: false, message: 'هذا البريد مستخدم مسبقاً' });
  }

  const user = new User({ name, email, phone, role: role || 'supervisor' });
  user.password = password;          // virtual setter → hashed on save
  await user.save();

  res.status(201).json({ success: true, user, message: 'تم إنشاء الحساب بنجاح' });
});

/* ── PUT /api/users/:id ── */
router.put('/:id', async (req, res) => {
  const { name, email, phone, role, isActive, password } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: 'الصلاحية غير صحيحة' });
  }

  // Never let the last active admin lose admin rights or be disabled —
  // that would lock everyone out of the dashboard permanently.
  const losingAdmin = user.role === 'admin' && ((role && role !== 'admin') || isActive === false);
  if (losingAdmin) {
    const otherAdmins = await User.countDocuments({
      _id: { $ne: user._id }, role: 'admin', isActive: { $ne: false },
    });
    if (otherAdmins === 0) {
      return res.status(400).json({ success: false, message: 'لا يمكن تعديل آخر حساب مدير في النظام' });
    }
  }

  if (email && email.toLowerCase() !== user.email) {
    const taken = await User.findByEmail(email);
    if (taken) return res.status(409).json({ success: false, message: 'هذا البريد مستخدم مسبقاً' });
    user.email = email;
  }

  if (name     !== undefined) user.name     = name;
  if (phone    !== undefined) user.phone    = phone;
  if (role     !== undefined) user.role     = role;
  if (isActive !== undefined) user.isActive = isActive;

  if (password) {
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }
    user.password = password;
  }

  await user.save();
  res.json({ success: true, user, message: 'تم تحديث الحساب' });
});

/* ── DELETE /api/users/:id ── */
router.delete('/:id', async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) {
    return res.status(400).json({ success: false, message: 'لا يمكنك حذف حسابك الخاص' });
  }

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

  if (user.role === 'admin') {
    const otherAdmins = await User.countDocuments({
      _id: { $ne: user._id }, role: 'admin', isActive: { $ne: false },
    });
    if (otherAdmins === 0) {
      return res.status(400).json({ success: false, message: 'لا يمكن حذف آخر حساب مدير في النظام' });
    }
  }

  await user.deleteOne();
  res.json({ success: true, message: 'تم حذف الحساب' });
});

module.exports = router;
