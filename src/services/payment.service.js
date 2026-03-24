// services/payment.service.js
'use strict';

const Payment     = require('../models/payment.model');
const Appointment = require('../models/appointment.model');
const Customer    = require('../models/customer.model');
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError
} = require('../core/response/error.response');
const { findAll, findOne }          = require('../helpers');
const { getProvider }               = require('../providers/payment/paymentProvider.factory'); // ✅ new

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_STATUS = Object.freeze({
  PENDING:  'pending',
  SUCCESS:  'success',
  FAILED:   'failed',
  REFUNDED: 'refunded'
});

const PAYMENT_METHODS = Object.freeze({
  CASH:     'cash',
  CARD:     'card',
  WALLET:   'wallet',
  TRANSFER: 'transfer'
});

// ─── Shared Validation ────────────────────────────────────────────────────────

/**
 * Validates amount, currency, and method.
 */
function validatePaymentInput({ amount, method, currency }) {
  if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
    throw new BadRequestError('Payment amount must be a positive number.');
  }
  if (!currency || typeof currency !== 'string') {
    throw new BadRequestError('Currency is required.');
  }
  if (!Object.values(PAYMENT_METHODS).includes(method)) {
    throw new BadRequestError(
      `Invalid payment method. Use: ${Object.values(PAYMENT_METHODS).join(', ')}.`
    );
  }
}

// ─── Gateway Dispatcher ───────────────────────────────────────────────────────

/**
 * Dispatches payment creation to the correct gateway provider.
 * @param {string} providerName - 'stripe' | 'paypal' | 'momo' | 'zalopay'
 * @param {Object} payload      - { amount, currency, appointmentId }
 * @returns {Promise<Object>} Gateway result (payUrl, clientSecret, etc.)
 */
async function _dispatchToGateway(providerName, { amount, currency, appointmentId }) {
  const provider = getProvider(providerName);

  switch (providerName) {
    case 'stripe':
      return await provider.createPaymentIntent({
        amount,
        currency,
        metadata: { appointmentId }
      });

    case 'paypal':
      return await provider.createOrder({
        amount,
        currency,
        returnUrl: `${process.env.CLIENT_URL}/payment/result`,
        cancelUrl: `${process.env.CLIENT_URL}/payment/cancel`
      });

    case 'momo':
      return await provider.createPayment({
        amount,
        orderId:     `APPT_${appointmentId}_${Date.now()}`,
        orderInfo:   `Barbershop Payment #${appointmentId}`,
        redirectUrl: `${process.env.CLIENT_URL}/payment/result`,
        ipnUrl:      `${process.env.APP_URL}/api/v1/payments/webhook/momo`
      });

    case 'zalopay':
      return await provider.createOrder({
        amount,
        description: `Barbershop Payment #${appointmentId}`,
        callbackUrl: `${process.env.CLIENT_URL}/payment/result`
      });

    default:
      throw new BadRequestError(`Unsupported gateway: ${providerName}`);
  }
}

// ─── createPayment ────────────────────────────────────────────────────────────

/**
 * Creates a payment record + dispatches to gateway.
 * Double‑layer security:
 *  - Route layer : authenticate + authorize(['customer'])
 *  - Service layer: ownership check, status check, idempotency check
 *
 * @param {Object} payload
 * @param {string} payload.customerId
 * @param {string} payload.appointmentId
 * @param {number} payload.amount
 * @param {string} payload.method       - cash | card | wallet | transfer
 * @param {string} payload.currency     - default: 'VND'
 * @param {string} payload.idempotencyKey
 * @param {string} payload.provider     - stripe | paypal | momo | zalopay
 * @returns {Promise<{ payment: Object, gatewayResult: Object }>}
 */
