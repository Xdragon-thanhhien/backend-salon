'use strict';
const mongoose = require('mongoose'); // Erase if already required
const { Schema, model, Types } = mongoose;

const DOCUMENT_NAME = 'User';
const COLLECTION_NAME = 'payments';

// Declare the Schema of the Mongo model
var paymentSchema = new mongoose.Schema({
    pid: {
        type: mongoose.Schema.Types.ObjectId,
        auto: true,
        primaryKey: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    method: {
        type: String,
        enum: ['Cash', 'Card', 'Mobile Pay'],
        required: true
    },
    amount: {
        type: mongoose.Decimal128,
        required: true
    },
    appID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true
    },
    cid: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    }
});

//Export the model
module.exports = mongoose.model(DOCUMENT_NAME, paymentSchema, COLLECTION_NAME);