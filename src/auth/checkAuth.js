/*
 * Smart authentication checker that layers multiple auth strategies:
 *  1. API Key (X-API-Key header) → for integrations/services
 *  2. JWT Bearer token           → for SPA/mobile clients
 *  3. Session                    → for traditional web views
 *
 * Returns a unified req.auth object with:
 *   - userId, email, role
 *   - authMethod used ('apiKey' | 'jwt' | 'session')
 *   - permissions/scopes (when applicable)
 *
 * Designed to be flexible, testable, and easy to extend.
 */

const { verifyAccessToken }     = require('../utils/auth.Utils');
const { extractBearerToken }    = require('../utils/auth.Utils');
const ApiKey                    = require('../models/apikey.model').ApiKey;
const User                      = require('../models/User');
const API_PERMISSIONS           = require('../models/apikey.model').API_PERMISSIONS;

// ─── Config ───────────────────────────────────────────────────────────────────

const AUTH_STRATEGIES = {
  API_KEY:    'apiKey',
  JWT:        'jwt',
  SESSION:    'session',
  NONE:       'none'
};

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Express middleware that checks authentication using layered strategies.
 * Attaches req.auth = { userId, email, role, authMethod, permissions? }
 * 
 * @param {Object} options - Configuration
 *   { 
 *     require: boolean,     // If true, 401 on auth fail; if false, req.auth may be null
 *     allowNone: boolean,   // If true, allows unauthenticated requests (sets req.auth = null)
 *     methods: string[]     // Auth methods to try (default: all)
 *   }
 */
function checkAuth(options = {}) {
  const {
    require = true,
    allowNone = false,
    methods = Object.values(AUTH_STRATEGIES).filter(s => s !== AUTH_STRATEGIES.NONE)
  } = options;

  return async function (req, res, next) {
    try {
      // ─── Strategy 1: API Key (highest priority for service integrations) ────────
      if (methods.includes(AUTH_STRATEGIES.API_KEY)) {
        const apiKey = req.headers['x-api-key'] || req.query.api_key;
        if (apiKey) {
          const auth = await _checkApiKey(apiKey);
          if (auth) {
            req.auth = { ...auth, authMethod: AUTH_STRATEGIES.API_KEY };
            return next();
          }
        }
      }

      // ─── Strategy 2: JWT Bearer token (for API/mobile clients) ──────────────────
      if (methods.includes(AUTH_STRATEGIES.JWT)) {
        const token = extractBearerToken(req.headers.authorization);
        if (token) {
          const auth = await _checkJwt(token);
          if (auth) {
            req.auth = { ...auth, authMethod: AUTH_STRATEGIES.JWT };
            return next();
          }
        }
      }

      // ─── Strategy 3: Session (for traditional web views) ───────────────────────
      if (methods.includes(AUTH_STRATEGIES.SESSION)) {
        if (req.session && req.session.userId) {
          const auth = await _checkSession(req.session.userId);
          if (auth) {
            req.auth = { ...auth, authMethod: AUTH_STRATEGIES.SESSION };
            return next();
          }
        }
      }

      // ─── No authentication found ───────────────────────────────────────────────
      if (allowNone) {
        req.auth = null;
        return next();
      }

      if (require) {
        return res.status(401).json({
          status:  'error',
          message: 'Authentication required. Provide API key, JWT token, or sign in.'
        });
      }

      // If !require and !allowNone, continue with no auth (req.auth undefined)
      next();
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[checkAuth] Error:', err.stack);
      }
      const status = err.status || 401;
      res.status(status).json({
        status:  'error',
        message: err.message || 'Authentication failed'
      });
    }
  };
}

// ─── Strategy Implementations ─────────────────────────────────────────────────

/**
 * Validates API key and returns user/scopes if valid.
 * @param {string} key - Full API key from client
 * @returns {Promise<Object|null>} Auth data or null
 */
async function _checkApiKey(key) {
  try {
    // Find by prefix for efficiency (first 12 chars: 'bshop_xxxxxx')
    const prefix = key.substring(0, 12);
    const apiKeyDoc = await ApiKey.findOne({ 
      prefix,
      status: 'active',
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    });

    if (!apiKeyDoc) return null;

    // Verify full key (never store plain, only hash)
    const isValid = apiKeyDoc.verifyKey(key);
    if (!isValid) return null;

    // Record usage (async - don't await if performance critical)
    apiKeyDoc.recordUsage().catch(console.error);

    // Get user info
    const user = await User.findById(apiKeyDoc.createdBy).select('-password');
    if (!user) return null;

    return {
      userId:   user._id,
      email:    user.email,
      role:     user.role,
      permissions: apiKeyDoc.permissions,
      scopes:   apiKeyDoc.permissions // Alias for consistency
    };
  } catch (err) {
    // Log but don't fail open - treat as invalid key
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[checkAuth] API key check error:', err.message);
    }
    return null;
  }
}

/**
 * Validates JWT token and returns user data.
 * @param {string} token - JWT string
 * @returns {Promise<Object|null>} Auth data or null
 */
async function _checkJwt(token) {
  try {
    const decoded = verifyAccessToken(token); // Uses RS256 public key
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return null;

    return {
      userId:   user._id,
      email:    user.email,
      role:     user.role
      // JWT doesn't carry scopes by default - could add custom claims
    };
  } catch (err) {
    // Invalid/expired token - treat as unauthenticated
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[checkAuth] JWT verification failed:', err.message);
    }
    return null;
  }
}

/**
 * Validates session and returns user data.
 * @param {string} userId - From req.session.userId
 * @returns {Promise<Object|null>} Auth data or null
 */
async function _checkSession(userId) {
  try {
    const user = await User.findById(userId).select('-password');
    if (!user) return null;

    return {
      userId:   user._id,
      email:    user.email,
      role:     user.role
    };
  } catch (err) {
    // Session user not found - clear session
    if (req.session) req.session.destroy(() => {});
    return null;
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  checkAuth,
  AUTH_STRATEGIES
};