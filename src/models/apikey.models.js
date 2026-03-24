
// apikey.model.js
/*
 * API Key model for the Barbershop App.
 * Supports third-party integrations, mobile clients, or partner services
 * accessing the barbershop API (e.g., booking widgets, POS systems).
 *
 * Design principles:
 *  - Keys are hashed before storage (same pattern as keyTokens.model.js)
 *  - Each key is scoped to a permission set (permissions array)
 *  - Keys can be revoked without deleting (audit trail preserved)
 *  - Linked to a user (admin/barber who created the key)
 */

'use strict';

const mongoose  = require('mongoose');
const crypto    = require('crypto');
const { hashRefreshToken, verifyRefreshTokenHash } = require('../utils/auth.Utils');
const { Schema } = mongoose;

// ─── Permission Scopes ────────────────────────────────────────────────────────
// Define all available API permission scopes for the barbershop app

const API_PERMISSIONS = Object.freeze({
  // Read permissions
  READ_APPOINTMENTS:  '0000',  // View appointments
  READ_CUSTOMERS:     '1111',  // View customer list
  READ_SERVICES:      '2222',  // View services & pricing
  READ_SCHEDULE:      '3333',  // View barber schedules
  READ_INVENTORY:     '4444',  // View product inventory
  READ_REPORTS:       '5555',  // View analytics & reports

  // Write permissions
  WRITE_APPOINTMENTS: '6666',  // Create/update appointments
  WRITE_CUSTOMERS:    '7777',  // Create/update customers
  WRITE_SERVICES:     '8888',  // Create/update services
  WRITE_SCHEDULE:     '9999',  // Create/update schedules
  WRITE_INVENTORY:    'aaaa',  // Create/update inventory

  // Admin permissions
  FULL_ACCESS:        'xxxx'   // All permissions (admin only)
});

// ─── Schema ───────────────────────────────────────────────────────────────────

const apiKeySchema = new Schema(
  {
    // Which user (admin/barber) created this API key
    createdBy: {
      type:     Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true
    },

    // Human-readable label (e.g., 'POS System', 'Booking Widget')
    name: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 100
    },

    // Hashed API key — never store plain key
    hashedKey: {
      type:     String,
      required: true
    },

    // Salt used to hash the key (reuse auth.Utils hashRefreshToken pattern)
    salt: {
      type:     String,
      required: true
    },

    // Key prefix shown in UI (e.g., 'bshop_xxxx...')
    // Safe to store plain — not enough to reconstruct full key
    prefix: {
      type:     String,
      required: true,
      length:   12   // 'bshop_' + 6 chars
    },

    // Permission scopes granted to this key
    permissions: {
      type:    [String],
      enum:    Object.values(API_PERMISSIONS),
      default: [API_PERMISSIONS.READ_APPOINTMENTS, API_PERMISSIONS.READ_SERVICES]
    },

    // Status tracking (active/revoked)
    status: {
      type:    String,
      enum:    ['active', 'revoked'],
      default: 'active',
      index:   true
    },

    // Revocation metadata
    revokedAt: {
      type:    Date,
      default: null
    },

    revokedBy: {
      type: Schema.Types.ObjectId,
      ref:  'User',
      default: null
    },

    // Expiration (null = never expires)
    expiresAt: {
      type:    Date,
      default: null,
      index:   true
    },

    // Usage tracking
    lastUsedAt: {
      type:    Date,
      default: null
    },

    usageCount: {
      type:    Number,
      default: 0,
      min:     0
    }
  },
  {
    timestamps: true, // createdAt, updatedAt
    versionKey: false
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Efficient lookup by createdBy + status (e.g., list active keys for a user)
apiKeySchema.index({ createdBy: 1, status: 1 });

// Efficient expiration cleanup (cron job)
apiKeySchema.index({ expiresAt: 1 }, { sparse: true });

// ─── Static Methods ───────────────────────────────────────────────────────────

/**
 * Generates a new plain API key and returns both the plain key
 * and an unsaved ApiKey document with the hashed version.
 * Pattern mirrors keyTokens.model.js createFromToken.
 *
 * @param {Object} options - { createdBy, name, permissions, expiresAt? }
 * @returns {{ plainKey: string, apiKeyDoc: ApiKeyDocument }}
 */
apiKeySchema.statics.generateKey = function ({ createdBy, name, permissions, expiresAt }) {
  // Generate cryptographically strong random key
  const rawKey   = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  const prefix   = `bshop_${rawKey.slice(0, 6)}`;         // e.g. 'bshop_a1b2c3'
  const plainKey = `${prefix}_${rawKey}`;                 // Full key shown to user ONCE

  // Hash for storage (reuse auth.Utils pattern)
  const { hashedToken, salt } = hashRefreshToken(plainKey);

  const apiKeyDoc = new this({
    createdBy,
    name,
    permissions: permissions || [
      API_PERMISSIONS.READ_APPOINTMENTS,
      API_PERMISSIONS.READ_SERVICES
    ],
    hashedKey:  hashedToken,
    salt,
    prefix,
    expiresAt: expiresAt || null
  });

  return { plainKey, apiKeyDoc }; // Return plainKey ONCE — never retrievable again
};

/**
 * Finds an active, non-expired API key document by createdBy user.
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<ApiKeyDocument[]>}
 */
apiKeySchema.statics.findActiveByUser = function (userId) {
  return this.find({
    createdBy: userId,
    status:    'active',
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  }).sort({ createdAt: -1 });
};

// ─── Instance Methods ─────────────────────────────────────────────────────────

/**
 * Verifies a plain API key against the stored hash.
 * Reuses verifyRefreshTokenHash from auth.Utils.js.
 * @param {string} plainKey - Full key provided by client
 * @returns {boolean}
 */
apiKeySchema.methods.verifyKey = function (plainKey) {
  return verifyRefreshTokenHash(plainKey, this.hashedKey, this.salt);
};

/**
 * Checks if this API key is currently valid.
 * @returns {boolean}
 */
apiKeySchema.methods.isValid = function () {
  const now = new Date();
  return (
    this.status === 'active' &&
    (!this.expiresAt || this.expiresAt > now)
  );
};

/**
 * Revokes this API key.
 * @param {string} revokedByUserId - Admin/owner revoking the key
 * @returns {Promise<ApiKeyDocument>}
 */
apiKeySchema.methods.revoke = function (revokedByUserId) {
  this.status    = 'revoked';
  this.revokedAt = new Date();
  this.revokedBy = revokedByUserId;
  return this.save();
};

/**
 * Records key usage (call on every successful API request).
 * @returns {Promise<ApiKeyDocument>}
 */
apiKeySchema.methods.recordUsage = function () {
  this.lastUsedAt = new Date();
  this.usageCount += 1;
  return this.save();
};

/**
 * Checks if key has a specific permission scope.
 * @param {string} permission - One of API_PERMISSIONS values
 * @returns {boolean}
 */
apiKeySchema.methods.hasPermission = function (permission) {
  return (
    this.permissions.includes(API_PERMISSIONS.FULL_ACCESS) ||
    this.permissions.includes(permission)
  );
};

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
  ApiKey: mongoose.model('ApiKey', apiKeySchema),
  API_PERMISSIONS
};