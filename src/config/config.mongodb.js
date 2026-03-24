require('dotenv').config();

const mongodbConfig = {
    development: {
        url: process.env.MONGODB_DEV_URL || 'mongodb://localhost:27017/salon_dev',
        port: process.env.PORT_DEV || 3001,
    },
    staging: {
        url: process.env.MONGODB_STAGING_URL || 'mongodb://localhost:27017/salon_staging',
        port: process.env.PORT_STAGING || 3002,
    },
    production: {
        url: process.env.MONGODB_PROD_URL || 'mongodb://localhost:27017/salon_prod',
        port: process.env.PORT_PROD || 3000,
    },
};

const environment = process.env.NODE_ENV || 'development';
const config = mongodbConfig[environment];

module.exports = {
    mongodb: config,
    environment,
    mongodbConfig,
};