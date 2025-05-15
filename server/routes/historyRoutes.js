const express = require('express');
const { body, param, validationResult } = require('express-validator');
const router = express.Router();
const historyController = require('../controllers/historyController');

// Input validation for history
const validateSimulationInput = [
  body('simulationType').isString().notEmpty().withMessage('Simulation type is required'),
  body('parameters').isObject().notEmpty().withMessage('Parameters are required'),
  body('result').isObject().notEmpty().withMessage('Result is required'),
  body('name').isString().notEmpty().trim().escape().withMessage('Name is required'),
  body('description').optional().isString().trim().escape(),
  body('tags').isArray().optional()
];

// Validation for ID parameter
const validateId = [
  param('id').isMongoId().withMessage('Invalid ID format')
];

// Update validation
const validateUpdate = [
  param('id').isMongoId().withMessage('Invalid ID format'),
  body('name').optional().isString().trim().escape(),
  body('description').optional().isString().trim().escape(),
  body('tags').optional().isArray()
];

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation error', 
      details: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

// Get all simulation history
router.get('/', historyController.getHistory);

// Save a new simulation to history
router.post('/', 
  validateSimulationInput,
  handleValidationErrors,
  historyController.saveSimulation
);

// Get a specific simulation by ID
router.get('/:id', 
  validateId,
  handleValidationErrors,
  historyController.getSimulationById
);

// Update a simulation
router.put('/:id', 
  validateUpdate,
  handleValidationErrors,
  historyController.updateSimulation
);

module.exports = router; 