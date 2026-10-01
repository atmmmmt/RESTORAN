# Luliz — نظام الإدارة والتشغيل

مشروع مطعم لوليز ويضم موقع الزبائن، لوحة الإدارة، المطبخ، نقطة البيع، المخزون، المشتريات، الإنتاج، المبيعات، الهدر، المراكز، التقارير والـ API الخلفي.

## هيكل المشروع

```text
لولي/
├── backend/      Node.js + Express + MongoDB
├── frontend/     React + Vite + Tailwind CSS
├── handover/     ملفات التسليم
├── print-agent/  وكيل الطباعة
├── admin.html    نموذج HTML قديم/مرجعي
└── customer.html نموذج HTML قديم/مرجعي
```

## التشغيل المحلي

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

الإعدادات الأساسية:

```env
PORT=3002
MONGODB_URI=mongodb://localhost:27017/luliz
JWT_SECRET=ضع-قيمة-طويلة-وعشوائية
JWT_EXPIRES_IN=7d
NODE_ENV=development
TZ=Asia/Damascus
FRONTEND_URL=http://localhost:5173
DEFAULT_TENANT=luliz
TENANT_HOSTS=loliz-taste.com=luliz,www.loliz-taste.com=luliz
ALLOW_DESTRUCTIVE_SEED=false
SEED_TENANT=luliz
```

Health check:

```text
http://localhost:3002/health
http://localhost:3002/api/health
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

الإعدادات الأساسية:

```env
VITE_API_URL=http://localhost:3002/api
VITE_WA_NUMBER=963XXXXXXXXX
VITE_TENANT=luliz
```

واجهة Vite تعمل افتراضياً على:

```text
http://localhost:5173
```

## عزل بيانات Luliz

الـ backend يحتوي طبقة tenant scoping لحماية بيانات العلامات. هذا المجلد مضبوط بحيث تكون العلامة الافتراضية هي:

```text
luliz
```

طلبات الواجهة ترسل `X-Tenant: luliz`، كما أن نطاق `loliz-taste.com` مربوط صراحةً بـ `luliz`.

## تنبيه مهم بخصوص Seed

الـ seed يمسح بيانات العلامة المستهدفة قبل إعادة إنشاء البيانات التجريبية، لذلك أصبح محمياً ولا يعمل افتراضياً.

لتشغيله على بيئة تطوير فقط:

```env
ALLOW_DESTRUCTIVE_SEED=true
SEED_TENANT=luliz
```

ثم:

```bash
npm run seed
```

الـ runner يسجل Mongoose tenant plugin قبل تحميل الموديلات ويشغل الـ seed داخل سياق `luliz`، حتى تكون البيانات الجديدة معزولة بشكل صحيح ولا تُنشأ خارج tenant.

## إعداد الإنتاج

قبل النشر:

- استخدم `JWT_SECRET` طويل وعشوائي.
- لا ترفع ملف `.env` إلى Git.
- اضبط `MONGODB_URI` على قاعدة الإنتاج.
- اضبط `FRONTEND_URL` على الدومين الحقيقي؛ ويمكن فصل أكثر من Origin بفاصلة عند الحاجة.
- اترك `DEFAULT_TENANT=luliz` لهذا النشر.
- اترك `TZ=Asia/Damascus` لحساب الأيام والتقارير بشكل صحيح.
- اترك `ALLOW_DESTRUCTIVE_SEED=false` دائماً على الإنتاج.
- ابنِ الواجهة بـ `npm run build` وقدّم `frontend/dist` من الويب سيرفر.

## ملاحظات تنظيف

- WebAR/Virtual Try-On كان بقايا من مشروع آخر وتم تعطيل نقاط دخوله مع إبقاء الملفات القديمة لتجنب كسر imports تاريخية.
- بورت الـ backend الحقيقي الافتراضي هو `3002` وليس `5000`.
- بورت Vite المحلي الافتراضي هو `5173`.

## التقنيات

**Backend:** Node.js · Express · MongoDB · Mongoose · JWT · bcryptjs · Helmet · Rate Limit

**Frontend:** React 18 · Vite 5 · Tailwind CSS · React Router · Axios · Framer Motion · Recharts
