# عجينة وطحينة — نظام الإدارة والتشغيل

مشروع مستقل خاص بـ **عجينة وطحينة** ويضم موقع الزبائن، لوحة الإدارة، نقطة البيع، المخزون، المشتريات، الإنتاج، المبيعات، الهدر، الرواتب، الحضور، التقارير والـ API الخلفي.

تقرير الاختبار التشغيلي إن وُجد: [`docs/ACCEPTANCE_REPORT_AR.md`](docs/ACCEPTANCE_REPORT_AR.md)

## هيكل المشروع

```text
عجينة/
├── backend/          Node.js + Express + MongoDB
├── frontend/         React + Vite + Tailwind CSS
├── attendance-agent/ وكيل أجهزة الحضور
├── docs/             توثيق وتقارير
├── admin.html        نموذج HTML قديم/مرجعي
└── customer.html     نموذج HTML قديم/مرجعي
```

## التشغيل المحلي

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

الإعدادات الأساسية في `.env`:

```env
PORT=3002
MONGODB_URI=mongodb://localhost:27017/ajeena
JWT_SECRET=ضع-قيمة-طويلة-وعشوائية
JWT_EXPIRES_IN=7d
NODE_ENV=development
TZ=Asia/Damascus
FRONTEND_URL=http://localhost:5173
ALLOW_DESTRUCTIVE_SEED=false
```

الخادم الافتراضي:

```text
http://localhost:3002
http://localhost:3002/api/health
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

إعدادات الواجهة:

```env
VITE_API_URL=http://localhost:3002/api
VITE_WA_NUMBER=963XXXXXXXXX
VITE_TENANT=ajeena
```

واجهة Vite تعمل افتراضياً على:

```text
http://localhost:5173
```

## تنبيه مهم بخصوص Seed

`npm run seed` يمسح بيانات قاعدة البيانات قبل إنشاء بيانات تجريبية. لذلك أصبح محمياً افتراضياً ولن يعمل إلا عند وضع:

```env
ALLOW_DESTRUCTIVE_SEED=true
```

استخدمه فقط على قاعدة تطوير فارغة أو نسخة مخصصة للاختبار، ثم أعد القيمة إلى `false`.

## إعداد الإنتاج

قبل النشر:

- استخدم `JWT_SECRET` طويل وعشوائي ولا ترفع ملف `.env` إلى Git.
- استخدم MongoDB مخصصاً لعجينة وطحينة.
- ضع دومين الواجهة الحقيقي في `FRONTEND_URL`. يمكن وضع أكثر من Origin مفصولاً بفاصلة.
- اترك `TZ=Asia/Damascus` حتى تبقى الإغلاقات والتقارير اليومية على توقيت سوريا.
- اترك `ALLOW_DESTRUCTIVE_SEED=false` على السيرفر.
- شغّل الـ backend خلف Nginx/Hostinger proxy على المنفذ المحدد في `PORT`.
- ابنِ الواجهة بـ `npm run build` وقدّم مجلد `frontend/dist` من الويب سيرفر.

## ملاحظات تنظيف

- تم فصل CORS عن دومينات لوليز؛ هذا المشروع يعتمد فقط على `FRONTEND_URL` الخاص به.
- WebAR/Virtual Try-On كان بقايا من مشروع آخر وتم تعطيل نقاط دخوله مع إبقاء الملفات القديمة فقط لتجنب كسر imports تاريخية.
- اسم حزمة الـ backend أصبح `ajeena-backend` واسم حزمة الواجهة أصبح `ajeena-frontend`.

## التقنيات

**Backend:** Node.js · Express · MongoDB · Mongoose · JWT · bcryptjs · Helmet · Rate Limit

**Frontend:** React 18 · Vite 5 · Tailwind CSS · React Router · Axios · Framer Motion · Recharts