async function createPayment({
  customerId,
  appointmentId,
  amount,
  method,
  currency        = 'VND',
  idempotencyKey,
  provider: providerName
}) {
  // 1. Validate basic inputs
  validatePaymentInput({ amount, method, currency });
  if (!appointmentId) throw new BadRequestError('appointmentId is required.');

  // 2. Verify appointment exists and belongs to this customer
  const appointment = await Appointment.findById(appointmentId)
    .select('CID BID Status')
    .lean();
  if (!appointment) throw new NotFoundError('Appointment not found.');

  if (appointment.CID.toString() !== customerId.toString()) {
    throw new ForbiddenError('You can only pay for your own appointments.');
  }
  if (!['scheduled', 'completed'].includes(appointment.Status)) {
    throw new ConflictError('Cannot pay for a cancelled or invalid appointment.');
  }

  // 3. Idempotency check (avoid double charge on retry)
  if (idempotencyKey) {
    const existing = await Payment.findOne({ idempotencyKey }).select('_id').lean();
    if (existing) throw new ConflictError('This payment request was already processed.');
  }

  // 4. Resolve gateway (env default fallback if not passed)
  const resolvedProvider = providerName || process.env.DEFAULT_PAYMENT_PROVIDER || 'momo';

  // 5. Dispatch to gateway → get payUrl / clientSecret / orderId etc.
  let gatewayResult = {};
  let initialStatus = PAYMENT_STATUS.PENDING;

  // Cash payments don't need a gateway
  if (method === PAYMENT_METHODS.CASH) {
    gatewayResult = { note: 'Cash payment — no gateway required.' };
    initialStatus = PAYMENT_STATUS.SUCCESS;
  } else {
    try {
      gatewayResult = await _dispatchToGateway(resolvedProvider, {
        amount,
        currency,
        appointmentId
      });
    } catch (err) {
      // Gateway call failed → persist FAILED record for audit
      await Payment.create({
        CID:             customerId,
        AppID:           appointmentId,
        Amount:          amount,
        Currency:        currency,
        Method:          method,
        Status:          PAYMENT_STATUS.FAILED,
        gatewayProvider: resolvedProvider,
        gatewayRef:      { error: err.message },
        idempotencyKey,
        Date:            new Date()
      });
      throw new BadRequestError(`Payment gateway error: ${err.message}`);
    }
  }

  // 6. Persist payment record
  const payment = await Payment.create({
    CID:             customerId,
    AppID:           appointmentId,
    Amount:          amount,
    Currency:        currency,
    Method:          method,
    Status:          initialStatus,
    gatewayProvider: resolvedProvider,
    gatewayRef:      gatewayResult,   // store payUrl, clientSecret, orderId etc.
    idempotencyKey,
    Date:            new Date()
  });

  return {
    payment:       payment.toObject(),
    gatewayResult  // returned to controller → sent to frontend
  };
}

// ─── refundPayment ────────────────────────────────────────────────────────────

/**
 * Refunds an existing successful payment via its gateway.
 * Admin only (enforced at route level).
 * @param {string} paymentId
 * @returns {Promise<Object>} Updated payment
 */
async function refundPayment(paymentId) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new NotFoundError('Payment not found.');

  if (payment.Status !== PAYMENT_STATUS.SUCCESS) {
    throw new ConflictError('Only successful payments can be refunded.');
  }

  const provider = getProvider(payment.gatewayProvider);

  // Dispatch refund to correct gateway
  switch (payment.gatewayProvider) {
    case 'stripe':
      await provider.refund(payment.gatewayRef?.paymentIntentId);
      break;

    case 'paypal':
      await provider.refund(payment.gatewayRef?.captureId);
      break;

    case 'momo':
      await provider.refund({
        orderId:     payment.gatewayRef?.requestId,
        requestId:   `REFUND_${paymentId}_${Date.now()}`,
        amount:      payment.Amount,
        transId:     payment.gatewayRef?.transId,
        description: `Refund for Payment #${paymentId}`
      });
      break;

    case 'zalopay':
      await provider.refund({
        zpTransId:   payment.gatewayRef?.zpTransToken,
        amount:      payment.Amount,
        description: `Refund for Payment #${paymentId}`
      });
      break;

    default:
      // Cash refund — no gateway, just mark as refunded
      break;
  }

  payment.Status = PAYMENT_STATUS.REFUNDED;
  payment.RefundedAt = new Date();
  await payment.save();

  return payment.toObject();
}

// ─── Webhook Handlers ─────────────────────────────────────────────────────────

/**
 * Handles MoMo IPN callback (server-to-server).
 * Updates payment status based on gateway result code.
 * @param {Object} body - MoMo IPN body
 * @returns {Promise<Object>} Updated payment
 */
async function handleMoMoWebhook(body) {
  const provider = getProvider('momo');

  if (!provider.verifyCallback(body)) {
    throw new ForbiddenError('Invalid MoMo webhook signature.');
  }

  const { orderId, resultCode } = body;

  // orderId format: APPT_{appointmentId}_{timestamp}
  const appointmentId = orderId?.split('_')[1];
  if (!appointmentId) throw new BadRequestError('Cannot resolve appointmentId from orderId.');

  const status = resultCode === 0
    ? PAYMENT_STATUS.SUCCESS
    : PAYMENT_STATUS.FAILED;

  const payment = await Payment.findOneAndUpdate(
    { 'gatewayRef.requestId': body.requestId },
    {
      $set: {
        Status:     status,
        gatewayRef: { ...body }
      }
    },
    { new: true }
  ).lean();

  return payment;
}

