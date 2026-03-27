// src/routes/auth.routes.js
'use strict';

const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { asyncHandler } = require('../helper');
const { authenticate } = require('../middlewares/auth.middleware');

// POST /api/v1/auth/register
router.post(
  '/register',
  asyncHandler(authController.register)
);

// POST /api/v1/auth/login
router.post(
  '/login',
  asyncHandler(authController.login)
);

// GET /api/v1/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(authController.getProfile)
);

module.exports = router;

