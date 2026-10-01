# 🍳 Luliz — نظام إدارة المطبخ

منصة متكاملة لإدارة مطبخ لوليز المنزلي. تشمل موقع الزبائن ولوحة تحكم مدير المطبخ والـ API الخلفي.

---

## 🗂 هيكل المشروع

```
loliz project/
├── backend/          ← Node.js + Express + MongoDB
├── frontend/         ← React + Vite + Tailwind CSS
├── customer.html     ← نموذج HTML أولي للزبائن
└── admin.html        ← نموذج HTML أولي للإدارة
```

---

## 🚀 تشغيل المشروع

### 1. إعداد قاعدة البيانات

تأكد من تشغيل MongoDB محلياً على المنفذ `27017`.

---

### 2. Backend

```bash
cd backend
npm install
```

انسخ ملف البيئة:
```bash
cp .env.example .env
```

عدّل `.env`:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/luliz
JWT_SECRET=luliz-secret-key-2025-change-me
JWT_EXPIRES_IN=7d
NODE_ENV=development
FRONTEND_URL=http://localhost:5174
```

أضف بيانات تجريبية:
```bash
npm run seed
```

شغّل الخادم:
```bash
npm run dev
```

الخادم يعمل على: `http://localhost:5000`

---

### 3. Frontend

```bash
cd frontend
npm install
```

انسخ ملف البيئة:
```bash
cp .env.example .env
```

عدّل `.env`:
```
VITE_API_URL=http://localhost:5000/api
VITE_WA_NUMBER=963XXXXXXXXX
```

شغّل التطبيق:
```bash
npm run dev
```

التطبيق يعمل على: `http://localhost:5174`

---

## 🔐 بيانات الدخول (بعد التهيئة)

| الحقل | القيمة |
|---|---|
| البريد | `admin@luliz.com` |
| كلمة السر | `123456` |

---

## 🌐 الصفحات والروابط

### الموقع (الزبائن)
| الصفحة | الرابط |
|---|---|
| الرئيسية | `http://localhost:5174/` |
| المنيو | `http://localhost:5174/menu` |
| العروض | `http://localhost:5174/offers` |
| من نحن | `http://localhost:5174/about` |
| الطلب | `http://localhost:5174/order` |

### لوحة التحكم
| الصفحة | الرابط |
|---|---|
| تسجيل الدخول | `http://localhost:5174/admin/login` |
| الإحصاءات | `http://localhost:5174/admin/dashboard` |
| المنتجات | `http://localhost:5174/admin/products` |
| المكونات | `http://localhost:5174/admin/ingredients` |
| المشتريات | `http://localhost:5174/admin/purchases` |
| الإنتاج | `http://localhost:5174/admin/production` |
| المبيعات | `http://localhost:5174/admin/sales` |
| الهدر | `http://localhost:5174/admin/waste` |
| مراكز البيع | `http://localhost:5174/admin/centers` |
| الطلبات | `http://localhost:5174/admin/orders` |
| العروض | `http://localhost:5174/admin/offers` |
| الكاش | `http://localhost:5174/admin/cash` |
| التقارير | `http://localhost:5174/admin/reports` |
| الجرد اليومي | `http://localhost:5174/admin/daily-closing` |
| الإعدادات | `http://localhost:5174/admin/settings` |

---

## 🎨 هوية العلامة التجارية

| اللون | الكود |
|---|---|
| الفوشيا (الرئيسي) | `#D72B6A` |
| الأصفر الذهبي | `#F6B91A` |
| الأخضر النعناعي | `#78C8A6` |
| الوردي الناعم | `#F7A7C4` |
| النص الداكن | `#3A2630` |
| الخلفية | `#FFF7F4` |

---

## 📡 API المرجعية

```
Base URL: http://localhost:5000/api

Auth:           POST /auth/login, GET /auth/me
Products:       GET /products/public, GET|POST /products, PUT|DELETE /products/:id
Ingredients:    CRUD /ingredients
Purchases:      GET|POST /purchases
Production:     GET|POST /production-batches
Sales:          GET|POST /sales, GET /sales/:id
Centers:        CRUD /centers, GET /centers/:id/summary
Deliveries:     GET|POST /center-deliveries
Settlements:    GET|POST /center-settlements
Waste:          GET|POST /waste, GET /waste/summary
Offers:         GET /offers/public, CRUD /offers
Orders:         GET|POST /orders, PUT /orders/:id/status
Cash:           GET /cash/balance, GET /cash/transactions, POST /cash/manual-income|expense|adjustment
Reports:        GET /reports/dashboard|daily|monthly|products|centers|waste|profit-loss
Daily Closing:  GET|POST /daily-closing
Settings:       GET|PUT /settings, PUT /settings/password
```

---

## ⚙️ التقنيات المستخدمة

**Backend:** Node.js · Express.js · MongoDB · Mongoose · JWT · bcryptjs

**Frontend:** React 18 · Vite 5 · Tailwind CSS 3 · Framer Motion · React Router v6 · Axios · Recharts

---

*صُنع بحب لـ Luliz Kitchen ♡ — 2025*
