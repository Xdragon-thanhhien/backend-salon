// src/controllers/auth.controller.js
'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, USER_ROLES } = require('../models/User.models');
const {
  BadRequestError,
  ConflictError,
  AuthFailureError
} = require('../core/response/error.response');
const {
  OKResponse,
  CreatedResponse
} = require('../core/response/success.response');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// ─── Controller ──────────────────────────────────────────────────────────────

class AuthController {
  // POST /api/v1/auth/register
  register = async (req, res, next) => {
    const {
      Fname,
      Lname,
      PhoneNo,
      Address,
      Gender,
      email,
      password,
      role
    } = req.body;

    if (!Fname || !Lname || !PhoneNo || !email || !password) {
      throw new BadRequestError('Fname, Lname, PhoneNo, email, password are required.');
    }

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      throw new ConflictError('Email already in use.');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      Fname,
      Lname,
      PhoneNo,
      Address,
      Gender,
      email,
      password: hashedPassword,
      // chỉ cho phép set role cao nếu sau này bạn làm route riêng,
      // còn ở đây mặc định customer:
      role: USER_ROLES.CUSTOMER
    });

    const token = generateToken(newUser);

    new CreatedResponse({
      message: 'User registered successfully.',
      data: {
        user: {
          _id: newUser._id,
          Fname: newUser.Fname,
          Lname: newUser.Lname,
          PhoneNo: newUser.PhoneNo,
          email: newUser.email,
          role: newUser.role
        },
        token
      }
    }).send(res);
  };

  // POST /api/v1/auth/login
  login = async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new BadRequestError('Email and password are required.');
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw new AuthFailureError('Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AuthFailureError('Invalid email or password.');
    }

    const token = generateToken(user);

    new OKResponse({
      message: 'Login successful.',
      data: {
        user: {
          _id: user._id,
          Fname: user.Fname,
          Lname: user.Lname,
          PhoneNo: user.PhoneNo,
          email: user.email,
          role: user.role
        },
        token
      }
    }).send(res);
  };

  // GET /api/v1/auth/me
  getProfile = async (req, res, next) => {
    // req.user đã được set trong authenticate middleware
    new OKResponse({
      message: 'Profile fetched successfully.',
      data: {
        user: req.user
      }
    }).send(res);
  };
}

module.exports = new AuthController();
