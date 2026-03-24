// routes/payment.routes.js
'use strict';

const express            = require('express');
const router             = express.Router();
const paymentController  = require('../controllers/payment.controller');
const { asyncHandler }   = require('../helpers');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Customer creates payment (after gateway success)
// Double‑layer security:
//  - authenticate + authorize(['customer']) here
//  - ownership & idempotency in service
router.post(
  '/',
  authenticate,
  authorize(['customer']),
  asyncHandler(paymentController.createPayment)
);

// Customer: list own payments
router.get(
  '/me',
  authenticate,
  authorize(['customer']),
  asyncHandler(paymentController.getMyPayments)
);

// Admin/Barber: list payments for an appointment
router.get(
  '/appointment/:appointmentId',
  authenticate,
  authorize(['barber', 'admin']),
  asyncHandler(paymentController.getPaymentsByAppointment)
);

// Admin: list all payments with filters
router.get(
  '/',
  authenticate,
  authorize(['admin']),
  asyncHandler(paymentController.getAllPayments)
);

// Customer / Barber / Admin: view specific payment (service re-checks access)
router.get(
  '/:id',
  authenticate,
  authorize(['customer', 'barber', 'admin']),
  asyncHandler(paymentController.getPaymentById)
);

module.exports = router;
