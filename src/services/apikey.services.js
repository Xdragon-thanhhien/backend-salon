const crypto   = require('crypto');
const ApiKey   = require('../models/apikey.model').ApiKey;
const User     = require('../models/User');
const { API_PERMISSIONS } = require('../models/apikey.model');
const { CreatedResponse, AlarmLevel } = require('../core/response/success.response');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically strong random API key components.
 * @returns {{ plainKey: string, prefix: string, hashedKey: string, salt: string }}
 */
function generateKeyComponents() {
  const rawKey   = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  const prefix   = `bshop_${rawKey.slice(0, 6)}`;         // e.g. 'bshop_a1b2c3'
  const plainKey = `${prefix}_${rawKey}`;                 // Full key shown to user ONCE
  
  // Hash for storage (reuse auth.Utils pattern)
  const { hashedToken, salt } = require('../utils/auth.Utils').hashRefreshToken(plainKey);
  
  return { plainKey, prefix, hashedKey: hashedToken, salt };
}

/**
 * Validates permission scopes against allowed values.
 * @param {string[]} permissions - Array of permission strings
 * @returns {boolean} True if all permissions are valid
 */
function validatePermissions(permissions) {
  if (!Array.isArray(permissions)) return false;
  return permissions.every(p => Object.values(API_PERMISSIONS).includes(p));
}

// ─── Core Service Functions ───────────────────────────────────────────────────

/**
 * Creates a new API key for a user.
 * @param {Object} options - { createdBy, name, permissions, expiresAt? }
 * @returns {Promise<{ apiKeyDoc: Object, plainKey: string }>} 
 *   apiKeyDoc: Saved API key document (hashed key only)
 *   plainKey:  Full API key (returned ONLY once - client must store securely)
 * @throws {Error} On validation or database failure
 */
async function createApiKey({ createdBy, name, permissions, expiresAt }) {
  // 1. Validate inputs
  if (!createdBy || !name) {
    throw new Error('createdBy and name are required.');
  }
  
  if (!validatePermissions(permissions || [])) {
    throw new Error('Invalid permission scopes provided.');
  }
  
  // 2. Verify user exists and has permission to create keys (admin/barber)
  const user = await User.findById(createdBy).select('-password');
  if (!user) {
    throw new Error('User not found.');
  }
  
  // Only admins can create keys with FULL_ACCESS; barbers/admins can create others
  const hasFullAccess = permissions?.includes(API_PERMISSIONS.FULL_ACCESS);
  if (hasFullAccess && user.role !== 'admin') {
    throw new Error('Only administrators can create API keys with full access.');
  }
  
  // 3. Generate key components
  const { plainKey, prefix, hashedKey, salt } = generateKeyComponents();
  
  // 4. Create and save API key document
  const apiKeyDoc = new ApiKey({
    createdBy,
    name,
    permissions: permissions || [
      API_PERMISSIONS.READ_APPOINTMENTS,
      API_PERMISSIONS.READ_SERVICES
    ],
    hashedKey,
    salt,
    prefix,
    expiresAt: expiresAt || null
  });
  
  await apiKeyDoc.save();
  
  return { apiKeyDoc, plainKey }; // plainKey returned ONCE
}

/**
 * Validates an API key and returns associated data if valid.
 * @param {string} key - Full API key provided by client
 * @returns {Promise<{ apiKeyDoc: Object, user: Object, permissions: string[] }>}
 * @throws {Error} If key invalid, expired, revoked, or user not found
 */
