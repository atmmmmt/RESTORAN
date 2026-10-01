'use strict';

const User = require('../models/User');

async function ensureAmericansManager() {
  const email = String(process.env.AMERICANS_MANAGER_EMAIL || 'americans@restoran.local').trim().toLowerCase();
  const password = String(process.env.AMERICANS_MANAGER_PASSWORD || '');
  const name = String(process.env.AMERICANS_MANAGER_NAME || 'إدارة الأميركان').trim() || 'إدارة الأميركان';

  if (!password) {
    console.log(`ℹ️  حساب إدارة الأميركان (${email}) بانتظار AMERICANS_MANAGER_PASSWORD قبل إنشائه تلقائياً.`);
    return null;
  }
  if (password.length < 10) {
    throw new Error('AMERICANS_MANAGER_PASSWORD يجب أن يكون 10 أحرف على الأقل');
  }

  let user = await User.findByEmail(email);
  if (!user) {
    user = new User({ name, email, role: 'americans_manager', isActive: true, centerId: null });
    user.password = password;
    await user.save();
    console.log(`✅ تم إنشاء حساب إدارة الأميركان: ${email}`);
    return user;
  }

  let changed = false;
  if (user.role !== 'americans_manager') { user.role = 'americans_manager'; changed = true; }
  if (user.name !== name) { user.name = name; changed = true; }
  if (user.isActive === false) { user.isActive = true; changed = true; }
  if (user.centerId) { user.centerId = null; changed = true; }
  if (changed) await user.save();
  return user;
}

module.exports = ensureAmericansManager;
