// controllers/barber.controller.js
'use strict';

const barberService = require('../services/barber.service');
const {
  OKResponse
} = require('../core/response/success.response');

class BarberController {
  /**
   * GET /api/v1/barber/me
   */
  getMyProfile = async (req, res, next) => {
    const barber = await barberService.getBarberProfile(req.user.userId);

    new OKResponse({
      message: 'Barber profile fetched successfully.',
      data:    { barber }
    }).send(res);
  };

  /**
   * PUT /api/v1/barber/me
   * { Fname?, Lname?, phoneNo?, bio?, skills?, specialties? }
   */
  updateMyProfile = async (req, res, next) => {
    const barber = await barberService.updateBarberProfile(
      req.user.userId,
      req.body
    );

    new OKResponse({
      message: 'Barber profile updated successfully.',
      data:    { barber }
    }).send(res);
  };

  /**
   * PATCH /api/v1/barber/photo
   * Uses uploadAvatar/ uploadPhoto middleware (Multer)
   */
  updateMyPhoto = async (req, res, next) => {
    const photoUrl = req.file?.path || req.file?.secure_url;

    const barber = await barberService.updateBarberPhoto(
      req.user.userId,
      photoUrl
    );

    new OKResponse({
      message: 'Barber photo updated successfully.',
      data:    { barber }
    }).send(res);
  };

  /**
   * GET /api/v1/barber/earnings?range=day|week|month
   */
  getMyEarnings = async (req, res, next) => {
    const range = req.query.range || 'day';

    const summary = await barberService.getEarningsSummary(
      req.user.userId,
      range
    );

    new OKResponse({
      message: `Barber earnings summary for ${range}.`,
      data:    summary
    }).send(res);
  };
}

module.exports = new BarberController();
