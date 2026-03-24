'use strict';

// ─── HTTP Status Codes ────────────────────────────────────────────────────────

const StatusCodes = Object.freeze({
  OK:                    200,
  CREATED:               201,
  NO_CONTENT:            204,

  BAD_REQUEST:           400,
  UNAUTHORIZED:          401,
  PAYMENT_REQUIRED:      402,
  FORBIDDEN:             403,
  NOT_FOUND:             404,
  METHOD_NOT_ALLOWED:    405,
  CONFLICT:              409,
  UNPROCESSABLE_ENTITY:  422,
  TOO_MANY_REQUESTS:     429,

  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED:       501,
  BAD_GATEWAY:           502,
  SERVICE_UNAVAILABLE:   503
});

// ─── Status Messages ──────────────────────────────────────────────────────────

const StatusMessages = Object.freeze({
  [StatusCodes.OK]:                    'OK',
  [StatusCodes.CREATED]:               'Created',
  [StatusCodes.NO_CONTENT]:            'No Content',

  [StatusCodes.BAD_REQUEST]:           'Bad Request',
  [StatusCodes.UNAUTHORIZED]:          'Unauthorized',
  [StatusCodes.PAYMENT_REQUIRED]:      'Payment Required',
  [StatusCodes.FORBIDDEN]:             'Forbidden',
  [StatusCodes.NOT_FOUND]:             'Not Found',
  [StatusCodes.METHOD_NOT_ALLOWED]:    'Method Not Allowed',
  [StatusCodes.CONFLICT]:              'Conflict',
  [StatusCodes.UNPROCESSABLE_ENTITY]:  'Unprocessable Entity',
  [StatusCodes.TOO_MANY_REQUESTS]:     'Too Many Requests',

  [StatusCodes.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [StatusCodes.NOT_IMPLEMENTED]:       'Not Implemented',
  [StatusCodes.BAD_GATEWAY]:           'Bad Gateway',
  [StatusCodes.SERVICE_UNAVAILABLE]:   'Service Unavailable'
});

// ─── Base Error Class ─────────────────────────────────────────────────────────

class AppError extends Error {
  /**
   * @param {string} message    - Human-readable error message
   * @param {number} statusCode - HTTP status code
   */
  constructor(
    message = StatusMessages[StatusCodes.INTERNAL_SERVER_ERROR],
    statusCode = StatusCodes.INTERNAL_SERVER_ERROR
  ) {
    super(message);
    this.name       = this.constructor.name;
    this.statusCode = statusCode;
    this.status     = `${statusCode}`.startsWith('4') ? 'error' : 'fail';
    this.isOperational = true; // Distinguishes known errors from unexpected ones

    // Capture proper stack trace (excludes constructor call)
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Specific Error Classes ────────────────────────────────────────────────────

/**
 * 400 – Bad Request
 * Use when request parameters or body is malformed/missing.
 * Example: missing required fields in signup form.
 */
class BadRequestError extends AppError {
  constructor(message = StatusMessages[StatusCodes.BAD_REQUEST]) {
    super(message, StatusCodes.BAD_REQUEST);
  }
}

/**
 * 401 – Unauthorized
 * Use when credentials are missing or invalid.
 * Example: wrong password during signin, missing JWT token.
 */
class AuthFailureError extends AppError {
  constructor(message = 'Authentication failed. Please sign in again.') {
    super(message, StatusCodes.UNAUTHORIZED);
  }
}

/**
 * 402 – Payment Required
 * Use when payment is needed to access a feature.
 * Example: premium barbershop subscription required.
 */
class PaymentRequiredError extends AppError {
  constructor(message = 'Payment is required to access this resource.') {
    super(message, StatusCodes.PAYMENT_REQUIRED);
  }
}

/**
 * 403 – Forbidden
 * Use when authenticated user lacks permission.
 * Example: customer trying to access barber dashboard.
 */
class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, StatusCodes.FORBIDDEN);
  }
}

/**
 * 404 – Not Found
 * Use when a resource doesn't exist in the DB.
 * Example: appointment ID not found, customer not found.
 */
class NotFoundError extends AppError {
  constructor(message = 'The requested resource was not found.') {
    super(message, StatusCodes.NOT_FOUND);
  }
}

/**
 * 409 – Conflict
 * Use when resource already exists.
 * Example: duplicate email on signup, double-booking an appointment.
 */
class ConflictError extends AppError {
  constructor(message = 'A conflict occurred with the current state of the resource.') {
    super(message, StatusCodes.CONFLICT);
  }
}

/**
 * 422 – Unprocessable Entity
 * Use when input fails business logic validation.
 * Example: booking an appointment in the past, invalid service duration.
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed. Check your input and try again.') {
    super(message, StatusCodes.UNPROCESSABLE_ENTITY);
  }
}

/**
 * 429 – Too Many Requests
 * Use when rate limit is exceeded.
 * Example: too many signin attempts.
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please slow down and try again later.') {
    super(message, StatusCodes.TOO_MANY_REQUESTS);
  }
}

/**
 * 500 – Internal Server Error
 * Use for unexpected server-side failures.
 * Example: database connection error, unhandled promise rejection.
 */
class InternalServerError extends AppError {
  constructor(message = StatusMessages[StatusCodes.INTERNAL_SERVER_ERROR]) {
    super(message, StatusCodes.INTERNAL_SERVER_ERROR);
  }
}

/**
 * 503 – Service Unavailable
 * Use when a downstream dependency is down.
 * Example: MongoDB is unreachable, Redis cache is down.
 */
class ServiceUnavailableError extends AppError {
  constructor(message = 'Service is temporarily unavailable. Please try again later.') {
    super(message, StatusCodes.SERVICE_UNAVAILABLE);
  }
}

// ─── Global Error Handler Middleware ─────────────────────────────────────────
// Place this in app.js as the LAST middleware (after all routes)

/**
 * Express global error handler.
 * Catches all errors thrown via next(err) or throw in async handlers.
 * @usage app.use(globalErrorHandler) in app.js
 */
function globalErrorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Normalize status code
  err.statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  err.status     = err.status     || 'error';

  // Build base response
  const response = {
    status:  err.status,
    message: err.message
  };

  // In development: attach stack trace for debugging
  if (process.env.NODE_ENV === 'development') {
    response.error = err;
    response.stack = err.stack;
  }

  // Log non-operational errors (unexpected bugs)
  if (!err.isOperational) {
    console.error('[CRITICAL ERROR]', {
      message: err.message,
      stack:   err.stack,
      url:     req.originalUrl,
      method:  req.method
    });
  }

  res.status(err.statusCode).json(response);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  StatusCodes,
  StatusMessages,

  // Base class
  AppError,

  // Specific error classes
  BadRequestError,
  AuthFailureError,
  PaymentRequiredError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,

  // Middleware
  globalErrorHandler
};