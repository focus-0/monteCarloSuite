const mongoose = require('mongoose');

const SimulationHistorySchema = new mongoose.Schema({
  name: {
    type: String,
    default: 'Untitled Simulation'
  },
  description: {
    type: String,
    default: ''
  },
  tags: {
    type: [String],
    default: []
  },
  simulationType: {
    type: String,
    required: true,
    enum: ['black-scholes'] // Can expand this list as more simulation types are added
  },
  parameters: {
    type: Object,
    required: true
  },
  result: {
    type: Object,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('SimulationHistory', SimulationHistorySchema); 