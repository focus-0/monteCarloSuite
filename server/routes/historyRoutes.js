const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');

// Get all simulation history
router.get('/', historyController.getHistory);

// Save a new simulation to history
router.post('/', historyController.saveSimulation);

// Get a specific simulation by ID
router.get('/:id', historyController.getSimulationById);

module.exports = router; 