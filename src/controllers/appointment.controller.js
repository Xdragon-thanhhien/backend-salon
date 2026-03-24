// controllers/appointment.controller.js
'use strict';

const appointmentService = require('../services/appointment.service');
const {
  OKResponse,
  CreatedResponse,
  NoContentResponse
} = require('../core/response/success.response');

class AppointmentController {

  /**
   * Customer creates a new appointment
   * POST /api/v1/appointments
   */
  createAppointment = async (req, res, next) => {
    const customerId = req.user.userId; // from JWT via authenticate middleware
    const { barberId, serviceIds, startTime, notes } = req.body;

    const appointment = await appointmentService.createAppointment({
      customerId,
      barberId,
      serviceIds,
      startTime,
      notes
    });

    new CreatedResponse({
      message: 'Appointment booked successfully.',
      data:    { appointment }
    }).send(res);
  };

  /**
   * Customer views their own appointments
   * GET /api/v1/appointments/me
   */
  getMyAppointments = async (req, res, next) => {
    const customerId = req.user.userId;

    const appointments = await appointmentService.getAppointmentsByCustomer(customerId);

    new OKResponse({
      message: 'Your appointments fetched successfully.',
      data:    { appointments }
    }).send(res);
  };

  /**
   * Barber views their schedule (filterable by date & status)
   * GET /api/v1/appointments/barber?date=2026-03-23&status=scheduled
   */
  getBarberAppointments = async (req, res, next) => {
    const barberId = req.user.userId;
    const { date, status } = req.query;

    const appointments = await appointmentService.getAppointmentsByBarber(
      barberId,
      { date, status }
    );

    new OKResponse({
      message: 'Barber schedule fetched successfully.',
      data:    { appointments }
    }).send(res);
  };

  /**
   * Get full details of a single appointment
   * GET /api/v1/appointments/:id
   */
  getAppointmentById = async (req, res, next) => {
    const { id } = req.params;

    const appointment = await appointmentService.getAppointmentById(id);

    new OKResponse({
      message: 'Appointment details fetched successfully.',
      data:    { appointment }
    }).send(res);
  };

  /**
   * Update appointment time, services, status, or notes
   * PUT /api/v1/appointments/:id
   */
  updateAppointment = async (req, res, next) => {
    const { id } = req.params;
    const { serviceIds, startTime, notes, status } = req.body;

    const appointment = await appointmentService.updateAppointment(id, {
      serviceIds,
      startTime,
      notes,
      status
    });

    new OKResponse({
      message: 'Appointment updated successfully.',
      data:    { appointment }
    }).send(res);
  };

  /**
   * Cancel an appointment (customer, barber, or admin)
   * DELETE /api/v1/appointments/:id
   */
  cancelAppointment = async (req, res, next) => {
    const { id } = req.params;
    const { reason } = req.body;

    await appointmentService.cancelAppointment(id, reason);

    new NoContentResponse().send(res);
  };
}

module.exports = new AppointmentController();