async function validateApiKey(key) {
  // 1. Extract prefix for efficient lookup
  if (!key || !key.startsWith('bshop_') || key.length < 18) {
    throw new Error('Invalid API key format.');
  }
  
  const prefix = key.substring(0, 12); // 'bshop_xxxxxx'
  
  // 2. Find active, non-expired key by prefix
  const apiKeyDoc = await ApiKey.findOne({
    prefix,
    status: 'active',
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
  
  if (!apiKeyDoc) {
    throw new Error('API key not found or inactive.');
  }
  
  // 3. Verify full key against hash
  const isValid = apiKeyDoc.verifyKey(key);
  if (!isValid) {
    throw new Error('Invalid API key.');
  }
  
  // 4. Record usage (fire-and-forget for performance)
  apiKeyDoc.recordUsage().catch(console.error);
  
  // 5. Get associated user
  const user = await User.findById(apiKeyDoc.createdBy).select('-password');
  if (!user) {
    throw new Error('Associated user not found.');
  }
  
  return {
    apiKeyDoc,
    user: {
      id:   user._id,
      email: user.email,
      role: user.role
    },
    permissions: apiKeyDoc.permissions
  };
}

/**
 * Checks if an API key has a specific permission.
 * @param {string} key - Full API key
 * @param {string} permission - One of API_PERMISSIONS values
 * @returns {Promise<boolean>} True if key has permission
 */
async function hasApiKeyPermission(key, permission) {
  try {
    const { apiKeyDoc } = await validateApiKey(key);
    return apiKeyDoc.hasPermission(permission);
  } catch (err) {
    return false; // Fail closed
  }
}

/**
 * Revokes a specific API key.
 * @param {string} key - Full API key to revoke
 * @param {string} revokedByUserId - User ID revoking the key (for audit)
 * @returns {Promise<Object>} Update result
 */
async function revokeApiKey(key, revokedByUserId) {
  // 1. Validate key format and extract prefix
  if (!key || !key.startsWith('bshop_') || key.length < 18) {
    throw new Error('Invalid API key format.');
  }
  
  const prefix = key.substring(0, 12);
  
  // 2. Find and revoke the key
  const result = await ApiKey.updateOne(
    { 
      prefix,
      status: 'active' 
    },
    {
      $set: {
        status:    'revoked',
        revokedAt: new Date(),
        revokedBy: revokedByUserId
      }
    }
  );
  
  if (result.matchedCount === 0) {
    throw new Error('API key not found or already revoked.');
  }
  
  return result;
}

/**
 * Revokes all API keys for a user.
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<Object>} Update result
 */
async function revokeAllApiKeysForUser(userId) {
  // 1. Validate user exists
  const user = await User.findById(userId).select('-password');
  if (!user) {
    throw new Error('User not found.');
  }
  
  // 2. Revoke all active keys for user
  return await ApiKey.updateMany(
    { createdBy: userId, status: 'active' },
    { 
      $set: { 
        status:    'revoked',
        revokedAt: new Date(),
        revokedBy: userId 
      } 
    }
  );
}

/**
 * Gets all active API keys for a user (for management UI).
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<Object[]>} Array of key documents (without hashedKey/salt)
 */
async function getApiKeysForUser(userId) {
  const keys = await ApiKey.find({
    createdBy: userId,
    status:    'active'
  }).select('-hashedKey -salt -__v').sort({ createdAt: -1 });
  
  return keys.map(key => key.toObject());
}

/**
 * Cleans up expired and revoked API keys.
 * Should be called via cron job (e.g., daily).
 * @returns {Promise<Object>} Deletion result
 */
async function cleanupApiKeys() {
  const now = new Date();
  return await ApiKey.deleteMany({
    $or: [
      { status: 'revoked' },
      { expiresAt: { $lt: now, $ne: null } }
    ]
  });
}
// ─── Express Route Handler Example ───────────────────────────────────────────
// (Place this in your routes file, e.g., admin.routes.js, and ensure proper middleware is applied)
router.post('/api/v1/admin/api-keys', authenticate, authorize(['admin']), async (req, res, next) => {
  try {
    const { apiKeyDoc, plainKey } = await apiKeyService.createApiKey({
      createdBy:   req.user.userId,
      name:        req.body.name,
      permissions: req.body.permissions,
      expiresAt:   req.body.expiresAt
    });

    new CreatedResponse({
      message: 'API key created. Store this key securely — it will not be shown again.',
      data: {
        key:    plainKey,       // shown ONCE only
        prefix: apiKeyDoc.prefix,
        id:     apiKeyDoc._id
      },
      // 🔕 Hidden alarm: always flag API key creation with FULL_ACCESS
      alarm: req.body.permissions?.includes('xxxx') ? {
        level: AlarmLevel.CRITICAL,
        event: 'FULL_ACCESS API key created',
        meta:  { createdBy: req.user.userId, keyName: req.body.name, ip: req.ip }
      } : {
        level: AlarmLevel.MEDIUM,
        event: 'New API key created',
        meta:  { createdBy: req.user.userId, keyName: req.body.name, ip: req.ip }
      }
    }).send(res);
  } catch (err) {
    next(err);
  }
});
// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  createApiKey,
  validateApiKey,
  hasApiKeyPermission,
  revokeApiKey,
  revokeAllApiKeysForUser,
  getApiKeysForUser,
  cleanupApiKeys
};