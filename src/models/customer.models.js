'use strict';

const mongoose = require('mongoose');

const DOCUMENT_NAME = 'Customer';
const COLLECTION_NAME = 'customers';

const customerSchema = new mongoose.Schema(
  {
    CID: {
      type: Number,
      primaryKey: true,
      autoIncrement: true
    },
    Fname: {
      type: String,
      required: true
    },
    Lname: {
      type: String,
      required: true
    },
    Gender: {
      type: String,
      enum: ['M', 'F'],
      default: null
    },
    PhoneNo: {
      type: String,
      required: true,
      unique: true
    },
    Address: {
      type: String,
      default: null
    }
  },
  {
    collection: COLLECTION_NAME
  }
);

module.exports =
  mongoose.models[DOCUMENT_NAME] ||
  mongoose.model(DOCUMENT_NAME, customerSchema);