/**
 * Handles ZaloPay callback (server-to-server).
 * @param {Object} body - ZaloPay callback body
 * @returns {Promise<Object>} Updated payment
 */
async function handleZaloPayWebhook(body) {
  const provider = getProvider('zalopay');

  if (!provider.verifyCallback(body)) {
    throw new ForbiddenError('Invalid ZaloPay webhook signature.');
  }

  const cbData   = JSON.parse(body.data);
  const status   = cbData.return_code === 1
    ? PAYMENT_STATUS.SUCCESS
    : PAYMENT_STATUS.FAILED;

  const payment = await Payment.findOneAndUpdate(
    { 'gatewayRef.appTransId': cbData.app_trans_id },
    {
      $set: {
        Status:     status,
        gatewayRef: { ...cbData }
      }
    },
    { new: true }
  ).lean();

  return payment;
}

// ─── Read Functions (unchanged from original) ─────────────────────────────────

async function getPaymentsByCustomer(customerId, { page = 1, limit = 20 } = {}) {
  return await findAll({
    model:    Payment,
    filter:   { CID: customerId },
    page,
    limit,
    sort:     '-Date',
    populate: [{ path: 'AppID', select: 'AppDate Status' }]
  });
}

async function getPaymentsByAppointment(appointmentId, { page = 1, limit = 20 } = {}) {
  return await findAll({
    model:    Payment,
    filter:   { AppID: appointmentId },
    page,
    limit,
    sort:     '-Date',
    populate: [{ path: 'CID', select: 'Fname Lname' }]
  });
}

async function getAllPayments({ page = 1, limit = 50, status, method } = {}) {
  const filter = {};
  if (status) filter.Status = status;
  if (method) filter.Method = method;

  return await findAll({
    model:    Payment,
    filter,
    page,
    limit,
    sort:     '-Date',
    populate: [
      { path: 'CID',   select: 'Fname Lname' },
      { path: 'AppID', select: 'AppDate Status' }
    ]
  });
}

async function getPaymentById(paymentId, requester) {
  const payment = await findOne({
    model:    Payment,
    filter:   { _id: paymentId },
    populate: [
      { path: 'CID',   select: 'Fname Lname' },
      { path: 'AppID', select: 'CID BID AppDate Status' }
    ]
  });

  if (!payment) throw new NotFoundError('Payment not found.');

  const isOwner  = payment.CID._id.toString() === requester.id.toString();
  const isBarber = requester.role === 'barber';
  const isAdmin  = requester.role === 'admin';

  if (!isOwner && !isAdmin && !isBarber) {
    throw new ForbiddenError('You do not have permission to view this payment.');
  }

  return payment;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  createPayment,          // ✅ updated: gateway dispatch + FAILED audit record
  refundPayment,          // ✅ new: refund via gateway
  handleMoMoWebhook,      // ✅ new: MoMo IPN handler
  handleZaloPayWebhook,   // ✅ new: ZaloPay callback handler
  getPaymentsByCustomer,
  getPaymentsByAppointment,
  getAllPayments,
  getPaymentById
};



// // services/payment.service.js
// 'use strict';

// const Payment      = require('../models/payment.model');
// const Appointment  = require('../models/appointment.model');
// const Customer     = require('../models/customer.model');
// const {
//   BadRequestError,
//   NotFoundError,
//   ForbiddenError,
//   ConflictError
// } = require('../core/response/error.response');
// const { findAll, findOne } = require('../helpers');

// const PAYMENT_STATUS = Object.freeze({
//   PENDING:   'pending',
//   SUCCESS:   'success',
//   FAILED:    'failed',
//   REFUNDED:  'refunded'
// });

// const PAYMENT_METHODS = Object.freeze({
//   CASH:      'cash',
//   CARD:      'card',
//   WALLET:    'wallet',
//   TRANSFER:  'transfer'
// });

// /**
//  * Validates amount, currency, and method.
//  */
// function validatePaymentInput({ amount, method, currency }) {
//   if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
//     throw new BadRequestError('Payment amount must be a positive number.');
//   }

//   if (!currency || typeof currency !== 'string') {
//     throw new BadRequestError('Currency is required.');
//   }

