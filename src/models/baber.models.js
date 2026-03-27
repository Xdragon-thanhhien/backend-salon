'use strict';

const mongoose = require('mongoose');

const DOCUMENT_NAME = 'Barber';
const COLLECTION_NAME = 'barbers';

const barberSchema = new mongoose.Schema(
  {
    BID: {
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
    PhoneNo: {
      type: String,
      required: true,
      unique: true
    },
    HireDate: {
      type: Date
    },
    YearsEx: {
      type: Number
    }
  },
  {
    collection: COLLECTION_NAME
  }
);

module.exports =
  mongoose.models[DOCUMENT_NAME] ||
  mongoose.model(DOCUMENT_NAME, barberSchema);
