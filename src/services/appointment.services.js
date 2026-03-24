// services/appointment.service.js
'use strict';

const Appointment = require('../models/appointment.model');
const Barber      = require('../models/baber.model');
const Customer    = require('../models/customer.model');
const Service     = require('../models/service.model');
const { findAll, findOne, selectData } = require('../helpers');
const Appointment = require('../models/appointment.model')
const appointmentRepo = require('../repositories/appointment.repo');
const inventoryRepo   = require('../repositories/inventory.repo');
const {
  BadRequestError,
  NotFoundError,
  ConflictError
} = require('../core/response/error.response');

const {
  isPastDate,
  calculateEndTime
} = require('../helpers/date.helper');

/**
 * Valid appointment statuses for the barbershop.
 */
const APPOINTMENT_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW:   'no_show'
});

/**
 * Basic validation and existence checks shared across create/update.
 */
async function validateAppointmentInputs({ customerId, barberId, serviceIds, startTime }) {
  if (!customerId || !barberId || !Array.isArray(serviceIds) || serviceIds.length === 0 || !startTime) {
    throw new BadRequestError('customerId, barberId, serviceIds, and startTime are required.');
  }

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    throw new BadRequestError('startTime is not a valid date.');
  }

  if (isPastDate(start)) {
    throw new BadRequestError('Cannot book an appointment in the past.');
  }

  // Ensure customer exists
  const customer = await Customer.findById(customerId).select('_id');
  if (!customer) {
    throw new NotFoundError('Customer not found.');
  }

  // Ensure barber exists
  const barber = await Barber.findById(barberId).select('_id');
  if (!barber) {
    throw new NotFoundError('Barber not found.');
  }

  // Ensure all services exist and compute total duration
  const services = await Service.find({ _id: { $in: serviceIds } }).select('_id Duration');
  if (services.length !== serviceIds.length) {
    throw new BadRequestError('One or more services are invalid.');
  }

  const totalDuration = services.reduce((sum, s) => sum + (s.Duration || 0), 0);
  const endTime = calculateEndTime(start, totalDuration);

  return { start, endTime, totalDuration };
}

/**
 * Checks for overlapping appointments for a given barber in the given time range.
 */
async function hasTimeConflict({ barberId, startTime, endTime, excludeAppointmentId = null }) {
  const query = {
    BID: barberId,
    Status: { $in: [APPOINTMENT_STATUS.SCHEDULED] },
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

  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  const conflict = await Appointment.findOne(query).select('_id');
  return !!conflict;
}

/**
 * Creates a new appointment with conflict detection.
 */
async function createAppointment({ customerId, barberId, serviceIds, startTime, notes }) {
  const { start, endTime, totalDuration } = await validateAppointmentInputs({
    customerId,
    barberId,
    serviceIds,
    startTime
  });

  const conflict = await hasTimeConflict({
    barberId,
    startTime: start,
    endTime
  });

  if (conflict) {
    throw new ConflictError('The selected time slot is already booked for this barber.');
  }

  const appointment = await Appointment.create({
    CID: customerId,
    BID: barberId,
    Services: serviceIds,   // or use Includes table if you normalize
    AppDate: start,
    EndTime: endTime,
    Duration: totalDuration,
    Status: APPOINTMENT_STATUS.SCHEDULED,
    Notes: notes || ''
  });

  return appointment.toObject();
}

/**
 * Updates an existing appointment (time and/or services) with conflict detection.
 */
async function updateAppointment(appointmentId, { serviceIds, startTime, notes, status }) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new NotFoundError('Appointment not found.');
  }

  // Only recompute time/duration if startTime or serviceIds changed
  let start = appointment.AppDate;
  let endTime = appointment.EndTime;
  let totalDuration = appointment.Duration;

  if (startTime || (Array.isArray(serviceIds) && serviceIds.length > 0)) {
    const data = await validateAppointmentInputs({
      customerId: appointment.CID,
      barberId: appointment.BID,
      serviceIds: serviceIds || appointment.Services,
      startTime: startTime || appointment.AppDate
    });

    start = data.start;
    endTime = data.endTime;
    totalDuration = data.totalDuration;

    const conflict = await hasTimeConflict({
      barberId: appointment.BID,
      startTime: start,
      endTime,
      excludeAppointmentId: appointment._id
    });

    if (conflict) {
      throw new ConflictError('The updated time slot is already booked for this barber.');
    }

    appointment.Services = serviceIds || appointment.Services;
  }

  if (startTime) appointment.AppDate = start;
  if (endTime)   appointment.EndTime = endTime;
  if (totalDuration != null) appointment.Duration = totalDuration;
  if (typeof notes === 'string') appointment.Notes = notes;
  if (status && APPOINTMENT_STATUS[status.toUpperCase()]) {
    appointment.Status = APPOINTMENT_STATUS[status.toUpperCase()];
  }

  await appointment.save();
  return appointment.toObject();
}

/**
 * Cancels an appointment.
 */
async function cancelAppointment(appointmentId, reason) {
  const appointment = await Appointment.findById(appointmentId);
  if (!appointment) {
    throw new NotFoundError('Appointment not found.');
  }

  if (appointment.Status === APPOINTMENT_STATUS.CANCELLED) {
    return appointment.toObject();
  }

  appointment.Status = APPOINTMENT_STATUS.CANCELLED;
  if (reason) {
    appointment.CancelReason = reason;
  }

  await appointment.save();
  return appointment.toObject();
}

/**
 * Gets appointments for a specific customer.
 */
async function getAppointmentsByCustomer(customerId) {
  const list = await Appointment.find({ CID: customerId })
    .sort({ AppDate: -1 })
    .populate('BID', 'Fname Lname')
    .populate('Services', 'Sname Duration Price')
    .lean();

  return list;
}

/**
 * Gets appointments for a specific barber, optionally filtered by date/status.
 */
async function getAppointmentsByBarber(barberId, { date, status } = {}) {
  const query = { BID: barberId };

  if (date) {
    const dayStart = new Date(date);
    const dayEnd   = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);

    query.AppDate = { $gte: dayStart, $lt: dayEnd };
  }

  if (status && APPOINTMENT_STATUS[status.toUpperCase()]) {
    query.Status = APPOINTMENT_STATUS[status.toUpperCase()];
  }

  const list = await Appointment.find(query)
    .sort({ AppDate: 1 })
    .populate('CID', 'Fname Lname PhoneNo')
    .populate('Services', 'Sname Duration Price')
    .lean();

  return list;
}

/**
 * Gets a single appointment by ID with full details.
 */
async function getAppointmentById(id) {
  const appointment = await Appointment.findById(id)
    .populate('CID', 'Fname Lname PhoneNo')
    .populate('BID', 'Fname Lname')
    .populate('Services', 'Sname Duration Price')
    .lean();

  if (!appointment) {
    throw new NotFoundError('Appointment not found.');
  }

  return appointment;
}

module.exports = {
  APPOINTMENT_STATUS,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  getAppointmentsByCustomer,
  getAppointmentsByBarber,
  getAppointmentById
};
