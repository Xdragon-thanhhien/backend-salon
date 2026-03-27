// src/models/user.model.js
'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ─── Roles ────────────────────────────────────────────────────────────────────

const USER_ROLES = Object.freeze({
  CUSTOMER: 'customer',
  BARBER:   'barber',
  ADMIN:    'admin',
  MANAGER:  'manager' // optional, dùng cho chủ/manager salon
});

// ─── Schema ───────────────────────────────────────────────────────────────────

const userSchema = new Schema(
  {
    Fname: {
      type: String,
      required: true,
      trim: true
    },

    Lname: {
      type: String,
      required: true,
      trim: true
    },

    PhoneNo: {
      type: String,
      required: true,
      trim: true
    },

    Address: {
      type: String,
      trim: true
    },

    Gender: {
      type: String,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: true,
      select: false // không trả về mặc định
    },

    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.CUSTOMER,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'Users'
  }
);

// Index hỗ trợ search nhanh theo tên + phone
userSchema.index({ Fname: 1, Lname: 1, PhoneNo: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = {
  User,
  USER_ROLES
};

// 'use strict';

// const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//   Fname: { type: String, required: true },
//   Lname: { type: String, required: true },
//   PhoneNo: { type: String, required: true },
//   Address: String,
//   Gender: String,
//   email: { type: String, required: true, unique: true },
//   password: { type: String, required: true },
//   role: { type: String, default: 'customer', enum: ['customer', 'barber', 'admin'] }
// }, { timestamps: true });

// module.exports = mongoose.model('User', userSchema);
