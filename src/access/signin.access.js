const bcrypt = require('bcryptjs');
const User   = require('../models/User'); // Adjust path to your User model

/**
 * Registers a new user.
 * @param {Object} userData - { firstName, lastName, email, password, confirmPassword, role? }
 * @returns {Promise<Object>} The created user (password omitted)
 * @throws {Error} With message indicating validation or server issue
 */
async function signUp(userData) {
  const { firstName, lastName, email, password, confirmPassword, role } = userData;

  // 1. Validate input
  if (!firstName || !lastName || !email || !password || !confirmPassword) {
    throw new Error('All fields are required.');
  }
  
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  
  if (password !== confirmPassword) {
    throw new Error('Passwords do not match.');
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Please provide a valid email address.');
  }

  // 2. Validate role (if provided)
  const validRoles = ['customer', 'barber', 'admin'];
  const userRole = role && validRoles.includes(role) ? role : 'customer';

  // 3. Check for existing email
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new Error('An account with this email already exists.');
  }

  // 4. Hash password and create user
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await User.create({
    firstName: firstName.trim(),
    lastName:  lastName.trim(),
    email:     email.toLowerCase().trim(),
    password:  hashedPassword,
    role:      userRole
  });

  // Return user without password
  const userObj = newUser.toObject();
  delete userObj.password;
  return userObj;
}

/**
 * Authenticates a user and returns session data.
 * @param {Object} credentials - { email, password }
 * @returns {Promise<Object>} User data for session (password omitted)
 * @throws {Error} With message indicating auth failure
 */
async function signIn(credentials) {
  const { email, password } = credentials;

  // 1. Validate input
  if (!email || !password) {
    throw new Error('Email and password are required.');
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Please provide a valid email address.');
  }

  // 2. Find user
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error('Invalid email or password.'); // Generic to prevent user enumeration
  }

  // 3. Verify password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Invalid email or password.');
  }

  // 4. Return session-safe user data (preserving actual role from DB)
  return {
    id:       user._id,
    email:    user.email,
    firstName:user.firstName,
    lastName: user.lastName,
    role:     user.role   // This preserves whatever role is stored in DB
  };
}

/**
 * Clears user session (typically called from route).
 * @returns {Object} Success indicator
 */
function signOut() {
  return { success: true, message: 'Session cleared' };
}

module.exports = {
  signUp,
  signIn,
  signOut
};