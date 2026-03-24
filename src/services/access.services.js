// const bcrypt = require('bcryptjs');
// const User   = require('../models/User'); // Adjust path to your User model

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User'); // Adjust path to your User model
require('dotenv').config();


//throw new Error('An account with this email already exists.');
throw new Error('An account with this email already exists.');

// After (typed error):
const { ConflictError, AuthFailureError, BadRequestError } = require('../core/response/error.response');
throw new ConflictError('An account with this email already exists.');
throw new AuthFailureError('Invalid email or password.');
throw new BadRequestError('All fields are required.');
// Get keys from environment variables (in production, use secure key management)
const PRIVATE_KEY = process.env.JWT_PRIVATE_KEY;
const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY;
// Validate keys exist - in production, these should be properly configured
if (!PRIVATE_KEY || !PUBLIC_KEY) {
  console.warn('WARNING: JWT keys not found in environment variables.');
}
// JWT signing options
const JWT_OPTIONS = {
  algorithm: 'RS256',
  expiresIn: process.env.JWT_EXPIRES_IN || '7d', // 7 days default
  issuer: process.env.JWT_ISSUER || 'barbershop-app',
  audience: process.env.JWT_AUDIENCE || 'barbershop-users'
};
/**
 * Registers a new user.
 * @param {Object} userData - { firstName, lastName, email, password, confirmPassword }
 * @returns {Promise<Object>} The created user (password omitted)
 * @throws {Error} With message indicating validation or server issue
 */
// async function signUp(userData) {
//   const { firstName, lastName, email, password, confirmPassword } = userData;

//   // 1. Validate input
//   if (!firstName || !lastName || !email || !password || !confirmPassword) {
//     throw new Error('All fields are required.');
//   }
  
//   if (password.length < 6) {
//     throw new Error('Password must be at least 6 characters long.');
//   }
  
//   if (password !== confirmPassword) {
//     throw new Error('Passwords do not match.');
//   }
  
//   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//   if (!emailRegex.test(email)) {
//     throw new Error('Please provide a valid email address.');
//   }

//   // 2. Check for existing email
//   const existingUser = await User.findOne({ email: email.toLowerCase() });
//   if (existingUser) {
//     throw new Error('An account with this email already exists.');
//   }

//   // 3. Hash password and create user
//   const hashedPassword = await bcrypt.hash(password, 10);
//   const newUser = await User.create({
//     firstName: firstName.trim(),
//     lastName:  lastName.trim(),
//     email:     email.toLowerCase().trim(),
//     password:  hashedPassword,
//     role:      'customer' // Default role; adjust if needed
//   });

//   // Return user without password
//   const userObj = newUser.toObject();
//   delete userObj.password;
//   return userObj;
// }

// /**
//  * Authenticates a user and returns session data.
//  * @param {Object} credentials - { email, password }
//  * @returns {Promise<Object>} User data for session (password omitted)
//  * @throws {Error} With message indicating auth failure
//  */
// async function signIn(credentials) {
//   const { email, password } = credentials;

//   // 1. Validate input
//   if (!email || !password) {
//     throw new Error('Email and password are required.');
//   }
  
//   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//   if (!emailRegex.test(email)) {
//     throw new Error('Please provide a valid email address.');
//   }

//   // 2. Find user
//   const user = await User.findOne({ email: email.toLowerCase() });
//   if (!user) {
//     throw new Error('Invalid email or password.'); // Generic to prevent user enumeration
//   }

//   // 3. Verify password
//   const isMatch = await bcrypt.compare(password, user.password);
//   if (!isMatch) {
//     throw new Error('Invalid email or password.');
//   }

//   // 4. Return session-safe user data
//   return {
//     id:       user._id,
//     email:    user.email,
//     firstName:user.firstName,
//     lastName: user.lastName,
//     role:     user.role
//   };
// }

// /**
//  * Clears user session (typically called from route).
//  * @returns {Object} Success indicator
//  */
// function signOut() {
//   // In practice, session clearing happens in the route via req.session.destroy()
//   // This function exists for completeness and potential future expansion
//   return { success: true, message: 'Session cleared' };
// }

// module.exports = {
//   signUp,
//   signIn,
//   signOut
// };

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
 * Authenticates a user and returns user data with JWT token.
 * @param {Object} credentials - { email, password }
 * @returns {Promise<Object>} Object containing user data (password omitted) and token
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

  // 4. Prepare JWT payload
  const payload = {
    userId: user._id,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000), // issued at
    // You can add additional claims as needed
  };

  // 5. Sign token with private key
  let token;
  try {
    token = jwt.sign(payload, PRIVATE_KEY, JWT_OPTIONS);
  } catch (err) {
    throw new Error('Failed to generate authentication token');
  }

  // 6. Return session-safe user data and token
  return {
    user: {
      id:       user._id,
      email:    user.email,
      firstName:user.firstName,
      lastName: user.lastName,
      role:     user.role   // This preserves whatever role is stored in DB
    },
    token: token
  };
}

/**
 * Verifies a JWT token and returns the payload if valid.
 * @param {string} token - The JWT token to verify
 * @returns {Promise<Object>} The decoded token payload
 * @throws {Error} If token is invalid or expired
 */
async function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, PUBLIC_KEY, JWT_OPTIONS);
    return decoded;
  } catch (err) {
    // Handle specific JWT errors if needed
    if (err.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    }
    if (err.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw new Error('Token verification failed');
  }
}
/**
 * Clears user session (typically called from route - kept for compatibility).
 * @returns {Object} Success indicator
 */
function signOut() {
  // In JWT-based auth, signout is typically handled client-side by removing the token
  // Server-side invalidation would require a token blacklist (not implemented here for simplicity)
  return { success: true, message: 'Signout successful - remove token client-side' };
}

module.exports = {
  signUp,
  signIn,
  signOut,
  verifyToken
};