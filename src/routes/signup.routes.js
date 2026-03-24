// signup.routes.js
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const User    = require('../models/customer.models.js'); // Use existing customer model
const { body, validationResult } = require('express-validator'); // optional but recommended
// const asyncHandler  = require('../helpers/asyncHandler'); // thin async wrapper
const asyncHandler = require('../helper/asyncHandler'); // thin async wrapper
const accessService = require('../services/access.service');
const { CreatedResponse } = require('../core/response/success.response')
// GET /signup – show the sign‑up form
router.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('signup', { title: 'Sign Up', errors: null, old: {} });
});

// POST /signup – process the form
router.post(
  '/',
  [
    // Simple validation chain (you can extend as needed)
    body('email')
      .trim()
      .isEmail()
      .normalizeEmail()
      .withMessage('Please enter a valid email address'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('confirmPassword')
      .custom((value, { req }) => value === req.body.password)
      .withMessage('Passwords do not match')
  ],
  async (req, res) => {
    // Extract validated data
    const errors = validationResult(req);
    const { firstName, lastName, email, password } = req.body;

    if (!errors.isEmpty()) {
      // Re‑render the form with validation errors
      return res.render('signup', {
        title: 'Sign Up',
        errors: errors.array(),
        old: { firstName, lastName, email } // keep user input
      });
    }

    try {
      // Check if email already exists
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (existing) {
        return res.render('signup', {
          title: 'Sign Up',
          errors: [{ msg: 'An account with this email already exists.' }],
          old: { firstName, lastName, email }
        });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new user
      const newUser = await User.create({
        firstName,
        lastName,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: 'customer' // default role; adjust if you have barber/admin sign‑up elsewhere
      });

      // Log in the new user (set session)
      req.session.userId = newUser._id;
      req.session.user = {
        id:       newUser._id,
        email:    newUser.email,
        firstName:newUser.firstName,
        lastName: newUser.lastName,
        role:     newUser.role
      };

      // Redirect to appropriate dashboard
      res.redirect('/customer/dashboard');
    } catch (err) {
      console.error('Sign‑up error:', err);
      res.render('signup', {
        title: 'Sign Up',
        errors: [{ msg: 'Something went wrong. Please try again later.' }],
        old: { firstName, lastName, email }
      });
    }
  }
);
// ─── POST /api/v1/signup ──────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req, res) => {
  const newUser = await accessService.signUp(req.body);

  new CreatedResponse({
    message: 'Account created successfully.',
    data:    { user: newUser }
  }).send(res);
}));
module.exports = router;
