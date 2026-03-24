// keyTokens.model.js
const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

/**
 * KeyToken model for storing hashed refresh tokens
 * Implements secure token storage similar to password hashing
 * References the User model (which combines customers/barbers with role field)
 */
const keyTokenSchema = new Schema(
  {
    // Reference to the user (customer, barber, or admin)
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User', // Assumes you have a User model with role field
      required: true,
      index: true
    },

    //Was this token used? (for rotation detection)
    used: {
      type: Boolean,
      default: false
    },

    // Hashed refresh token (we never store plain tokens)
    // Format: hash = crypto.createHmac('sha512', salt).update(token).digest('hex')
    // We'll store: { hashedToken: string, salt: string }
    hashedToken: {
      type: String,
      required: true
    },

    // Salt used for hashing (unique per token)
    salt: {
      type: String,
      required: true
    },

    // Expiration date (when token becomes invalid)
    expiresAt: {
      type: Date,
      required: true,
      index: true // For efficient cleanup queries
    },

    // Revocation timestamp (null = active, date = revoked)
    // Better than boolean for tracking when revoked
    revokedAt: {
      type: Date,
      default: null
    },

    // Optional: Track device/IP for security alerts
    // deviceInfo: String,
    // ipAddress: String
  },
  {
    timestamps: true, // Creates createdAt and updatedAt
    // Prevent overwriting tokens on save (use updateOne instead)
    versionKey: false
  }
);

/**
 * Compound index for efficient user-specific queries
 * Finds active tokens for a user quickly
 */
keyTokenSchema.index({ userId: 1, expiresAt: 1, revokedAt: 1 });

/**
 * Static method to create a new token document from plain token
 * @param {Object} user - User document
 * @param {string} plainToken - The raw refresh token from crypto.randomBytes()
 * @returns {Promise<KeyToken>} Unsaved token document
 */
keyTokenSchema.statics.createFromToken = function (user, plainToken) {
  // Generate salt and hash the token (similar to password hashing)
  const salt = crypto.randomBytes(16).toString('hex');
  const hashedToken = crypto
    .createHmac('sha512', salt)
    .update(plainToken)
    .digest('hex');

  // Set expiration (e.g., 7 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  return new this({
    userId: user._id,
    salt,
    hashedToken,
    expiresAt
  });
};

/**
 * Instance method to verify a plain token against stored hash
 * @param {string} plainToken - Token provided by client
 * @returns {boolean} True if token matches hash
 */
keyTokenSchema.methods.verifyToken = function (plainToken) {
  const computedHash = crypto
    .createHmac('sha512', this.salt)
    .update(plainToken)
    .digest('hex');
  return computedHash === this.hashedToken;
};

/**
 * Instance method to check if token is valid (not expired, not revoked, not used)
 * @returns {boolean}
 */
keyTokenSchema.methods.isValid = function () {
  const now = new Date();
  return !this.revokedAt && !this.used && this.expiresAt > now;
};

/**
 * Instance method to mark token as used (for rotation)
 */
keyTokenSchema.methods.markAsUsed = function () {
  this.used = true;
  return this.save();
};

/**
 * Instance method to revoke token
 */
keyTokenSchema.methods.revoke = function () {
  this.revokedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('KeyToken', keyTokenSchema);
