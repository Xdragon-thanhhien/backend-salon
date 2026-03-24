'use strict';
const mongoose = require('mongoose'); // Erase if already required
const { Schema, model, Types } = mongoose;

const DOCUMENT_NAME = 'Schedule';
const COLLECTION_NAME = 'schedules';
// Declare the Schema of the Mongo model
var scheduleSchema = new mongoose.Schema({
    SID: {
        type: mongoose.Schema.Types.ObjectId,
        auto: true,
        primaryKey: true
    },
    IsAvailable: {
        type: Boolean,
        default: true
    },
    STime: {
        type: String,
        required: true
    },
    ETime: {
        type: String,
        required: true
    },
    DaysOfWeek: {
        type: String,
        required: true
    },
    BID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Barber',
        required: true
    }
});

//Export the model
module.exports = mongoose.model(DOCUMENT_NAME, scheduleSchema, COLLECTION_NAME);