//   if (!Object.values(PAYMENT_METHODS).includes(method)) {
//     throw new BadRequestError(
//       `Invalid payment method. Use: ${Object.values(PAYMENT_METHODS).join(', ')}.`
//     );
//   }
// }

// /**
//  * Creates a payment record (after external gateway confirms success).
//  * Double‑layer security:
//  *  - Route: auth & role
//  *  - Service: validates appointment ownership and idempotency
//  */
// async function createPayment({
//   customerId,
//   appointmentId,
//   amount,
//   method,
//   currency = 'VND',
//   idempotencyKey // unique per payment attempt to avoid double charge
// }) {
//   validatePaymentInput({ amount, method, currency });

//   if (!appointmentId) {
//     throw new BadRequestError('appointmentId is required.');
//   }

//   // 1. Verify appointment exists and belongs to customer
//   const appointment = await Appointment.findById(appointmentId)
//     .select('CID BID Status')
//     .lean();

//   if (!appointment) throw new NotFoundError('Appointment not found.');

//   if (appointment.CID.toString() !== customerId.toString()) {
//     throw new ForbiddenError('You can only pay for your own appointments.');
//   }

//   if (!['scheduled', 'completed'].includes(appointment.Status)) {
//     throw new ConflictError('Cannot pay for a cancelled or invalid appointment.');
//   }

//   // 2. Idempotency check (avoid double payment for same key)
//   if (idempotencyKey) {
//     const existing = await Payment.findOne({ idempotencyKey }).select('_id').lean();
//     if (existing) {
//       throw new ConflictError('This payment request was already processed.');
//     }
//   }

//   // 3. Persist payment (assumes external gateway has already processed it)
//   const payment = await Payment.create({
//     CID:           customerId,
//     AppID:         appointmentId,
//     Amount:        amount,
//     Currency:      currency,
//     Method:        method,
//     Status:        PAYMENT_STATUS.SUCCESS,
//     idempotencyKey,
//     Date:          new Date()
//   });

//   return payment.toObject();
// }

// /**
//  * Returns all payments for a customer (secure: only own).
//  */
// async function getPaymentsByCustomer(customerId, { page = 1, limit = 20 } = {}) {
//   return await findAll({
//     model:    Payment,
//     filter:   { CID: customerId },
//     page,
//     limit,
//     sort:     '-Date',
//     populate: [
//       { path: 'AppID', select: 'AppDate Status' }
//     ]
//   });
// }

// /**
//  * Returns all payments for a given appointment (for barber/admin).
//  */
// async function getPaymentsByAppointment(appointmentId, { page = 1, limit = 20 } = {}) {
//   return await findAll({
//     model:    Payment,
//     filter:   { AppID: appointmentId },
//     page,
//     limit,
//     sort:     '-Date',
//     populate: [
//       { path: 'CID', select: 'Fname Lname' }
//     ]
//   });
// }

// /**
//  * Admin view: all payments with filters.
//  */
// async function getAllPayments({ page = 1, limit = 50, status, method } = {}) {
//   const filter = {};
//   if (status) filter.Status = status;
//   if (method) filter.Method = method;

//   return await findAll({
//     model:    Payment,
//     filter,
//     page,
//     limit,
//     sort:     '-Date',
//     populate: [
//       { path: 'CID',   select: 'Fname Lname' },
//       { path: 'AppID', select: 'AppDate Status' }
//     ]
//   });
// }

// /**
//  * Fetch single payment with security: customer can see own; barber/admin broader.
//  */
// async function getPaymentById(paymentId, requester) {
//   const payment = await findOne({
//     model:    Payment,
//     filter:   { _id: paymentId },
//     populate: [
//       { path: 'CID',   select: 'Fname Lname' },
//       { path: 'AppID', select: 'CID BID AppDate Status' }
//     ]
//   });

//   if (!payment) throw new NotFoundError('Payment not found.');

//   const isOwner  = payment.CID._id.toString() === requester.id.toString();
//   const isBarber = requester.role === 'barber';
//   const isAdmin  = requester.role === 'admin';

//   if (!isOwner && !isAdmin && !isBarber) {
//     throw new ForbiddenError('You do not have permission to view this payment.');
//   }

//   return payment;
// }

// module.exports = {
//   PAYMENT_STATUS,
//   PAYMENT_METHODS,
//   createPayment,
//   getPaymentsByCustomer,
//   getPaymentsByAppointment,
//   getAllPayments,
//   getPaymentById
// };
