'use strict';

const mongoose = require('mongoose'); // Erase if already required
const { Schema, model, Types } = mongoose;

const DOCUMENT_NAME = 'Appointment';
const COLLECTION_NAME = 'appointments';

// Declare the Schema of the Mongo model
var appointmentSchema = new mongoose.Schema({
    appID: {
        type: mongoose.Schema.Types.ObjectId,
        auto: true,
        primaryKey: true
    },
    appDate: {
        type: Date,
        required: true
    },
    notes: {
        type: String,
        required: false
    },
    status: {
        type: String,
        enum: ['Scheduled', 'Completed', 'Cancelled', 'No Show'],
        default: 'Scheduled'
    },
    bid: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Barber',
        required: true
    },
    cid: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

//Export the model
module.exports = mongoose.model(DOCUMENT_NAME, appointmentSchema, COLLECTION_NAME);