import mongoose from 'mongoose';
import dotenv from 'dotenv';
import seedDatabase from './seed.js';

dotenv.config();

const mongoose = require('mongoose');
const seedDatabase = require('../seed'); // from ../../seed.js

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/salon';
const MONGO_OPTIONS = {
    useNewUrlParser: true,
    useUnifiedTopology: true
};



const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log(`MongoDB connected: ${conn.connection.host}`);

        // Seed database if needed
        if (process.env.SEED_DB === 'true') {
            await seedDatabase();
            console.log('Database seeded successfully');
        }

        return conn;
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
};

const initMongo = async () => {
    try {
        await mongoose.connect(MONGO_URI, MONGO_OPTIONS);
        console.log('✓ MongoDB connected:', MONGO_URI);

        // optional seed run
        if (process.env.SEED_DB === 'true') {
            console.log('→ Running seedDatabase()');
            await seedDatabase();
        }

        return mongoose;
    } catch (err) {
        console.error('✗ MongoDB init failed:', err);
        process.exit(1);
    }
};

if (require.main === module) {
    initMongo()
      .then(() => {
        if (process.env.SEED_DB !== 'true') {
          console.log('Mongo init done (no seed)');
        }
      })
      .catch(() => process.exit(1));
}

export default initMongo;
