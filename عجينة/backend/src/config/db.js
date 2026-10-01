'use strict';

const mongoose = require('mongoose');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

let retryCount = 0;

function connectWithRetry() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ MONGODB_URI is not defined in environment variables');
    process.exit(1);
  }

  return mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    })
    .then(() => {
      retryCount = 0;
      console.log('✅ MongoDB متصل بنجاح');
    })
    .catch((err) => {
      retryCount += 1;
      console.error(`❌ فشل الاتصال بـ MongoDB (محاولة ${retryCount}/${MAX_RETRIES}):`, err.message);

      if (retryCount < MAX_RETRIES) {
        console.log(`⏳ إعادة المحاولة بعد ${RETRY_DELAY_MS / 1000} ثوانٍ...`);
        return new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS)).then(connectWithRetry);
      } else {
        console.error('❌ تعذّر الاتصال بـ MongoDB بعد عدة محاولات. إيقاف التطبيق.');
        process.exit(1);
      }
    });
}

mongoose.connection.on('connected', () => {
  console.log('📦 Mongoose: متصل بقاعدة البيانات');
});

mongoose.connection.on('error', (err) => {
  console.error('⚠️ Mongoose خطأ في الاتصال:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ Mongoose: انقطع الاتصال بقاعدة البيانات');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('🔌 MongoDB: تم إغلاق الاتصال بأمان عند إيقاف التطبيق');
    process.exit(0);
  } catch (err) {
    console.error('❌ خطأ أثناء إغلاق MongoDB:', err.message);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  try {
    await mongoose.connection.close();
    console.log('🔌 MongoDB: تم إغلاق الاتصال بأمان (SIGTERM)');
    process.exit(0);
  } catch (err) {
    console.error('❌ خطأ أثناء إغلاق MongoDB (SIGTERM):', err.message);
    process.exit(1);
  }
});

module.exports = connectWithRetry;
