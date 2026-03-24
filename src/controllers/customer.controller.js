// controllers/customer.controller.js
'use strict';

const customerService = require('../services/customer.service');
const {
  OKResponse,
  NoContentResponse
} = require('../core/response/success.response');

class CustomerController {

  /**
   * GET /api/v1/customer/profile
   */
  getProfile = async (req, res, next) => {
    const profile = await customerService.getProfile(req.user.userId);

    new OKResponse({
      message: 'Profile fetched successfully.',
      data:    { profile }
    }).send(res);
  };

  /**
   * PUT /api/v1/customer/profile
   */
  updateProfile = async (req, res, next) => {
    const { Fname, Lname, PhoneNo, Address, Gender } = req.body;

    const profile = await customerService.updateProfile(req.user.userId, {
      Fname, Lname, PhoneNo, Address, Gender
    });

    new OKResponse({
      message: 'Profile updated successfully.',
      data:    { profile }
    }).send(res);
  };

  /**
   * PATCH /api/v1/customer/change-password
   */
  changePassword = async (req, res, next) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    await customerService.changePassword(req.user.userId, {
      currentPassword, newPassword, confirmNewPassword
    });

    new NoContentResponse().send(res);
  };

  /**
   * POST /api/v1/customer/forgot-password
   * Public — no auth required
   */
  forgotPassword = async (req, res, next) => {
    const result = await customerService.forgotPassword(req.body.email);

    new OKResponse({
      message: result.message,
      data:    process.env.NODE_ENV !== 'production'
                 ? { resetToken: result.resetToken, expiresAt: result.expiresAt }
                 : {}
    }).send(res);
  };

  /**
   * POST /api/v1/customer/reset-password
   * Public — token from email link
   */
  resetPassword = async (req, res, next) => {
    const { token, newPassword, confirmNewPassword } = req.body;

    await customerService.resetPassword(token, newPassword, confirmNewPassword);

    new OKResponse({
      message: 'Password reset successfully. Please sign in with your new password.',
      data:    {}
    }).send(res);
  };

  /**
   * PATCH /api/v1/customer/avatar
   * Requires Multer middleware (uploadAvatar) before this handler
   */
  updateAvatar = async (req, res, next) => {
    // avatarUrl is set by Multer/Cloudinary middleware on req.file
    const avatarUrl = req.file?.path || req.file?.secure_url;

    const profile = await customerService.updateAvatar(req.user.userId, avatarUrl);

    new OKResponse({
      message: 'Avatar updated successfully.',
      data:    { profile }
    }).send(res);
  };
}

module.exports = new CustomerController();
