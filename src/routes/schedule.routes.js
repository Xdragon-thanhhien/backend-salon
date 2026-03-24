// routes/schedule.routes.js
'use strict';

const express          = require('express');
const router           = express.Router();
const { asyncHandler } = require('../helpers');
const scheduleService  = require('../services/schedule.service');
const { OKResponse, CreatedResponse, NoContentResponse } =
  require('../core/response/success.response');
const { authenticate, authorize } =
  require('../middlewares/auth.middleware');

// [POST] /api/v1/schedules – admin/barber creates a shift
router.post('/',
  authenticate,
  authorize(['admin', 'barber']),
  asyncHandler(async (req, res) => {
    const { barberId, STime, ETime, DaysOfWeek } = req.body;
    const schedule = await scheduleService.createSchedule({
      barberId, STime, ETime, DaysOfWeek
    });
    new CreatedResponse({
      message: 'Schedule created successfully.',
      data:    { schedule }
    }).send(res);
  })
);

// [GET] /api/v1/schedules/barber/:barberId – get barber's schedule
router.get('/barber/:barberId',
  authenticate,
  authorize(['admin', 'barber', 'customer']),
  asyncHandler(async (req, res) => {
    const { page, limit, onlyActive } = req.query;
    const schedules = await scheduleService.getSchedulesByBarber(
      req.params.barberId,
      { page, limit, onlyActive: onlyActive === 'true' }
    );
    new OKResponse({
      message: 'Barber schedule fetched.',
      data:    { schedules }
    }).send(res);
  })
);

// [GET] /api/v1/schedules/available?day=Monday&STime=09:00&ETime=10:00
router.get('/available',
  asyncHandler(async (req, res) => {
    const { day, STime, ETime } = req.query;
    const barbers = await scheduleService.getAvailableBarbers(day, STime, ETime);
    new OKResponse({
      message: 'Available barbers fetched.',
      data:    { barbers }
    }).send(res);
  })
);

// [PUT] /api/v1/schedules/:id – update schedule
router.put('/:id',
  authenticate,
  authorize(['admin', 'barber']),
  asyncHandler(async (req, res) => {
    const schedule = await scheduleService.updateSchedule(
      req.params.id, req.body
    );
    new OKResponse({
      message: 'Schedule updated.',
      data:    { schedule }
    }).send(res);
  })
);

// [PATCH] /api/v1/schedules/:id/toggle – toggle availability
router.patch('/:id/toggle',
  authenticate,
  authorize(['admin', 'barber']),
  asyncHandler(async (req, res) => {
    const { isAvailable } = req.body;
    const schedule = await scheduleService.toggleScheduleAvailability(
      req.params.id, isAvailable
    );
    new OKResponse({
      message: `Schedule ${isAvailable ? 'activated' : 'deactivated'}.`,
      data:    { schedule }
    }).send(res);
  })
);

// [DELETE] /api/v1/schedules/:id – delete shift
router.delete('/:id',
  authenticate,
  authorize(['admin']),
  asyncHandler(async (req, res) => {
    await scheduleService.deleteSchedule(req.params.id);
    new NoContentResponse().send(res);
  })
);

module.exports = router;
