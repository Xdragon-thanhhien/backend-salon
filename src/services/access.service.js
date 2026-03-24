'use strict';

const User = require('../models/customer.models.js'); // or User.models.js

class AccessService {
  static async signUp({ email, password }) {
    // Basic signup - extend as needed
    const user = await User.create({
      email,
      password // hash in model or middleware
    });
    return user;
  }
}

module.exports = AccessService;

