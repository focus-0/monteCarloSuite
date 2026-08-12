const mongoose = require('mongoose');
const config = require('../config');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      dbName: config.mongoDbName
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.warn(`Warning: Could not connect to MongoDB (${error.message}). Server running without DB persistence.`);
  }
};

module.exports = connectDB;
