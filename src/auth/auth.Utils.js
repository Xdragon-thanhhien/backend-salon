'use strict';

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');

// ─── Key Configuration ───────────────────────────────────────────────────────

const PRIVATE_KEY  = process.env.JWT_PRIVATE_KEY;
const PUBLIC_KEY   = process.env.JWT_PUBLIC_KEY;
const JWT_ISSUER   = process.env.JWT_ISSUER   || 'barbershop-app';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'barbershop-users';
const ACCESS_TOKEN_EXPIRES  = process.env.JWT_EXPIRES_IN          || '1d';
const REFRESH_TOKEN_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN  || '7d';

// Guard: warn early if keys are missing (don't crash at import time)
if (!PRIVATE_KEY || !PUBLIC_KEY) {
  console.warn(
    '[auth.Utils] WARNING: JWT_PRIVATE_KEY or JWT_PUBLIC_KEY is missing. ' +
    'Token operations will fail. Check your .env file.'
  );
}

// ─── JWT Helpers ─────────────────────────────────────────────────────────────

/**
 * Signs a JWT access token with the RSA private key.
 * @param {Object} payload - { userId, email, role }
 * @returns {string} Signed JWT string
 * @throws {Error} If private key is missing or signing fails
 */
function signAccessToken(payload) {
  if (!PRIVATE_KEY) {
    throw new Error('[auth.Utils] JWT_PRIVATE_KEY is not defined.');
  }

  return jwt.sign(payload, PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: ACCESS_TOKEN_EXPIRES,
    issuer:    JWT_ISSUER,
    audience:  JWT_AUDIENCE
  });
}

/**
 * Verifies a JWT access token with the RSA public key.
 * @param {string} token - JWT string from client
 * @returns {Object} Decoded payload { userId, email, role, iat, exp }
 * @throws {Error} If token is invalid, expired, or public key is missing
 */
function verifyAccessToken(token) {
  if (!PUBLIC_KEY) {
    throw new Error('[auth.Utils] JWT_PUBLIC_KEY is not defined.');
  }

  try {
    return jwt.verify(token, PUBLIC_KEY, {
      algorithms: ['RS256'],
      issuer:    JWT_ISSUER,
      audience:  JWT_AUDIENCE
    });
  } catch (err) {
    // Normalize JWT errors into readable messages for the service layer
    if (err.name === 'TokenExpiredError') {
      throw new Error('Access token has expired.');
    }
    if (err.name === 'JsonWebTokenError') {
      throw new Error('Invalid access token.');
    }
    throw new Error('Token verification failed.');
  }
}

/**
 * Decodes a JWT without verifying the signature.
 * Useful for extracting userId from an expired token before issuing a new one.
 * @param {string} token - JWT string
 * @returns {Object|null} Decoded payload or null if undecodable
 */
function decodeToken(token) {
  return jwt.decode(token);
}

// ─── Refresh Token Helpers ───────────────────────────────────────────────────

/**
 * Generates a cryptographically strong random refresh token.
 * @returns {string} 64-character hex string (32 bytes)
 */
function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a plain refresh token using HMAC-SHA512 and a unique salt.
 * @param {string} plainToken - The raw refresh token
 * @returns {{ hashedToken: string, salt: string }}
 */
function hashRefreshToken(plainToken) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hashedToken = crypto
    .createHmac('sha512', salt)
    .update(plainToken)
    .digest('hex');
  return { hashedToken, salt };
}

/**
 * Verifies a plain refresh token against its stored hash and salt.
 * @param {string} plainToken   - Token presented by client
 * @param {string} storedHash   - Hash stored in DB
 * @param {string} salt         - Salt stored in DB
 * @returns {boolean}
 */
function verifyRefreshTokenHash(plainToken, storedHash, salt) {
  const computedHash = crypto
    .createHmac('sha512', salt)
    .update(plainToken)
    .digest('hex');
  return computedHash === storedHash;
}

// ─── Cookie Helpers ──────────────────────────────────────────────────────────

/**
 * Cookie options for storing the refresh token securely.
 * Use these when setting the cookie via res.cookie().
 * @param {number} days - Cookie lifetime in days (default: 7)
 * @returns {Object} Express cookie options
 */
function refreshTokenCookieOptions(days = 7) {
  return {
    httpOnly: true,                          // Not accessible via JS (prevents XSS)
    secure:   process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'Strict',                      // Prevents CSRF attacks
    maxAge:   days * 24 * 60 * 60 * 1000    // Milliseconds
  };
}

/**
 * Cookie options for clearing/expiring the refresh token cookie.
 * @returns {Object} Express cookie options with past expiry
 */
function clearRefreshTokenCookieOptions() {
  return {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    expires:  new Date(0) // Immediately expire the cookie
  };
}

// ─── Role & Permission Helpers ───────────────────────────────────────────────

// Defined roles in the barbershop app (from our DB design)
const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  BARBER:   'barber',
  ADMIN:    'admin'
});

/**
 * Checks if a given role is valid.
 * @param {string} role - Role string to validate
 * @returns {boolean}
 */
function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

/**
 * Checks if a user has one of the required roles.
 * @param {string}   userRole      - Role of the authenticated user
 * @param {string[]} allowedRoles  - Roles permitted for the action
 * @returns {boolean}
 */
function hasRole(userRole, allowedRoles = []) {
  return allowedRoles.includes(userRole);
}

/**
 * Returns the dashboard redirect path based on user role.
 * @param {string} role - User role
 * @returns {string} Redirect URL
 */
function getDashboardByRole(role) {
  const dashboardMap = {
    [ROLES.CUSTOMER]: '/customer/dashboard',
    [ROLES.BARBER]:   '/barber/dashboard',
    [ROLES.ADMIN]:    '/admin/dashboard'
  };
  return dashboardMap[role] || '/dashboard'; // Fallback for unknown roles
}

// ─── Token Extraction Helper ─────────────────────────────────────────────────

/**
 * Extracts Bearer token from the Authorization header.
 * @param {string} authHeader - req.headers.authorization
 * @returns {string|null} Token string or null if not found
 */
function extractBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.split(' ')[1] || null;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // JWT
  signAccessToken,
  verifyAccessToken,
  decodeToken,

  // Refresh token
  generateRefreshToken,
  hashRefreshToken,
  verifyRefreshTokenHash,

  // Cookie
  refreshTokenCookieOptions,
  clearRefreshTokenCookieOptions,

  // Roles
  ROLES,
  isValidRole,
  hasRole,
  getDashboardByRole,

  // Extraction
  extractBearerToken
};