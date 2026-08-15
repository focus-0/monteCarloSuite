const mongoose = require('mongoose');

const SimulationHistorySchema = new mongoose.Schema({
  name: {
    type: String,
    default: 'Untitled Simulation'
  },
  symbol: {
    type: String,
    default: 'AAPL',
    uppercase: true,
    trim: true
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
    enum: ['european', 'black-scholes', 'asian', 'greeks', 'delta-hedge']
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
    default: Date.now,
    index: true
  }
});

SimulationHistorySchema.index({ simulationType: 1, createdAt: -1 });
SimulationHistorySchema.index({ symbol: 1, createdAt: -1 });

module.exports = mongoose.model('SimulationHistory', SimulationHistorySchema);