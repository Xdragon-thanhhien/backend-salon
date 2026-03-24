'use strict';

const mongoose = require('mongoose'); // Erase if already required
const { Schema, model, Types } = mongoose;

const DOCUMENT_NAME = 'Feedback';
const COLLECTION_NAME = 'feedbacks';

// Declare the Schema of the Mongo model
var feedbackSchema = new mongoose.Schema({
    FID: {
        type: mongoose.Schema.Types.ObjectId,
        auto: true,
        primaryKey: true
    },
    Fdate: {
        type: Date,
        default: Date.now
    },
    Comments: {
        type: String
    },
    CID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer'
    },
    BID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Barber'
    }
});

//Export the model
module.exports = mongoose.model(DOCUMENT_NAME, feedbackSchema, COLLECTION_NAME);