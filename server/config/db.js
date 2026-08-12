const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/montecarlo';

  try {
    const conn = await mongoose.connect(mongoURI, {
      dbName: 'montecarlo',
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.warn(`Warning: Could not connect to MongoDB (${error.message}). Server running without DB persistence.`);
  }
};

module.exports = connectDB;
