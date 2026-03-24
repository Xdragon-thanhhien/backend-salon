// middlewares/upload.middleware.js
'use strict';

const multer    = require('multer');
const path      = require('path');
const { BadRequestError } = require('../core/response/error.response');

// ─── Allowed MIME types ───────────────────────────────────────────────────────

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_MB   = 2; // 2MB

// ─── Local Storage (dev) ──────────────────────────────────────────────────────

const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/avatars/');
  },
  filename: (req, file, cb) => {
    const ext      = path.extname(file.originalname);
    const filename = `avatar_${req.user.userId}_${Date.now()}${ext}`;
    cb(null, filename);
  }
});

// ─── File Filter ──────────────────────────────────────────────────────────────

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(
      new BadRequestError('Only JPEG, PNG, and WebP images are allowed.'),
      false
    );
  }
  cb(null, true);
};

// ─── Multer Instance ──────────────────────────────────────────────────────────

const upload = multer({
  storage:  localStorage,
  limits:   { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter
});

/**
 * Middleware: upload a single avatar file.
 * Attaches file info to req.file.
 */
const uploadAvatar = upload.single('avatar'); // field name in form-data

module.exports = { uploadAvatar };
