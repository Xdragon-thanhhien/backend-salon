'use strict';
const { findOne, selectData } = require('../helpers');
const Customer = require('../models/customer.model');

const crypto   = require('crypto');
const bcrypt   = require('bcrypt');
const Customer = require('../models/customer.model');
const {
  findOne
} = require('../helpers');
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError
} = require('../core/response/error.response');
const {
  isValidEmail,
  isValidPhone,
  normalizeEmail
} = require('../helpers');

// Get customer profile (only safe fields)
async function getCustomerProfile(customerId) {
  return await findOne({
    model:  Customer,
    filter: { _id: customerId },
    select: ['Fname', 'Lname', 'PhoneNo', 'Address', 'Gender']
    // password never included
  });
}
// ─── Constants ────────────────────────────────────────────────────────────────

const SALT_ROUNDS        = 10;
const RESET_TOKEN_BYTES  = 32;
const RESET_TOKEN_EXPIRY = 15 * 60 * 1000; // 15 minutes in ms

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Hashes a plain-text password.
 * @param {string} password
 * @returns {Promise<string>}
 */
async function _hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compares plain password against hashed.
 * @param {string} plain
 * @param {string} hashed
 * @returns {Promise<boolean>}
 */
async function _comparePassword(plain, hashed) {
  return await bcrypt.compare(plain, hashed);
}

/**
 * Validates profile update fields.
 */
function _validateProfileInput({ Fname, Lname, PhoneNo, Address }) {
  if (Fname && Fname.trim().length === 0) {
    throw new BadRequestError('First name cannot be empty.');
  }
  if (Lname && Lname.trim().length === 0) {
    throw new BadRequestError('Last name cannot be empty.');
  }
  if (PhoneNo && !isValidPhone(PhoneNo)) {
    throw new BadRequestError('Please provide a valid phone number.');
  }
  if (Address && Address.trim().length > 200) {
    throw new BadRequestError('Address must not exceed 200 characters.');
  }
}

// ─── Profile Functions ────────────────────────────────────────────────────────

/**
 * Gets customer profile (safe fields only, no password).
 * @param {string} customerId
 * @returns {Promise<Object>}
 */
async function getProfile(customerId) {
  const customer = await findOne({
    model:  Customer,
    filter: { _id: customerId },
    select: ['Fname', 'Lname', 'email', 'PhoneNo', 'Address', 'Gender', 'avatar', 'createdAt']
  });

  if (!customer) throw new NotFoundError('Customer not found.');
  return customer;
}

/**
 * Updates customer profile (name, phone, address).
 * @param {string} customerId
 * @param {Object} payload    - { Fname?, Lname?, PhoneNo?, Address?, Gender? }
 * @returns {Promise<Object>} Updated profile
 */
async function updateProfile(customerId, { Fname, Lname, PhoneNo, Address, Gender }) {
  // 1. Validate
  _validateProfileInput({ Fname, Lname, PhoneNo, Address });

  // 2. Check phone uniqueness if changed
  if (PhoneNo) {
    const existing = await Customer.findOne({
      PhoneNo,
      _id: { $ne: customerId }
    }).select('_id').lean();

    if (existing) {
      throw new ConflictError('This phone number is already in use by another account.');
    }
  }

  // 3. Build update payload (only provided fields)
  const updates = {};
  if (Fname)   updates.Fname   = Fname.trim();
  if (Lname)   updates.Lname   = Lname.trim();
  if (PhoneNo) updates.PhoneNo = PhoneNo.trim();
  if (Address) updates.Address = Address.trim();
  if (Gender)  updates.Gender  = Gender;

  const updated = await Customer.findByIdAndUpdate(
    customerId,
    { $set: updates },
    { new: true }
  ).select('-password -salt -__v').lean();

  if (!updated) throw new NotFoundError('Customer not found.');
  return updated;
}

// ─── Password Functions ───────────────────────────────────────────────────────

/**
 * Changes password for authenticated customer.
 * Requires current password confirmation.
 * @param {string} customerId
 * @param {Object} payload    - { currentPassword, newPassword, confirmNewPassword }
 * @returns {Promise<void>}
 */
