'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  Fname: { type: String, required: true },
  Lname: { type: String, required: true },
  PhoneNo: { type: String, required: true },
  Address: String,
  Gender: String,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'customer', enum: ['customer', 'barber', 'admin'] }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
