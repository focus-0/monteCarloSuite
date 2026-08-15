const mongoose = require('mongoose');
const config = require('../config');

let isConnected = false;

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri, {
      dbName: config.mongoDbName,
      serverSelectionTimeoutMS: config.mongoTimeoutMs || 3000,
      connectTimeoutMS: config.mongoTimeoutMs || 3000
    });
    isConnected = true;
    console.log(`MongoDB Connected: ${conn.connection.host} (DB: ${config.mongoDbName})`);
  } catch (error) {
    isConnected = false;
    console.warn(`Warning: Could not connect to MongoDB (${error.message}). Server running without DB persistence.`);
  }
};

mongoose.connection.on('connected', () => {
  isConnected = true;
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
});

mongoose.connection.on('error', (err) => {
  isConnected = false;
  console.warn(`MongoDB Connection Error: ${err.message}`);
});

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function getDbStatus() {
  const stateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  const state = mongoose.connection.readyState;
  return {
    connected: state === 1,
    status: stateMap[state] || 'unknown',
    host: mongoose.connection.host || null,
    dbName: config.mongoDbName
  };
}

module.exports = connectDB;
module.exports.getDbStatus = getDbStatus;
module.exports.isDbConnected = isDbConnected;