async function changePassword(customerId, { currentPassword, newPassword, confirmNewPassword }) {
  // 1. Validate inputs
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    throw new BadRequestError('currentPassword, newPassword, and confirmNewPassword are required.');
  }
  if (newPassword.length < 6) {
    throw new BadRequestError('New password must be at least 6 characters.');
  }
  if (newPassword !== confirmNewPassword) {
    throw new BadRequestError('New passwords do not match.');
  }
  if (currentPassword === newPassword) {
    throw new BadRequestError('New password must be different from current password.');
  }

  // 2. Get customer with password
  const customer = await Customer.findById(customerId).select('+password');
  if (!customer) throw new NotFoundError('Customer not found.');

  // 3. Verify current password
  const isMatch = await _comparePassword(currentPassword, customer.password);
  if (!isMatch) {
    throw new ForbiddenError('Current password is incorrect.');
  }

  // 4. Hash and save new password
  customer.password = await _hashPassword(newPassword);
  await customer.save();
}

/**
 * Initiates forgot password flow — generates a secure reset token
 * and would typically send it via email.
 * @param {string} email
 * @returns {Promise<{ resetToken: string, expiresAt: Date }>}
 * NOTE: In production, send resetToken via email — never expose in API response.
 */
async function forgotPassword(email) {
  if (!email) throw new BadRequestError('Email is required.');
  if (!isValidEmail(email)) throw new BadRequestError('Invalid email format.');

  const customer = await Customer.findOne({
    email: normalizeEmail(email)
  }).select('_id email Fname');

  // Always respond OK to prevent user enumeration (don't reveal if email exists)
  if (!customer) return { message: 'If this email exists, a reset link has been sent.' };

  // 1. Generate secure random token
  const rawToken    = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt   = new Date(Date.now() + RESET_TOKEN_EXPIRY);

  // 2. Store hashed token on customer (never store raw)
  await Customer.findByIdAndUpdate(customer._id, {
    $set: {
      resetPasswordToken:   hashedToken,
      resetPasswordExpires: expiresAt
    }
  });

  // 3. TODO: Send rawToken via email
  //    emailService.sendResetPasswordEmail(customer.email, rawToken);
  //    The reset URL would be: ${CLIENT_URL}/reset-password?token=${rawToken}

  if (process.env.NODE_ENV !== 'production') {
    // Expose token in dev only for testing
    return { message: 'Reset token generated (dev only).', resetToken: rawToken, expiresAt };
  }

  return { message: 'If this email exists, a reset link has been sent.' };
}

/**
 * Resets password using the token received from email.
 * @param {string} rawToken          - Plain token from email link
 * @param {string} newPassword
 * @param {string} confirmNewPassword
 * @returns {Promise<void>}
 */
async function resetPassword(rawToken, newPassword, confirmNewPassword) {
  // 1. Validate inputs
  if (!rawToken) throw new BadRequestError('Reset token is required.');
  if (!newPassword || !confirmNewPassword) {
    throw new BadRequestError('newPassword and confirmNewPassword are required.');
  }
  if (newPassword.length < 6) {
    throw new BadRequestError('Password must be at least 6 characters.');
  }
  if (newPassword !== confirmNewPassword) {
    throw new BadRequestError('Passwords do not match.');
  }

  // 2. Hash the incoming token to compare with stored hashed token
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  // 3. Find customer with valid (not expired) token
  const customer = await Customer.findOne({
    resetPasswordToken:   hashedToken,
    resetPasswordExpires: { $gt: new Date() } // not expired
  }).select('+password');

  if (!customer) {
    throw new BadRequestError('Reset token is invalid or has expired.');
  }

  // 4. Set new password and clear token fields
  customer.password             = await _hashPassword(newPassword);
  customer.resetPasswordToken   = undefined;
  customer.resetPasswordExpires = undefined;
  await customer.save();
}

// ─── Avatar Upload ────────────────────────────────────────────────────────────

/**
 * Updates customer avatar URL after file upload (Multer/Cloudinary).
 * The actual file upload is handled by middleware before this is called.
 * @param {string} customerId
 * @param {string} avatarUrl  - Final URL (local path or Cloudinary URL)
 * @returns {Promise<Object>} Updated profile
 */
async function updateAvatar(customerId, avatarUrl) {
  if (!avatarUrl) throw new BadRequestError('Avatar URL is required.');

  const updated = await Customer.findByIdAndUpdate(
    customerId,
    { $set: { avatar: avatarUrl } },
    { new: true }
  ).select('Fname Lname avatar').lean();

  if (!updated) throw new NotFoundError('Customer not found.');
  return updated;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  updateAvatar
};
