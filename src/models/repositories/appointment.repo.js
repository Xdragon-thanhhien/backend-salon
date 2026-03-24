// repositories/appointment.repo.js
'use strict';

const Appointment = require('../models/appointment.model');
const {
  findAll,
  findOne,
  selectData,
  unSelectData
} = require('../helpers');

// ─── Write Operations ─────────────────────────────────────────────────────────

/**
 * Creates a new appointment document.
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
const createAppointment = async (payload) => {
  return await Appointment.create(payload);
};

/**
 * Updates an appointment by ID.
 * @param {string} appointmentId
 * @param {Object} payload - Fields to update
 * @returns {Promise<Object|null>}
 */
const updateAppointmentById = async (appointmentId, payload) => {
  return await Appointment.findByIdAndUpdate(
    appointmentId,
    { $set: payload },
    { new: true }   // return updated document
  ).lean();
};

/**
 * Soft-cancels an appointment (status only, no delete).
 * @param {string} appointmentId
 * @param {string} reason
 * @returns {Promise<Object|null>}
 */
const cancelAppointmentById = async (appointmentId, reason = '') => {
  return await Appointment.findByIdAndUpdate(
    appointmentId,
    {
      $set: {
        Status:       'cancelled',
        CancelReason: reason,
        CancelledAt:  new Date()
      }
    },
    { new: true }
  ).lean();
};

// ─── Read Operations ──────────────────────────────────────────────────────────

/**
 * Finds a single appointment by ID with full populate.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
const findAppointmentById = async (id) => {
  return await findOne({
    model:    Appointment,
    filter:   { _id: id },
    populate: [
      { path: 'CID',      select: 'Fname Lname PhoneNo' },
      { path: 'BID',      select: 'Fname Lname PhoneNo' },
      { path: 'Services', select: 'Sname Duration Price' }
    ]
  });
};

/**
 * Finds all appointments for a customer (paginated).
 * @param {string} customerId
 * @param {Object} options - { page, limit }
 * @returns {Promise<Object>}
 */
const findAppointmentsByCustomer = async (customerId, { page = 1, limit = 10 } = {}) => {
  return await findAll({
    model:    Appointment,
    filter:   { CID: customerId },
    page,
    limit,
    sort:     '-AppDate',
    unselect: ['__v', 'CancelReason'],
    populate: [
      { path: 'BID',      select: 'Fname Lname' },
      { path: 'Services', select: 'Sname Price Duration' }
    ]
  });
};

/**
 * Finds all appointments for a barber, optionally filtered by date and status.
 * @param {string} barberId
 * @param {Object} options - { date, status, page, limit }
 * @returns {Promise<Object>}
 */
const findAppointmentsByBarber = async (barberId, {
  date,
  status,
  page  = 1,
  limit = 20
} = {}) => {
  const filter = { BID: barberId };

  if (date) {
    const dayStart = new Date(date);
    const dayEnd   = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);
    filter.AppDate = { $gte: dayStart, $lt: dayEnd };
  }

  if (status) {
    filter.Status = status;
  }

  return await findAll({
    model:    Appointment,
    filter,
    page,
    limit,
    sort:     'AppDate',  // ascending: earliest first for schedule view
    populate: [
      { path: 'CID',      select: 'Fname Lname PhoneNo' },
      { path: 'Services', select: 'Sname Duration Price' }
    ]
  });
};

/**
 * Checks for conflicting appointments for a barber in a given time range.
 * @param {string} barberId
 * @param {Date}   startTime
 * @param {Date}   endTime
 * @param {string} excludeId - Appointment ID to exclude (for update checks)
 * @returns {Promise<boolean>} True if conflict exists
 */
const hasConflict = async (barberId, startTime, endTime, excludeId = null) => {
  const query = {
    BID:    barberId,
    Status: 'scheduled',
    $or: [
      { AppDate: { $lt: endTime, $gte: startTime } },
      { EndTime: { $gt: startTime, $lte: endTime } },
      {
        $and: [
          { AppDate: { $lte: startTime } },
          { EndTime: { $gte: endTime } }
        ]
      }
    ]
  };

  if (excludeId) query._id = { $ne: excludeId };

  const conflict = await Appointment.findOne(query).select('_id').lean();
  return !!conflict;
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  createAppointment,
  updateAppointmentById,
  cancelAppointmentById,
  findAppointmentById,
  findAppointmentsByCustomer,
  findAppointmentsByBarber,
  hasConflict
};
