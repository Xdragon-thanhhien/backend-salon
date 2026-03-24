// controllers/access.controller.js
'use strict';

const accessService = require('../services/access.service');
const keyTokenService = require('../services/keytoken.service');
const { 
  CreatedResponse, 
  OKResponse, 
  NoContentResponse 
} = require('../core/response/success.response');
const { refreshTokenCookieOptions } = require('../utils/auth.Utils');

class AccessController {
  
  /**
   * Handles user registration (Customer, Barber, Admin)
   * POST /api/v1/signup
   */
  signUp = async (req, res, next) => {
    // 1. Extract data from request body
    const userData = req.body;
    
    // 2. Pass to service layer
    const newUser = await accessService.signUp(userData);
    
    // 3. Return formatted success response
    new CreatedResponse({
      message: 'Account created successfully.',
      data: { user: newUser }
    }).send(res);
  };

  /**
   * Handles user login and token generation
   * POST /api/v1/signin
   */
  signIn = async (req, res, next) => {
    // 1. Extract credentials
    const credentials = req.body;
    
    // 2. Pass to service layer
    const { user, token } = await accessService.signIn(credentials);
    
    // 3. Set HTTP-only cookie for refresh token
    res.cookie('refreshToken', token.refreshToken, refreshTokenCookieOptions());
    
    // 4. Return formatted success response (sending Access Token in body)
    new OKResponse({
      message: 'Signed in successfully.',
      data: {
        user,
        accessToken: token.accessToken
      }
    }).send(res);
  };

  /**
   * Handles user logout, token revocation, and cookie clearing
   * POST /api/v1/signout
   */
  signOut = async (req, res, next) => {
    // 1. Extract user ID from authenticated request
    const userId = req.user?.userId || req.session?.userId;
    
    // 2. Pass to service layer for token revocation (if authenticated)
    if (userId) {
      await keyTokenService.revokeAllTokensForUser(userId);
    }
    
    // 3. Clear session if it exists
    if (req.session) {
      req.session.destroy();
      res.clearCookie('connect.sid');
    }
    
    // 4. Clear JWT refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict'
    });
    
    // 5. Return 204 No Content
    new NoContentResponse().send(res);
  };

  /**
   * Handles refreshing the access token when it expires
   * POST /api/v1/refresh-token
   */
  refreshToken = async (req, res, next) => {
    // 1. Extract refresh token from cookies (or body as fallback)
    const oldRefreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    const userId = req.user?.userId; // Assuming you have a middleware that decodes expired JWTs to get ID
    
    // 2. Pass to service layer
    const tokens = await keyTokenService.rotateRefreshToken(userId, oldRefreshToken);
    
    // 3. Set new refresh token in cookie
    res.cookie('refreshToken', tokens.refreshToken, refreshTokenCookieOptions());
    
    // 4. Return new access token
    new OKResponse({
      message: 'Token refreshed successfully.',
      data: {
        accessToken: tokens.accessToken
      }
    }).send(res);
  };
}

module.exports = new AccessController();
