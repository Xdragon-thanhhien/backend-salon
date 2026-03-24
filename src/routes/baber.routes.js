// routes/barber.routes.js
'use strict';

const express       = require('express');
const router        = express.Router();
const { asyncHandler }  = require('../helpers');
const barberService     = require('../services/barber.service');
const { OKResponse }    = require('../core/response/success.response');
const { authenticate }  = require('../middlewares/auth.middleware');
const { authorize }     = require('../middlewares/auth.middleware');

// GET /api/v1/barber/search?email=xxx
router.get(
  '/search',
  authenticate,
  authorize(['admin', 'barber']),
  asyncHandler(async (req, res) => {
    const { email, phoneNo } = req.query;

    const barber = await barberService.findBarber({ email, phoneNo });

    new OKResponse({
      message: 'Barber found.',
      data:    { barber }
    }).send(res);
  })
);

// GET /api/v1/barber/by-email?email=xxx
router.get(
  '/by-email',
  authenticate,
  authorize(['admin', 'barber']),
  asyncHandler(async (req, res) => {
    const barber = await barberService.findBarberByEmail(req.query.email);

    new OKResponse({
      message: 'Barber found by email.',
      data:    { barber }
    }).send(res);
  })
);

// GET /api/v1/barber/by-phone?phoneNo=xxx
router.get(
  '/by-phone',
  authenticate,
  authorize(['admin', 'barber']),
  asyncHandler(async (req, res) => {
    const barber = await barberService.findBarberByPhone(req.query.phoneNo);

    new OKResponse({
      message: 'Barber found by phone number.',
      data:    { barber }
    }).send(res);
  })
);

// GET /api/v1/barber/me
router.get(
  '/me',
  authenticate,
  authorize(['barber']),
  asyncHandler(barberController.getMyProfile)
);

// PUT /api/v1/barber/me
router.put(
  '/me',
  authenticate,
  authorize(['barber']),
  asyncHandler(barberController.updateMyProfile)
);

// PATCH /api/v1/barber/photo
router.patch(
  '/photo',
  authenticate,
  authorize(['barber']),
  uploadAvatar, // same multer middleware, field name: avatar
  asyncHandler(barberController.updateMyPhoto)
);

// GET /api/v1/barber/earnings?range=day|week|month
router.get(
  '/earnings',
  authenticate,
  authorize(['barber']),
  asyncHandler(barberController.getMyEarnings)
);

module.exports = router;
