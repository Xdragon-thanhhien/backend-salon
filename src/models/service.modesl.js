'use strict';
const mongoose = require('mongoose'); // Erase if already required
const { Schema, model, Types } = mongoose;

const DOCUMENT_NAME = 'Service';
const COLLECTION_NAME = 'services';
// Declare the Schema of the Mongo model
var serviceSchema = new mongoose.Schema(
{
    sId: {
        type: Number,
        primaryKey: true,
        autoIncrement: true,
    },
    sname: {
        type: String,
        required: true,
        unique: true,
    },
    description: {
        type: String,
    },
    duration: {
        type: Number,
    },
    price: {
        type: mongoose.Decimal128,
    },
},
{
    timestamps: true,
}
);

//Export the model
module.exports = mongoose.model(DOCUMENT_NAME, serviceSchema, COLLECTION_NAME);