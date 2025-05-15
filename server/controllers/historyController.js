const SimulationHistory = require('../models/SimulationHistory');

// Get all simulation history
exports.getHistory = async (req, res) => {
  try {
    const history = await SimulationHistory.find().sort({ createdAt: -1 });
    res.json(history);
  } catch (error) {
    console.error('Error fetching simulation history:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Save a new simulation to history
exports.saveSimulation = async (req, res) => {
  try {
    const { simulationType, parameters, result } = req.body;
    
    const newSimulation = new SimulationHistory({
      simulationType,
      parameters,
      result
    });
    
    const savedSimulation = await newSimulation.save();
    res.status(201).json(savedSimulation);
  } catch (error) {
    console.error('Error saving simulation:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get a specific simulation by ID
exports.getSimulationById = async (req, res) => {
  try {
    const simulation = await SimulationHistory.findById(req.params.id);
    
    if (!simulation) {
      return res.status(404).json({ message: 'Simulation not found' });
    }
    
    res.json(simulation);
  } catch (error) {
    console.error('Error fetching simulation:', error);
    res.status(500).json({ message: 'Server error' });
  }
}; 