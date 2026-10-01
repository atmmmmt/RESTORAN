'use strict';

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'حدث خطأ داخلي في الخادم';

  // Log error details
  if (process.env.NODE_ENV === 'development') {
    console.error('❌ خطأ:', err);
  } else {
    console.error(`❌ [${new Date().toISOString()}] ${err.name}: ${err.message}`);
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const errors = Object.values(err.errors).map((e) => e.message);
    message = errors.join('. ');
  }

  // Mongoose Cast Error (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `قيمة غير صالحة للحقل: ${err.path}`;
  }

  // Mongoose Duplicate Key Error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'الحقل';
    const value = err.keyValue ? err.keyValue[field] : '';
    message = `القيمة "${value}" موجودة بالفعل في الحقل: ${field}`;
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'رمز المصادقة غير صالح.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'انتهت صلاحية رمز المصادقة.';
  }

  // express-validator errors
  if (err.type === 'validation') {
    statusCode = 400;
    message = err.message;
  }

  const response = {
    success: false,
    message,
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.error = err.name;
  }

  res.status(statusCode).json(response);
};

module.exports = errorHandler;
