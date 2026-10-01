'use strict';

/* The shop runs on Damascus time. The server box is UTC, which put every sale
   between midnight and 3am into the previous day's figures. */
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

/* Tenant scoping is a global mongoose plugin, so it has to be registered
   before the first model is compiled — that happens as soon as the routes are
   required below. Moving this line down silently un-scopes every model. */
require('mongoose').plugin(require('./tenancy/plugin'));

const mountRoutes = require('./routes/index');
const tenantContext = require('./middleware/tenant');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security headers
app.use(helmet());

// Compression
app.use(compression());

// CORS
const ALLOWED_ORIGINS = [
  'https://loliz-taste.com',
  'https://www.loliz-taste.com',
  process.env.FRONTEND_URL,
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Replayed-Offline', 'X-Tenant'],
    exposedHeaders: ['X-Resolved-Tenant'],
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
   so the whole shop (and every customer) shared one rate-limit bucket and a
   single busy dashboard locked everyone out. Trust the one proxy hop. */
app.set('trust proxy', 1);

// Rate limiting for /api/ — per real client IP. The dashboard polls orders,
// the kitchen screen and the POS, so a working device legitimately makes a lot
// of requests; this only stops genuine floods.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً.',
  },
});
app.use('/api/', apiLimiter);

// Login gets its own tighter limit against password guessing — only failed
// attempts count, so staff signing in normally never hit it.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'محاولات دخول خاطئة كثيرة — انتظر ربع ساعة وجرّب من جديد.',
  },
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/center-portal/login', loginLimiter);

/* Everything under /api is answered on behalf of one brand. Must sit above the
   route mounts so the context is open before any handler queries. */
app.use('/api/', tenantContext);

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
