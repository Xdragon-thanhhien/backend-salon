'use strict';
const mongoose = require('mongoose'); // Erase if already required
const { Schema, model, Types } = mongoose;

const DOCUMENT_NAME = 'User';
const COLLECTION_NAME = 'users';
// Declare the Schema of the Mongo model
var customerSchema = new mongoose.Schema(
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
}
);

//Export the model
module.exports = mongoose.model('User', customerSchema);