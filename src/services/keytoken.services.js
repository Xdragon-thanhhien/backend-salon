
const crypto  = require('crypto');
const KeyToken = require('../models/keyTokens.model'); // Adjust path if needed
const User     = require('../models/User');             // Adjust path if needed

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically strong random refresh token.
 * @returns {string} Hex-encoded random token (32 bytes = 64 hex chars)
 */
function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Signs an access token (JWT) using the private key from access.service.js.
 * Reuses the existing JWT signing logic to avoid duplication.
 * @param {Object} payload - { userId, email, role }
 * @returns {string} Signed JWT access token
 */
function signAccessToken(payload) {
  const jwt = require('jsonwebtoken');
  const PRIVATE_KEY = process.env.JWT_PRIVATE_KEY;

  if (!PRIVATE_KEY) {
    throw new Error('JWT_PRIVATE_KEY is not defined in environment variables.');
  }

  return jwt.sign(payload, PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn:  process.env.JWT_EXPIRES_IN  || '1d',
    issuer:     process.env.JWT_ISSUER      || 'barbershop-app',
    audience:   process.env.JWT_AUDIENCE    || 'barbershop-users'
  });
}

// ─── Core Service Functions ──────────────────────────────────────────────────

/**
 * Creates a new access token (JWT) and refresh token pair for a user.
 * Called after successful sign-in or token rotation.
 * @param {Object} user - User document (must have _id, email, role)
 * @returns {Promise<Object>} { accessToken, refreshToken, expiresIn }
 */
async function createTokenPair(user) {
  // 1. Generate plain refresh token
  const refreshToken = generateRefreshToken();

  // 2. Persist hashed refresh token in DB
  const keyTokenDoc = KeyToken.createFromToken(user, refreshToken);
  await keyTokenDoc.save();

  // 3. Sign access token (JWT)
  const accessToken = signAccessToken({
    userId: user._id,
    email:  user.email,
    role:   user.role
  });

  return {
    accessToken,
    refreshToken, // Send to client via HTTP-only cookie or response body
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  };
}

// In keyTokens.model.js — update imports and methods
const { hashRefreshToken, verifyRefreshTokenHash } = require('../utils/auth.Utils');

// Static method
keyTokenSchema.statics.createFromToken = function (user, plainToken) {
  const { hashedToken, salt } = hashRefreshToken(plainToken); // ✅ use shared util
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  return new this({ userId: user._id, hashedToken, salt, expiresAt });
};

// Instance method
keyTokenSchema.methods.verifyToken = function (plainToken) {
  return verifyRefreshTokenHash(plainToken, this.hashedToken, this.salt); // ✅ use shared util
};
keyTokenSchema.methods.isValid = function () {
  const now = new Date();
  return !this.revokedAt && this.expiresAt > now;
};
/**
 * Verifies a refresh token and returns the associated token doc and user.
 * @param {string} userId       - The user ID from the request
 * @param {string} refreshToken - Plain token provided by the client
 * @returns {Promise<{ keyTokenDoc: Object, user: Object }>}
 * @throws {Error} If token is invalid, expired, revoked, or already used
 */
async function verifyRefreshToken(userId, refreshToken) {
  // 1. Find token document for this user
  const keyTokenDoc = await KeyToken.findOne({ userId });
  if (!keyTokenDoc) {
    throw new Error('Refresh token not found. Please sign in again.');
  }

  // 2. Verify token matches stored hash
  const isValid = keyTokenDoc.verifyToken(refreshToken);
  if (!isValid) {
    throw new Error('Invalid refresh token.');
  }

  // 3. Check token lifecycle (not expired, not revoked, not already used)
  if (!keyTokenDoc.isValid()) {
    throw new Error('Refresh token has expired, been revoked, or already used.');
  }

  // 4. Find and return the full user (no password)
  const user = await User.findById(userId).select('-password');
  if (!user) {
    throw new Error('User not found.');
  }

  return { keyTokenDoc, user };
}

/**
 * Rotates refresh token: marks old token as used and issues a fresh pair.
 * Call this endpoint when the client needs a new access token.
 * @param {Object} user           - User document
 * @param {string} oldRefreshToken - The refresh token presented by the client
 * @returns {Promise<Object>} New token pair { accessToken, refreshToken, expiresIn }
 */
async function rotateRefreshToken(user, oldRefreshToken) {
  // 1. Verify old token is still valid
  const { keyTokenDoc } = await verifyRefreshToken(user._id, oldRefreshToken);

  // 2. Mark old token as used (prevents replay attacks)
  await keyTokenDoc.markAsUsed();

  // 3. Issue new token pair
  return await createTokenPair(user);
}

/**
 * Revokes the current refresh token for a user (e.g., on logout).
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Update result
 */
async function revokeRefreshToken(userId) {
  return await KeyToken.updateOne(
    { userId },
    { $set: { revokedAt: new Date() } }
  );
}

/**
 * Revokes ALL refresh tokens for a user (e.g., on password change or security breach).
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Update result
 */
async function revokeAllTokensForUser(userId) {
  return await KeyToken.updateMany(
    { userId },
    { $set: { revokedAt: new Date() } }
  );
}

/**
 * Cleans up expired and revoked tokens from the DB.
 * Should be called via a cron job or scheduled task (e.g., daily).
 * @returns {Promise<Object>} Deletion result with count of removed documents
 */
async function cleanupExpiredTokens() {
  const now = new Date();
  return await KeyToken.deleteMany({
    $or: [
      { expiresAt: { $lt: now } },
      { revokedAt: { $ne: null } }
    ]
  });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  generateRefreshToken,
  createTokenPair,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllTokensForUser, 
  cleanupExpiredTokens
};