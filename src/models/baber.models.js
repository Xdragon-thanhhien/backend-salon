'use strict';

const mongoose = require('mongoose'); // Erase if already required
const { Schema, model, Types } = mongoose;

const DOCUMENT_NAME = 'User';
const COLLECTION_NAME = 'barbers';

// Declare the Schema of the Mongo model
var barberSchema = new mongoose.Schema(
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
    }
);

//Export the model
module.exports = mongoose.model('User', barberSchema);