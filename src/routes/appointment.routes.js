// routes/appointment.routes.js
'use strict';

const express = require('express');
const router  = express.Router();

const { asyncHandler } = require('../helpers'); // hoặc ../helpers/asyncHandler
const appointmentService = require('../services/appointment.service');
const { OKResponse, CreatedResponse, NoContentResponse } =
  require('../core/response/success.response');
const { authenticate, authorize } =
  require('../middlewares/auth.middleware');

// ─────────────────────────────────────────────────────────────
// 1. CUSTOMER – tạo & xem lịch hẹn
// Base: /api/v1/appointments
// ─────────────────────────────────────────────────────────────

// [POST] /api/v1/appointments
// Customer tạo lịch hẹn mới
router.post(
  '/',
  authenticate,
  authorize(['customer']),
  asyncHandler(async (req, res) => {
    const customerId = req.user.userId; // từ JWT
    const { barberId, serviceIds, startTime, notes } = req.body;

    const appointment = await appointmentService.createAppointment({
      customerId,
      barberId,
      serviceIds,
      startTime,
      notes
    });

    new CreatedResponse({
      message: 'Appointment created successfully.',
      data:    { appointment }
    }).send(res);
  })
);

// [GET] /api/v1/appointments/me
// Customer xem tất cả lịch hẹn của mình
router.get(
  '/me',
  authenticate,
  authorize(['customer']),
  asyncHandler(async (req, res) => {
    const customerId = req.user.userId;

    const appointments = await appointmentService.getAppointmentsByCustomer(customerId);

    new OKResponse({
      message: 'Customer appointments fetched successfully.',
      data:    { appointments }
    }).send(res);
  })
);


// ─────────────────────────────────────────────────────────────
// 2. BARBER – xem lịch làm việc
// ─────────────────────────────────────────────────────────────

// [GET] /api/v1/appointments/barber
// Barber xem lịch hẹn của mình (có thể filter theo date, status)
router.get(
  '/barber',
  authenticate,
  authorize(['barber', 'admin']),
  asyncHandler(async (req, res) => {
    const barberId = req.user.userId; // barber hiện tại
    const { date, status } = req.query;

    const appointments = await appointmentService.getAppointmentsByBarber(barberId, {
      date,
      status
    });

    new OKResponse({
      message: 'Barber appointments fetched successfully.',
      data:    { appointments }
    }).send(res);
  })
);


// ─────────────────────────────────────────────────────────────
// 3. ADMIN / BARBER – xem chi tiết, update, hủy
// ─────────────────────────────────────────────────────────────

// [GET] /api/v1/appointments/:id
// Xem chi tiết 1 lịch hẹn (admin, barber xem; customer chỉ xem của mình thì có thể thêm check sau)
router.get(
  '/:id',
  authenticate,
  authorize(['admin', 'barber', 'customer']),
  asyncHandler(async (req, res) => {
    const appointment = await appointmentService.getAppointmentById(req.params.id);

    // (Optional) nếu role=customer, có thể check appointment.CID === req.user.userId

    new OKResponse({
      message: 'Appointment details fetched successfully.',
      data:    { appointment }
    }).send(res);
  })
);

// [PUT] /api/v1/appointments/:id
// Cập nhật thời gian/dịch vụ/trạng thái – thường cho barber/admin
router.put(
  '/:id',
  authenticate,
  authorize(['barber', 'admin']),
  asyncHandler(async (req, res) => {
    const { serviceIds, startTime, notes, status } = req.body;

    const appointment = await appointmentService.updateAppointment(
      req.params.id,
      { serviceIds, startTime, notes, status }
    );

    new OKResponse({
      message: 'Appointment updated successfully.',
      data:    { appointment }
    }).send(res);
  })
);

// [DELETE] /api/v1/appointments/:id
// Hủy lịch hẹn (customer, barber, admin – tùy logic)
router.delete(
  '/:id',
  authenticate,
  authorize(['customer', 'barber', 'admin']),
  asyncHandler(async (req, res) => {
    const { reason } = req.body;

    await appointmentService.cancelAppointment(req.params.id, reason);

    new NoContentResponse().send(res);
  })
);

module.exports = router;
