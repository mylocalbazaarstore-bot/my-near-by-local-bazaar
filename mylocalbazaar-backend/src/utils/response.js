// src/utils/response.js
// ─────────────────────────────────────────────────────────────
// Standardized API Response Helpers — MyLocalBazaar.store
// Every endpoint uses these for consistent JSON format
// ─────────────────────────────────────────────────────────────

/**
 * Success response
 * { success: true, message, data, meta }
 */
const success = (res, data = null, message = 'Success', statusCode = 200, meta = null) =>
  res.status(statusCode).json({
    success: true,
    message,
    ...(data !== null && { data }),
    ...(meta && { meta }),
  });

/**
 * Created response (201)
 */
const created = (res, data = null, message = 'Created successfully') =>
  success(res, data, message, 201);

/**
 * Paginated response — includes pagination meta
 */
const paginated = (res, { rows, total, page, limit, totalPages, hasNext, hasPrev }, message = 'Success') =>
  res.status(200).json({
    success: true,
    message,
    data: rows,
    meta: { total, page, limit, totalPages, hasNext, hasPrev },
  });

/**
 * Error responses
 */
const badRequest    = (res, message = 'Bad request',          code = 'BAD_REQUEST')    => error(res, message, 400, code);
const unauthorized  = (res, message = 'Unauthorized',         code = 'UNAUTHORIZED')   => error(res, message, 401, code);
const forbidden     = (res, message = 'Forbidden',            code = 'FORBIDDEN')      => error(res, message, 403, code);
const notFound      = (res, message = 'Resource not found',   code = 'NOT_FOUND')      => error(res, message, 404, code);
const conflict      = (res, message = 'Resource conflict',    code = 'CONFLICT')       => error(res, message, 409, code);
const serverError   = (res, message = 'Internal server error',code = 'SERVER_ERROR')   => error(res, message, 500, code);

const error = (res, message, statusCode = 500, code = 'ERROR') =>
  res.status(statusCode).json({ success: false, message, code });

module.exports = { success, created, paginated, error, badRequest, unauthorized, forbidden, notFound, conflict, serverError };
