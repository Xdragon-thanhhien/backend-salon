const mongoose = require('mongoose');
const path = require('path');
const User = require('./models/User');
const Service = require('./models/Service');
const Appointment = require('./models/Appointment');

// Import your models

const seedDatabase = async () => {
    try {
        // Clear existing data
        await User.deleteMany({});
        await Service.deleteMany({});
        await Appointment.deleteMany({});

    await User.insertMany([
      {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        role: 'admin',
        password: 'hashed_password_here'
      },
      {
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '0987654321',
        role: 'customer',
        password: 'hashed_password_here'
      }
    ]);

        // Seed services
        const services = await Service.insertMany([
            { name: 'Haircut', price: 25, duration: 30 },
            { name: 'Hair Coloring', price: 60, duration: 90 },
            { name: 'Facial', price: 45, duration: 60 }
        ]);

        console.log('✓ Database seeded successfully');
        process.exit(0);
    } catch (error) {
        console.error('✗ Error seeding database:', error);
        process.exit(1);
    }
};

// Run seed if this file is executed directly
if (require.main === module) {
    seedDatabase();
}

module.exports = seedDatabase;