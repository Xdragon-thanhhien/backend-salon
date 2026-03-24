// controllers/payment.controller.js
'use strict';

const paymentService = require('../services/payment.service');
const {
  OKResponse,
  CreatedResponse
} = require('../core/response/success.response');

class PaymentController {

  /**
   * Customer confirms a successful payment (after gateway).
   * POST /api/v1/payments
   */
  createPayment = async (req, res, next) => {
    const customerId = req.user.userId;
    const { appointmentId, amount, method, currency, idempotencyKey } = req.body;

    const payment = await paymentService.createPayment({
      customerId,
      appointmentId,
      amount,
      method,
      currency,
      idempotencyKey
    });

    new CreatedResponse({
      message: 'Payment recorded successfully.',
      data:    { payment }
    }).send(res);
  };

  /**
   * Customer: list own payments.
   * GET /api/v1/payments/me
   */
  getMyPayments = async (req, res, next) => {
    const customerId = req.user.userId;
    const { page, limit } = req.query;

    const result = await paymentService.getPaymentsByCustomer(customerId, {
      page:  Number(page)  || 1,
      limit: Number(limit) || 20
    });

    new OKResponse({
      message: 'Payments fetched successfully.',
      data:    result
    }).send(res);
  };

  /**
   * Admin/Barber: list payments by appointment.
   * GET /api/v1/payments/appointment/:appointmentId
   */
  getPaymentsByAppointment = async (req, res, next) => {
    const { appointmentId } = req.params;
    const { page, limit } = req.query;

    const result = await paymentService.getPaymentsByAppointment(appointmentId, {
      page:  Number(page)  || 1,
      limit: Number(limit) || 20
    });

    new OKResponse({
      message: 'Appointment payments fetched successfully.',
      data:    result
    }).send(res);
  };

  /**
   * Admin: list all payments with filters.
   * GET /api/v1/payments
   */
  getAllPayments = async (req, res, next) => {
    const { page, limit, status, method } = req.query;

    const result = await paymentService.getAllPayments({
      page:  Number(page)  || 1,
      limit: Number(limit) || 50,
      status,
      method
    });

    new OKResponse({
      message: 'All payments fetched successfully.',
      data:    result
    }).send(res);
  };

  /**
   * Get single payment detail.
   * GET /api/v1/payments/:id
   */
  getPaymentById = async (req, res, next) => {
    const { id } = req.params;
    const requester = {
      id:   req.user.userId,
      role: req.user.role
    };

    const payment = await paymentService.getPaymentById(id, requester);

    new OKResponse({
      message: 'Payment details fetched successfully.',
      data:    { payment }
    }).send(res);
  };
}

module.exports = new PaymentController();
