
const bcrypt = require('bcryptjs');
const User   = require('../models/User'); // Adjust path to your User model
const { ValidationError, DuplicateError } = require('../utils/customErrors'); // optional custom error classes

/**
 * Validates the sign‑up payload.
 * @param {Object} data - The raw request body.
 * @returns {Object} The sanitized data if valid.
 * @throws {ValidationError} If any validation rule fails.
 */
function validateSignupData(data) {
  const { firstName, lastName, email, password, confirmPassword } = data;

  // Basic presence checks
  if (!firstName || !lastName || !email || !password || !confirmPassword) {
    throw new ValidationError('All fields are required.');
  }

  // Email format (simple regex; you can replace with a lib like validator.js)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Please provide a valid email address.');
  }

  // Password strength
  if (password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters long.');
  }
  if (password !== confirmPassword) {
    throw new ValidationError('Passwords do not match.');
  }

  // Return sanitized data (trimmed, lower‑cased email)
  return {
    firstName: firstName.trim(),
    lastName:  lastName.trim(),
    email:     email.toLowerCase().trim(),
    password:  password.trim()
  };
}

/**
 * Checks whether an email already exists in the DB.
 * @param {string} email - The email to check.
 * @returns {Promise<boolean>} True if the email is taken.
 */
async function emailExists(email) {
  const existing = await User.findOne({ email });
  return !!existing;
}

/**
 * Hashes a plain‑text password using bcrypt.
 * @param {string} plainPassword - The raw password.
 * @returns {Promise<string>} The hashed password.
 */
async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
}

/**
 * Creates a new user record.
 * @param {Object} userData - { firstName, lastName, email, password (hashed), role }.
 * @returns {Promise<Object>} The created user document (without password).
 */
async function createUser(userData) {
  const user = await User.create(userData);
  // Omit password before returning (optional, depends on your User model's toJSON)
  const userObj = user.toObject();
  delete userObj.password;
  return userObj;
}

/**
 * High‑level sign‑up service orchestrates the steps.
 * @param {Object} rawData - The request body from the client.
 * @returns {Promise<Object>} The newly created user (password omitted).
 * @throws {ValidationError|DuplicateError|Error}
 */
async function signUpUser(rawData) {
  // 1️⃣ Validate input
  const cleanData = validateSignupData(rawData);

  // 2️⃣ Prevent duplicate email
  if (await emailExists(cleanData.email)) {
    throw new DuplicateError('An account with this email already exists.');
  }

  // 3️⃣ Hash password
  const hashedPassword = await hashPassword(cleanData.password);

  // 4️⃣ Persist user
  const userToSave = {
    ...cleanData,
    password: hashedPassword,
    role: 'customer' // default role; adjust if you have separate sign‑up for barbers/admins
  };

  const newUser = await createUser(userToSave);
  return newUser;
}

// Export the service functions for use in routes or controllers
module.exports = {
  signUpUser,
  validateSignupData,
  emailExists,
  hashPassword,
  createUser
};
