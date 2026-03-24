// services/barber.service.js
'use strict';

const Barber     = require('../models/baber.model');
const Payment    = require('../models/payment.model');   // assumes payments store barber ref
const Invoice    = require('../models/invoice.model');   // optional, if you use invoices
const {
  NotFoundError,
  BadRequestError
} = require('../core/response/error.response');
const {
  isValidEmail,
  isValidPhone
} = require('../helpers/validation.helper');
const {
  normalizeEmail
} = require('../helpers/string.helper');
const {
  findOne
} = require('../helpers');

// ─── Existing find helpers (you already had these) ────────────────────────────

async function _findBarber(query, label) {
  const barber = await Barber.findOne(query).select('-password').lean();
  if (!barber) {
    throw new NotFoundError(`Barber not found with provided ${label}.`);
  }
  return barber;
}

async function findBarberByEmail(email) {
  if (!email) throw new BadRequestError('Email is required.');
  if (!isValidEmail(email)) {
    throw new BadRequestError('Please provide a valid email address.');
  }

  return await _findBarber(
    { email: normalizeEmail(email) },
    'email'
  );
}

async function findBarberByPhone(phoneNo) {
  if (!phoneNo) throw new BadRequestError('Phone number is required.');
  if (!isValidPhone(phoneNo)) {
    throw new BadRequestError('Please provide a valid phone number.');
  }

  return await _findBarber(
    { phoneNo: phoneNo.trim() },
    'phone number'
  );
}

async function findBarber({ email, phoneNo }) {
  if (!email && !phoneNo) {
    throw new BadRequestError('Provide at least an email or phone number.');
  }
  if (email) return await findBarberByEmail(email);
  return await findBarberByPhone(phoneNo);
}

// ─── Profile: bio, skills, photo, specialties ────────────────────────────────

/**
 * Gets the logged-in barber's profile (safe fields).
 * @param {string} barberId
 */
async function getBarberProfile(barberId) {
  const barber = await findOne({
    model:  Barber,
    filter: { _id: barberId },
    select: [
      'Fname',
      'Lname',
      'email',
      'phoneNo',
      'YearsEx',
      'bio',
      'skills',
      'specialties',
      'photo',
      'createdAt'
    ]
  });

  if (!barber) throw new NotFoundError('Barber not found.');
  return barber;
}

/**
 * Updates barber profile fields.
 * @param {string} barberId
 * @param {Object} payload - { Fname?, Lname?, phoneNo?, bio?, skills?, specialties? }
 */
async function updateBarberProfile(
  barberId,
  { Fname, Lname, phoneNo, bio, skills, specialties }
) {
  const updates = {};

  if (Fname) updates.Fname = Fname.trim();
  if (Lname) updates.Lname = Lname.trim();

  if (phoneNo) {
    if (!isValidPhone(phoneNo)) {
      throw new BadRequestError('Please provide a valid phone number.');
    }
    updates.phoneNo = phoneNo.trim();
  }

  if (bio !== undefined) {
    if (bio.length > 500) {
      throw new BadRequestError('Bio must not exceed 500 characters.');
    }
    updates.bio = bio;
  }

  if (skills !== undefined) {
    // expect array of strings
    if (!Array.isArray(skills)) {
      throw new BadRequestError('skills must be an array of strings.');
    }
    updates.skills = skills.map(s => String(s).trim()).filter(Boolean);
  }

  if (specialties !== undefined) {
    if (!Array.isArray(specialties)) {
      throw new BadRequestError('specialties must be an array of strings.');
    }
    updates.specialties = specialties.map(s => String(s).trim()).filter(Boolean);
  }

  const barber = await Barber.findByIdAndUpdate(
    barberId,
    { $set: updates },
    { new: true }
  ).select('-password -__v').lean();

  if (!barber) throw new NotFoundError('Barber not found.');

  return barber;
}

/**
 * Updates barber photo URL after upload (similar to customer avatar).
 * @param {string} barberId
 * @param {string} photoUrl
 */
async function updateBarberPhoto(barberId, photoUrl) {
  if (!photoUrl) throw new BadRequestError('Photo URL is required.');

  const barber = await Barber.findByIdAndUpdate(
    barberId,
    { $set: { photo: photoUrl } },
    { new: true }
  ).select('Fname Lname photo').lean();

  if (!barber) throw new NotFoundError('Barber not found.');
  return barber;
}

// ─── Earnings summary (Payment / Invoice) ─────────────────────────────────────

/**
 * Calculates earnings summary for a barber between fromDate and toDate.
 * Uses Payment collection (and optionally Invoice) grouped by day.
 *
 * @param {string} barberId
 * @param {Date}   fromDate
 * @param {Date}   toDate
 * @returns {Promise<{totalAmount:number,totalCount:number,byDay:Array}>}
 */
async function getEarningsInRange(barberId, fromDate, toDate) {
  const pipeline = [
    {
      $match: {
        BID:    barberId,              // assumes Payment has BID field for barber
        Status: 'success',
        Date:   { $gte: fromDate, $lt: toDate }
      }
    },
    {
      $group: {
        _id: {
          year:  { $year: '$Date' },
          month: { $month: '$Date' },
          day:   { $dayOfMonth: '$Date' }
        },
        dailyAmount: { $sum: '$Amount' },
        dailyCount:  { $sum: 1 }
      }
    },
    {
      $project: {
        _id:          0,
        date: {
          $dateFromParts: {
            year:  '$_id.year',
            month: '$_id.month',
            day:   '$_id.day'
          }
        },
        dailyAmount: 1,
        dailyCount:  1
      }
    },
    { $sort: { date: 1 } }
  ];

  const byDay = await Payment.aggregate(pipeline);

  const totalAmount = byDay.reduce((sum, d) => sum + d.dailyAmount, 0);
  const totalCount  = byDay.reduce((sum, d) => sum + d.dailyCount, 0);

  return { totalAmount, totalCount, byDay };
}

/**
 * Helper to get date range for "day", "week", "month".
 */
function _getRange(type) {
  const now   = new Date();
  const start = new Date(now);

  switch (type) {
    case 'day':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week': {
      const day = start.getDay();        // 0 (Sun) - 6 (Sat)
      const diff = (day === 0 ? -6 : 1) - day; // set to Monday
      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      throw new BadRequestError('Invalid range type. Use "day", "week", or "month".');
  }

  return { from: start, to: now };
}

/**
 * Earnings summary: day/week/month for current barber.
 * @param {string} barberId
 * @param {string} rangeType - 'day' | 'week' | 'month'
 */
async function getEarningsSummary(barberId, rangeType) {
  const { from, to } = _getRange(rangeType);
  return await getEarningsInRange(barberId, from, to);
}

module.exports = {
  // existing
  findBarberByEmail,
  findBarberByPhone,
  findBarber,
  // new
  getBarberProfile,
  updateBarberProfile,
  updateBarberPhoto,
  getEarningsSummary
};
