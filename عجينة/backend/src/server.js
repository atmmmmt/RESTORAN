'use strict';

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
  // The frontend is served from its own domain, so static files this API
  // hands back (uploads, QR codes) are cross-origin by definition — helmet's
  // same-origin default makes the browser drop them.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Compression
app.use(compression());

// CORS
// FRONTEND_URL takes a comma-separated list so one deployment can serve
// several storefront domains (apex + www, or a second brand) without a code
// change — each entry is matched exactly against the request's Origin.
const FRONTEND_ORIGINS = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/[/]$/, ''))
  .filter(Boolean);

const ALLOWED_ORIGINS = [
  'https://loliz-taste.com',
  'https://www.loliz-taste.com',
  ...FRONTEND_ORIGINS,
  // Vite picks the first free port from 5173 upward, so allow the usual few.
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      // Refuse by omitting the CORS headers rather than throwing — an Error
      // here escapes into the error handler and answers preflights with a
      // 500, which hides the real reason from the browser console.
      console.warn(`⚠️  CORS: رُفض الطلب من ${origin}`);
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    /* X-Replayed-Offline is set by the offline queue when it re-sends a
       write. A custom header triggers a CORS preflight, so omitting it here
       makes every replayed request fail — the queue would never drain. */
    /* Every custom header the client sends must be listed here, or the
       browser's preflight fails and the request never leaves — which the
       client only sees as a generic network error.
         X-Tenant            — which store the request belongs to
         X-Replayed-Offline  — marks a write being re-sent from the offline queue */
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant', 'X-Replayed-Offline', 'Idempotency-Key'],
  })
);

// Body parsing — 2 MB ceiling is enough for JSON + base64 image URLs
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// HTTP request logging (development only)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

/* Behind nginx: without this every request looks like it came from 127.0.0.1,
   so all users shared one rate-limit bucket and a busy shift locked everyone
   out ("طلبات كثيرة"). Trust the one proxy hop so limits are per real client. */
app.set('trust proxy', 1);

// Rate limiting for /api/
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
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

// Health check — both paths so the deploy panel and Cloudflare can probe either
app.get('/health',     (req, res) => res.json({ success: true, uptime: process.uptime() }));
app.get('/api/health', (req, res) => res.json({ success: true, uptime: process.uptime() }));

// Mount all API routes
mountRoutes(app);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `المسار ${req.originalUrl} غير موجود` });
});

// Global error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3002;
let server;

async function startServer() {
  await connectDB();
  server = app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل على المنفذ ${PORT} في وضع ${process.env.NODE_ENV || 'development'}`);
  });

  // Fingerprint terminal poller — failures here must never block the API.
  try {
    require('./services/attendanceScheduler').start();
  } catch (err) {
    console.error('⚠️  تعذّر تشغيل مزامنة البصمة:', err.message);
  }
}

// Graceful shutdown — close HTTP server first, then DB, then exit.
// db.js already handles mongoose.connection.close() on these signals,
// so here we only add the HTTP server half.
function shutdown(signal) {
  console.log(`⚠️  ${signal} received — shutting down gracefully`);
  if (server) {
    server.close(() => {
      console.log('🔌 HTTP server closed');
      // db.js SIGTERM/SIGINT handlers close Mongoose and call process.exit
    });
    // Force-exit after 10 s if connections are stuck
    setTimeout(() => process.exit(1), 10_000).unref();
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

startServer().catch((err) => {
  console.error('❌ فشل تشغيل الخادم:', err);
  process.exit(1);
});

module.exports = app;
