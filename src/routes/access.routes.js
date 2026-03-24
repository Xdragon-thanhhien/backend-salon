// routes/access.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const accessController = require('../controllers/access.controller');
const { asyncHandler } = require('../helpers');
const { authenticate } = require('../middlewares/auth.middleware');

// Public routes
router.post('/signup', asyncHandler(accessController.signUp));
router.post('/signin', asyncHandler(accessController.signIn));

// Protected routes (requires valid token or session to identify user)
router.post('/signout', authenticate, asyncHandler(accessController.signOut));
router.post('/refresh', authenticate, asyncHandler(accessController.refreshToken));

module.exports = router;
