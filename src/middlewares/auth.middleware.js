// src/middlewares/auth.middleware.js
'use strict';

const jwt = require('jsonwebtoken');
const { User, USER_ROLES } = require('../models/User.models');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// ─── Authenticate: verify JWT, gắn req.user ──────────────────────────────────

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication token missing' });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, JWT_SECRET); // { id, role, ... }

    const user = await User.findById(decoded.id).select('-password').lean();
    if (!user) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Authenticate error:', err.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// ─── Authorize: kiểm tra role ────────────────────────────────────────────────
// authorize(['admin']) hoặc authorize([USER_ROLES.ADMIN, USER_ROLES.MANAGER])
const authorize = (roles = []) => {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Unauthenticated' });
      }

      if (!allowedRoles.length) {
        // nếu không truyền role → chỉ cần login
        return next();
      }

      const userRole = req.user.role;
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ message: 'Forbidden: insufficient role' });
      }

      next();
    } catch (err) {
      console.error('Authorize error:', err.message);
      return res.status(500).json({ message: 'Authorization error' });
    }
  };
};

module.exports = {
  authenticate,
  authorize,
  USER_ROLES
};



// Placeholder auth middleware
// module.exports = {
//   authenticate: (req, res, next) => next(),
//   authorize: roles => (req, res, next) => next()
// };

