'use strict';

// Business reports and daily closings must follow Syria local time even when
// the VPS itself runs on UTC. An explicit TZ from the environment still wins.
process.env.TZ = process.env.TZ || 'Asia/Damascus';

require('dotenv').config();
require('express-async-errors');

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const mountRoutes = require('./routes/index');
const errorHandler = require('./middleware/errorHandler');
const idempotency = require('./middleware/idempotency');

const app = express();

// Security headers
app.use(helmet({
  // Uploaded images / QR assets may be consumed by the separate frontend host.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(compression());

// CORS: this deployment belongs to عجينة وطحينة only. Production domains are
// supplied through FRONTEND_URL instead of being hard-coded to another brand.
// Multiple origins can be supplied as a comma-separated list.
const FRONTEND_ORIGINS = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/[/]$/, ''))
  .filter(Boolean);

const ALLOWED_ORIGINS = [
  ...FRONTEND_ORIGINS,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      console.warn(`⚠️  CORS: رُفض الطلب من ${origin}`);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Tenant',
      'X-Replayed-Offline',
      'Idempotency-Key',
    ],
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Nginx/Hostinger proxy: use the real client IP for rate limiting.
app.set('trust proxy', 1);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً.',
  },
});
app.use('/api/', apiLimiter);

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'محاولات دخول كثيرة، حاول لاحقاً.' },
}));

app.use('/api/', idempotency);

app.get('/health', (req, res) => res.json({ success: true, uptime: process.uptime() }));
app.get('/api/health', (req, res) => res.json({ success: true, uptime: process.uptime() }));

mountRoutes(app);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `المسار ${req.originalUrl} غير موجود` });
});

app.use(errorHandler);

const PORT = process.env.PORT || 3002;
let server;

async function startServer() {
  await connectDB();
  server = app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT} في وضع ${process.env.NODE_ENV || 'development'}`);
  });

  // Fingerprint polling is optional and must never prevent the API from booting.
  try {
    require('./services/attendanceScheduler').start();
  } catch (err) {
    console.error('⚠️  تعذّر تشغيل مزامنة البصمة:', err.message);
  }
}

function shutdown(signal) {
  console.log(`⚠️  ${signal} received — shutting down gracefully`);
  if (server) {
    server.close(() => {
      console.log('🔌 HTTP server closed');
      // db.js owns the Mongoose shutdown handlers.
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startServer().catch((err) => {
  console.error('❌ فشل تشغيل الخادم:', err);
  process.exit(1);
});

module.exports = app;
