// src/middlewares/error.middleware.js
// ─────────────────────────────────────────────────────────────
// Global Error Handler — MyLocalBazaar.store
// Catches all errors from async routes and formats responses
// ─────────────────────────────────────────────────────────────

const logger = require('../config/logger');

// Custom application error class
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Map Postgres error codes to user-friendly messages
const handlePGError = (err) => {
  if (err.code === '23505') {            // unique_violation
    const field = err.detail?.match(/Key \((.+?)\)/)?.[1] || 'field';
    return new AppError(`${field} already exists`, 409, 'DUPLICATE_ENTRY');
  }
  if (err.code === '23503') {            // foreign_key_violation
    return new AppError('Referenced record not found', 404, 'FOREIGN_KEY_ERROR');
  }
  if (err.code === '23502') {            // not_null_violation
    const col = err.column || 'field';
    return new AppError(`${col} is required`, 400, 'NULL_VIOLATION');
  }
  return new AppError('Database error occurred', 500, 'DB_ERROR');
};

const handleJWTError = () =>
  new AppError('Invalid authentication token', 401, 'INVALID_TOKEN');

const handleJWTExpiredError = () =>
  new AppError('Your session has expired. Please log in again', 401, 'TOKEN_EXPIRED');

const handleMulterError = (err) =>
  new AppError(err.message || 'File upload error', 400, 'FILE_UPLOAD_ERROR');

// ── Global error handler middleware ───────────────────────────
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Convert known error types
  if (err.code && err.code.startsWith('2'))     error = handlePGError(err);
  else if (err.name === 'JsonWebTokenError')     error = handleJWTError();
  else if (err.name === 'TokenExpiredError')     error = handleJWTExpiredError();
  else if (err.name === 'MulterError')           error = handleMulterError(err);

  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Log server errors
  if (statusCode >= 500) {
    logger.error('Server error', {
      message: err.message,
      stack:   err.stack,
      url:     req.originalUrl,
      method:  req.method,
      ip:      req.ip,
    });
  }

  res.status(statusCode).json({
    success:   false,
    message:   error.message || 'Internal server error',
    code:      error.code    || 'SERVER_ERROR',
    ...(isProduction ? {} : { stack: err.stack }),
  });
};

// ── 404 handler ───────────────────────────────────────────────
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
  });
};

module.exports = { errorHandler, notFound, AppError };
