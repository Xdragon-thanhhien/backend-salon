'use strict';
const mongoose = require('mongoose'); // Erase if already required
const { Schema, model, Types } = mongoose;

const DOCUMENT_NAME = 'Invoice';
const COLLECTION_NAME = 'invoices';

// Declare the Schema of the Mongo model
var invoiceSchema = new mongoose.Schema({
    InvID: {
        type: Number,
        primaryKey: true,
        autoIncrement: true
    },
    FinalAmount: {
        type: mongoose.Decimal128,
        required: true
    },
    Date: {
        type: Date,
        default: Date.now
    },
    Disc: {
        type: mongoose.Decimal128,
        default: 0
    },
    VAT: {
        type: mongoose.Decimal128,
        default: 0
    },
    AppID: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true,
        unique: true
    }
});

//Export the model
module.exports = mongoose.model(DOCUMENT_NAME, invoiceSchema, COLLECTION_NAME);