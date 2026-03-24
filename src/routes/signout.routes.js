// routes/signout.routes.js
'use strict';

const express = require('express');
const router  = express.Router();

const { asyncHandler } = require('../helpers'); // or require('../helpers/asyncHandler')
const keyTokenService  = require('../services/keytoken.services');
const { OKResponse, NoContentResponse } = require('../core/response/success.response');
const { authenticate } = require('../middlewares/auth.middleware');
const { extractBearerToken } = require('../utils/auth.Utils');

/**
 * SIGNOUT logic supported:
 * - JWT + Refresh token in DB + refreshToken cookie
 * - Express session (connect.sid)
 *
 * Strategy:
 *  1) If authenticated via JWT (Authorization: Bearer xxx):
 *      - use req.user.userId (from authenticate middleware)
 *      - revoke all refresh tokens for that user
 *      - clear refreshToken cookie (if used)
 *  2) If using session:
 *      - destroy session
 *      - clear session cookie (connect.sid)
 *  3) Always respond with 204 No Content for logout.
 */

// Option A: Require user to be authenticated (JWT/session) before signout
router.post(
  '/',
  authenticate, // ensures req.user is set for JWT, or session valid
  asyncHandler(async (req, res, next) => {
    const userId = req.user?.userId || req.session?.userId;

    // 1. Revoke all refresh tokens for this user (JWT flow)
    if (userId) {
      try {
        await keyTokenService.revokeAllTokensForUser(userId);
      } catch (err) {
        // Don't block logout if revoke fails; log for investigation
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[signout] Failed to revoke refresh tokens:', err.message);
        }
      }
    }

    // 2. Clear refresh token cookie (if you're storing it in cookie)
    // Make sure the cookie name matches what you used on signin
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'Strict'
    });

    // 3. Destroy session (session-based auth flow)
    if (req.session) {
      req.session.destroy((err) => {
        if (err && process.env.NODE_ENV !== 'production') {
          console.warn('[signout] Failed to destroy session:', err.message);
        }
        // Clear session cookie
        res.clearCookie('connect.sid'); // default cookie name for express-session

        // 4. Final response
        return new NoContentResponse().send(res); // 204
      });
    } else {
      // No session: just return 204
      return new NoContentResponse().send(res);
    }
  })
);

module.exports = router;
