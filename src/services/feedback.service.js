// services/feedback.service.js
'use strict';

const Feedback   = require('../models/feedback.model');
const Barber     = require('../models/baber.model');
const Customer   = require('../models/customer.model');
const Appointment = require('../models/appointment.model');
const {
  findAll,
  findOne
} = require('../helpers');
const {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError
} = require('../core/response/error.response');

// ─── Constants ────────────────────────────────────────────────────────────────

const RATING_MIN = 1;
const RATING_MAX = 5;

const FEEDBACK_STATUS = Object.freeze({
  VISIBLE: 'visible',
  HIDDEN:  'hidden',   // hidden by admin (e.g., spam or inappropriate)
  FLAGGED: 'flagged'   // flagged for review
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validates feedback rating and comment.
 * @param {number} rating   - Must be between 1 and 5
 * @param {string} comments - Must not be empty
 */
function _validateFeedbackInput(rating, comments) {
  if (!rating) {
    throw new BadRequestError('Rating is required.');
  }
  if (!Number.isInteger(rating) || rating < RATING_MIN || rating > RATING_MAX) {
    throw new BadRequestError(`Rating must be an integer between ${RATING_MIN} and ${RATING_MAX}.`);
  }
  if (!comments || comments.trim().length === 0) {
    throw new BadRequestError('Comment is required.');
  }
  if (comments.trim().length > 500) {
    throw new BadRequestError('Comment must not exceed 500 characters.');
  }
}

// ─── Core Service Functions ───────────────────────────────────────────────────

/**
 * Creates feedback from a customer for a barber.
 * Enforces: customer must have a completed appointment with this barber.
 * @param {Object} payload - { customerId, barberId, rating, comments }
 * @returns {Promise<Object>} Created feedback
 */
async function createFeedback({ customerId, barberId, rating, comments }) {
  // 1. Validate inputs
  if (!customerId || !barberId) {
    throw new BadRequestError('customerId and barberId are required.');
  }
  _validateFeedbackInput(rating, comments);

  // 2. Ensure customer and barber exist
  const [customer, barber] = await Promise.all([
    Customer.findById(customerId).select('_id').lean(),
    Barber.findById(barberId).select('_id').lean()
  ]);
  if (!customer) throw new NotFoundError('Customer not found.');
  if (!barber)   throw new NotFoundError('Barber not found.');

  // 3. Enforce: customer must have completed an appointment with this barber
  const completedAppointment = await Appointment.findOne({
    CID:    customerId,
    BID:    barberId,
    Status: 'completed'
  }).select('_id').lean();

  if (!completedAppointment) {
    throw new ForbiddenError(
      'You can only leave feedback after a completed appointment with this barber.'
    );
  }

  // 4. Prevent duplicate feedback per barber per customer
  const existing = await Feedback.findOne({
    CID: customerId,
    BID: barberId
  }).select('_id').lean();

  if (existing) {
    throw new ConflictError(
      'You have already left feedback for this barber. Use update instead.'
    );
  }

  // 5. Create feedback
  const feedback = await Feedback.create({
    CID:      customerId,
    BID:      barberId,
    Rating:   rating,
    Comments: comments.trim(),
    Fdate:    new Date(),
    Status:   FEEDBACK_STATUS.VISIBLE
  });

  return feedback.toObject();
}

/**
 * Updates a customer's existing feedback for a barber.
 * @param {string} feedbackId  - Feedback ObjectId
 * @param {string} customerId  - Must match feedback owner
 * @param {Object} payload     - { rating?, comments? }
 * @returns {Promise<Object>} Updated feedback
 */
async function updateFeedback(feedbackId, customerId, { rating, comments }) {
  // 1. Find the feedback
  const feedback = await Feedback.findById(feedbackId);
  if (!feedback) throw new NotFoundError('Feedback not found.');

  // 2. Ownership check: only the customer who wrote it can update
  if (feedback.CID.toString() !== customerId.toString()) {
    throw new ForbiddenError('You can only update your own feedback.');
  }

  // 3. Validate new values (only if provided)
  if (rating   !== undefined) _validateFeedbackInput(rating, comments || feedback.Comments);
  if (comments !== undefined) _validateFeedbackInput(feedback.Rating, comments);

  // 4. Apply updates
  if (rating   !== undefined) feedback.Rating   = rating;
  if (comments !== undefined) feedback.Comments = comments.trim();

  await feedback.save();
  return feedback.toObject();
}

/**
 * Deletes a customer's feedback.
 * Customers can delete their own; admins can delete any.
 * @param {string} feedbackId - Feedback ObjectId
 * @param {string} requesterId - User performing deletion
 * @param {string} requesterRole - 'customer' or 'admin'
 * @returns {Promise<void>}
 */
async function deleteFeedback(feedbackId, requesterId, requesterRole) {
  const feedback = await Feedback.findById(feedbackId);
  if (!feedback) throw new NotFoundError('Feedback not found.');

  // Only owner or admin can delete
  const isOwner = feedback.CID.toString() === requesterId.toString();
  const isAdmin = requesterRole === 'admin';

  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('You do not have permission to delete this feedback.');
  }

  await Feedback.findByIdAndDelete(feedbackId);
}

/**
 * Admin toggles feedback visibility (hide/show/flag).
 * @param {string} feedbackId - Feedback ObjectId
 * @param {string} status     - One of FEEDBACK_STATUS values
 * @returns {Promise<Object>} Updated feedback
 */
async function moderateFeedback(feedbackId, status) {
  if (!Object.values(FEEDBACK_STATUS).includes(status)) {
    throw new BadRequestError(
      `Invalid status. Use: ${Object.values(FEEDBACK_STATUS).join(', ')}.`
    );
  }

  const feedback = await Feedback.findByIdAndUpdate(
    feedbackId,
    { $set: { Status: status } },
    { new: true }
  ).lean();

  if (!feedback) throw new NotFoundError('Feedback not found.');
  return feedback;
}

/**
 * Gets all visible feedback for a specific barber.
 * @param {string} barberId
 * @param {Object} options - { page, limit }
 * @returns {Promise<Object>} Paginated feedback with average rating
 */
async function getFeedbackByBarber(barberId, { page = 1, limit = 10 } = {}) {
  const barber = await Barber.findById(barberId).select('_id').lean();
  if (!barber) throw new NotFoundError('Barber not found.');

  const result = await findAll({
    model:    Feedback,
    filter:   { BID: barberId, Status: FEEDBACK_STATUS.VISIBLE },
    page,
    limit,
    sort:     '-Fdate',  // newest first
    unselect: ['__v', 'Status'],
    populate: [
      { path: 'CID', select: 'Fname Lname' }
    ]
  });

  // Compute average rating for this barber
  const ratingStats = await Feedback.aggregate([
    {
      $match: {
        BID:    barberId,
        Status: FEEDBACK_STATUS.VISIBLE
      }
    },
    {
      $group: {
        _id:           '$BID',
        averageRating: { $avg: '$Rating' },
        totalReviews:  { $sum: 1 }
      }
    }
  ]);

  const stats = ratingStats[0] || { averageRating: 0, totalReviews: 0 };

  return {
    ...result,
    averageRating: parseFloat(stats.averageRating.toFixed(1)),
    totalReviews:  stats.totalReviews
  };
}

/**
 * Gets all feedback written by a specific customer.
 * @param {string} customerId
 * @param {Object} options - { page, limit }
 * @returns {Promise<Object>}
 */
async function getFeedbackByCustomer(customerId, { page = 1, limit = 10 } = {}) {
  return await findAll({
    model:    Feedback,
    filter:   { CID: customerId },
    page,
    limit,
    sort:     '-Fdate',
    unselect: ['__v'],
    populate: [
      { path: 'BID', select: 'Fname Lname' }
    ]
  });
}

/**
 * Gets a single feedback by ID.
 * @param {string} feedbackId
 * @returns {Promise<Object>}
 */
async function getFeedbackById(feedbackId) {
  const feedback = await findOne({
    model:    Feedback,
    filter:   { _id: feedbackId },
    unselect: ['__v'],
    populate: [
      { path: 'CID', select: 'Fname Lname' },
      { path: 'BID', select: 'Fname Lname' }
    ]
  });

  if (!feedback) throw new NotFoundError('Feedback not found.');
  return feedback;
}

/**
 * Gets all flagged feedback (admin review queue).
 * @param {Object} options - { page, limit }
 * @returns {Promise<Object>}
 */
async function getFlaggedFeedback({ page = 1, limit = 20 } = {}) {
  return await findAll({
    model:    Feedback,
    filter:   { Status: FEEDBACK_STATUS.FLAGGED },
    page,
    limit,
    sort:     '-Fdate',
    populate: [
      { path: 'CID', select: 'Fname Lname' },
      { path: 'BID', select: 'Fname Lname' }
    ]
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  FEEDBACK_STATUS,
  RATING_MIN,
  RATING_MAX,
  createFeedback,
  updateFeedback,
  deleteFeedback,
  moderateFeedback,
  getFeedbackByBarber,
  getFeedbackByCustomer,
  getFeedbackById,
  getFlaggedFeedback
};
