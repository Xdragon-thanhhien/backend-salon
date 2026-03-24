// services/schedule.service.js
'use strict';

const Schedule = require('../models/schedule.model');
const Barber   = require('../models/baber.model');
const {
  findAll,
  findOne,
  isValidPhone
} = require('../helpers');
const {
  BadRequestError,
  NotFoundError,
  ConflictError
} = require('../core/response/error.response');

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = Object.freeze([
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
]);

const SCHEDULE_STATUS = Object.freeze({
  ACTIVE:   'active',
  INACTIVE: 'inactive'
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses a time string (HH:MM) into total minutes since midnight.
 * Used to compare start/end time validity.
 * @param {string} time - e.g. '09:00'
 * @returns {number} total minutes
 */
function _timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Validates schedule time range and day inputs.
 * @param {string}   STime      - Start time 'HH:MM'
 * @param {string}   ETime      - End time 'HH:MM'
 * @param {string[]} DaysOfWeek - Array of day strings
 */
function _validateScheduleInput(STime, ETime, DaysOfWeek) {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!STime || !ETime) {
    throw new BadRequestError('Start time (STime) and end time (ETime) are required.');
  }
  if (!timeRegex.test(STime) || !timeRegex.test(ETime)) {
    throw new BadRequestError('Times must be in HH:MM format (e.g., 09:00).');
  }
  if (_timeToMinutes(STime) >= _timeToMinutes(ETime)) {
    throw new BadRequestError('Start time must be before end time.');
  }
  if (!Array.isArray(DaysOfWeek) || DaysOfWeek.length === 0) {
    throw new BadRequestError('At least one day of the week is required.');
  }

  const invalidDays = DaysOfWeek.filter(d => !DAYS_OF_WEEK.includes(d));
  if (invalidDays.length > 0) {
    throw new BadRequestError(`Invalid days: ${invalidDays.join(', ')}. Use: ${DAYS_OF_WEEK.join(', ')}.`);
  }
}

/**
 * Checks for overlapping schedules for the same barber on the same days.
 * @param {string}   barberId    - Barber ObjectId
 * @param {string}   STime       - New start time
 * @param {string}   ETime       - New end time
 * @param {string[]} DaysOfWeek  - Days to check
 * @param {string}   excludeId   - Schedule ID to exclude (for updates)
 * @returns {Promise<boolean>}
 */
async function _hasOverlap(barberId, STime, ETime, DaysOfWeek, excludeId = null) {
  const newStart = _timeToMinutes(STime);
  const newEnd   = _timeToMinutes(ETime);

  const query = {
    BID:         barberId,
    IsAvailable: true,
    DaysOfWeek:  { $in: DaysOfWeek }
  };

  if (excludeId) query._id = { $ne: excludeId };

  const existingSchedules = await Schedule.find(query).select('STime ETime').lean();

  return existingSchedules.some(s => {
    const existStart = _timeToMinutes(s.STime);
    const existEnd   = _timeToMinutes(s.ETime);

    // Overlap condition: new range intersects existing range
    return newStart < existEnd && newEnd > existStart;
  });
}

// ─── Core Service Functions ───────────────────────────────────────────────────

/**
 * Creates a new schedule shift for a barber.
 * @param {Object} payload - { barberId, STime, ETime, DaysOfWeek }
 * @returns {Promise<Object>} Created schedule
 */
async function createSchedule({ barberId, STime, ETime, DaysOfWeek }) {
  // 1. Validate inputs
  if (!barberId) throw new BadRequestError('barberId is required.');
  _validateScheduleInput(STime, ETime, DaysOfWeek);

  // 2. Ensure barber exists
  const barber = await Barber.findById(barberId).select('_id Fname Lname').lean();
  if (!barber) throw new NotFoundError('Barber not found.');

  // 3. Check for overlapping shifts
  const overlap = await _hasOverlap(barberId, STime, ETime, DaysOfWeek);
  if (overlap) {
    throw new ConflictError('This schedule overlaps with an existing shift for this barber.');
  }

  // 4. Create schedule
  const schedule = await Schedule.create({
    BID:         barberId,
    STime,
    ETime,
    DaysOfWeek,
    IsAvailable: true
  });

  return schedule.toObject();
}

/**
 * Updates an existing schedule shift.
 * @param {string} scheduleId - Schedule ObjectId
 * @param {Object} payload    - { STime?, ETime?, DaysOfWeek?, IsAvailable? }
 * @returns {Promise<Object>} Updated schedule
 */
async function updateSchedule(scheduleId, { STime, ETime, DaysOfWeek, IsAvailable }) {
  // 1. Find existing
  const schedule = await Schedule.findById(scheduleId);
  if (!schedule) throw new NotFoundError('Schedule not found.');

  // 2. Merge with existing values
  const updatedSTime      = STime      || schedule.STime;
  const updatedETime      = ETime      || schedule.ETime;
  const updatedDaysOfWeek = DaysOfWeek || schedule.DaysOfWeek;

  // 3. Validate if time or days changed
  if (STime || ETime || DaysOfWeek) {
    _validateScheduleInput(updatedSTime, updatedETime, updatedDaysOfWeek);

    const overlap = await _hasOverlap(
      schedule.BID,
      updatedSTime,
      updatedETime,
      updatedDaysOfWeek,
      scheduleId  // exclude self
    );
    if (overlap) {
      throw new ConflictError('Updated schedule overlaps with an existing shift.');
    }
  }

  // 4. Apply updates
  schedule.STime      = updatedSTime;
  schedule.ETime      = updatedETime;
  schedule.DaysOfWeek = updatedDaysOfWeek;

  if (typeof IsAvailable === 'boolean') {
    schedule.IsAvailable = IsAvailable;
  }

  await schedule.save();
  return schedule.toObject();
}

/**
 * Toggles a schedule shift availability (active/inactive).
 * @param {string}  scheduleId   - Schedule ObjectId
 * @param {boolean} isAvailable  - New availability flag
 * @returns {Promise<Object>}
 */
async function toggleScheduleAvailability(scheduleId, isAvailable) {
  if (typeof isAvailable !== 'boolean') {
    throw new BadRequestError('isAvailable must be a boolean (true or false).');
  }

  const schedule = await Schedule.findByIdAndUpdate(
    scheduleId,
    { $set: { IsAvailable: isAvailable } },
    { new: true }
  ).lean();

  if (!schedule) throw new NotFoundError('Schedule not found.');
  return schedule;
}

/**
 * Deletes a schedule shift permanently.
 * @param {string} scheduleId
 * @returns {Promise<void>}
 */
async function deleteSchedule(scheduleId) {
  const deleted = await Schedule.findByIdAndDelete(scheduleId);
  if (!deleted) throw new NotFoundError('Schedule not found.');
}

/**
 * Gets all schedules for a specific barber.
 * @param {string} barberId
 * @param {Object} options - { page, limit, onlyActive? }
 * @returns {Promise<Object>} Paginated result
 */
async function getSchedulesByBarber(barberId, {
  page       = 1,
  limit      = 20,
  onlyActive = false
} = {}) {
  const filter = { BID: barberId };
  if (onlyActive) filter.IsAvailable = true;

  return await findAll({
    model:    Schedule,
    filter,
    page,
    limit,
    sort:     'STime',  // earliest shift first
    unselect: ['__v'],
    populate: [{ path: 'BID', select: 'Fname Lname PhoneNo' }]
  });
}

/**
 * Gets a single schedule by ID.
 * @param {string} scheduleId
 * @returns {Promise<Object>}
 */
async function getScheduleById(scheduleId) {
  const schedule = await findOne({
    model:    Schedule,
    filter:   { _id: scheduleId },
    unselect: ['__v'],
    populate: [{ path: 'BID', select: 'Fname Lname PhoneNo' }]
  });

  if (!schedule) throw new NotFoundError('Schedule not found.');
  return schedule;
}

/**
 * Gets available barbers for a given day and time range.
 * Useful when customer wants to pick a barber slot.
 * @param {string} day   - Day of week e.g. 'Monday'
 * @param {string} STime - Desired start time e.g. '10:00'
 * @param {string} ETime - Desired end time e.g. '11:00'
 * @returns {Promise<Object[]>} List of available barber schedules
 */
async function getAvailableBarbers(day, STime, ETime) {
  if (!DAYS_OF_WEEK.includes(day)) {
    throw new BadRequestError(`Invalid day. Use one of: ${DAYS_OF_WEEK.join(', ')}.`);
  }

  _validateScheduleInput(STime, ETime, [day]);

  const desiredStart = _timeToMinutes(STime);
  const desiredEnd   = _timeToMinutes(ETime);

  const schedules = await Schedule.find({
    DaysOfWeek:  day,
    IsAvailable: true
  })
    .populate('BID', 'Fname Lname PhoneNo YearsEx')
    .lean();

  // Filter schedules that fully cover the desired time range
  return schedules.filter(s => {
    const shiftStart = _timeToMinutes(s.STime);
    const shiftEnd   = _timeToMinutes(s.ETime);
    return shiftStart <= desiredStart && shiftEnd >= desiredEnd;
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  DAYS_OF_WEEK,
  SCHEDULE_STATUS,
  createSchedule,
  updateSchedule,
  toggleScheduleAvailability,
  deleteSchedule,
  getSchedulesByBarber,
  getScheduleById,
  getAvailableBarbers
};
