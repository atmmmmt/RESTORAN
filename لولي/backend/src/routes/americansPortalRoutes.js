'use strict';

const router = require('express').Router();

function ajeenaOrigin() {
  return String(
    process.env.AJEENA_API_ORIGIN ||
    'https://dodgerblue-curlew-950894.hostingersite.com'
  ).replace(/\/$/, '');
}

async function forward(path, options = {}) {
  const response = await fetch(`${ajeenaOrigin()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant': 'ajeena',
      ...(options.headers || {}),
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = { success: false, message: 'تعذّر قراءة رد خدمة إدارة الأميركان' };
  }

  return { response, data };
}

// One login URL on loliz-taste.com, while the canonical Americans account
// remains owned by the Ajeena backend.
router.post('/login', async (req, res) => {
  try {
    const { response, data } = await forward('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: req.body?.email || '',
        password: req.body?.password || '',
      }),
    });

    if (!response.ok) return res.status(response.status).json(data);

    if (data?.user?.role !== 'americans_manager') {
      return res.status(403).json({
        success: false,
        message: 'هذا الرابط مخصص لحساب إدارة الأميركان فقط.',
      });
    }

    return res.json(data);
  } catch (err) {
    console.error('Americans portal login proxy failed:', err.message);
    return res.status(502).json({
      success: false,
      message: 'تعذّر الاتصال بخدمة إدارة الأميركان.',
    });
  }
});

router.get('/summary', async (req, res) => {
  const auth = req.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول أولاً.' });
  }

  try {
    const qs = new URLSearchParams();
    if (req.query.start) qs.set('start', String(req.query.start));
    if (req.query.end) qs.set('end', String(req.query.end));

    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const { response, data } = await forward(`/api/americans-management/summary${suffix}`, {
      method: 'GET',
      headers: { Authorization: auth },
    });

    return res.status(response.status).json(data);
  } catch (err) {
    console.error('Americans portal summary proxy failed:', err.message);
    return res.status(502).json({
      success: false,
      message: 'تعذّر تحميل البيانات المالية الموحدة.',
    });
  }
});

module.exports = router;
