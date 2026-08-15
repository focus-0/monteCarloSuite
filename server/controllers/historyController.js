const SimulationHistory = require('../models/SimulationHistory');
const { getDbStatus, isDbConnected } = require('../config/db');

// Get database status & statistics
exports.getHistoryStatus = async (req, res) => {
  try {
    const status = getDbStatus();
    let count = 0;
    if (status.connected) {
      count = await SimulationHistory.countDocuments();
    }
    res.json({
      ...status,
      totalSavedSimulations: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to get DB status' });
  }
};

// Get all simulation history
exports.getHistory = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.json([]);
    }
    const { limit = 50, simulationType, symbol } = req.query;
    const filter = {};
    if (simulationType) filter.simulationType = simulationType.toLowerCase();
    if (symbol) filter.symbol = symbol.toUpperCase();

    const history = await SimulationHistory.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 200));

    res.json(history);
  } catch (error) {
    console.error('Error fetching simulation history:', error);
    res.status(500).json({ message: 'Server error fetching history', error: error.message });
  }
};

// Save a new simulation to history
exports.saveSimulation = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({
        message: 'MongoDB is currently disconnected. Cannot persist simulation.'
      });
    }

    const { simulationType, parameters, result, name, description, tags, symbol } = req.body;
    const sym = symbol || parameters?.symbol || 'AAPL';
    const type = (simulationType || 'european').toLowerCase();

    const newSimulation = new SimulationHistory({
      simulationType: type === 'black-scholes' ? 'european' : type,
      symbol: String(sym).toUpperCase(),
      parameters,
      result,
      name: name || `${String(sym).toUpperCase()} ${type.toUpperCase()} Run`,
      description: description || '',
      tags: tags || []
    });

    const savedSimulation = await newSimulation.save();
    res.status(201).json(savedSimulation);
  } catch (error) {
    console.error('Error saving simulation:', error);
    res.status(500).json({ message: 'Server error saving simulation', error: error.message });
  }
};

// Get a specific simulation by ID
exports.getSimulationById = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'MongoDB is offline' });
    }

    const simulation = await SimulationHistory.findById(req.params.id);
    if (!simulation) {
      return res.status(404).json({ message: 'Simulation not found' });
    }

    res.json(simulation);
  } catch (error) {
    console.error('Error fetching simulation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update a simulation
exports.updateSimulation = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'MongoDB is offline' });
    }

    const { name, description, tags } = req.body;
    const simulation = await SimulationHistory.findById(req.params.id);

    if (!simulation) {
      return res.status(404).json({ message: 'Simulation not found' });
    }

    if (name !== undefined) simulation.name = name;
    if (description !== undefined) simulation.description = description;
    if (tags !== undefined) simulation.tags = tags;

    const updatedSimulation = await simulation.save();
    res.json(updatedSimulation);
  } catch (error) {
    console.error('Error updating simulation:', error);
    res.status(500).json({ message: 'Server error updating simulation', error: error.message });
  }
};

// Delete a simulation
exports.deleteSimulation = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ message: 'MongoDB is offline' });
    }

    const result = await SimulationHistory.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ message: 'Simulation not found' });
    }

    res.json({ message: 'Simulation deleted successfully', id: req.params.id });
  } catch (error) {
    console.error('Error deleting simulation:', error);
    res.status(500).json({ message: 'Server error deleting simulation', error: error.message });
  }
};