const express = require('express');
const { body, validationResult } = require('express-validator');
const monteCarloService = require('../utils/monte_carlo_service');
const historyRoutes = require('../routes/historyRoutes');

const router = express.Router();

// Health check endpoint
router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

/**
 * Validate option pricing parameters
 * @param {Object} params - Parameters to validate
 * @returns {Object} Validation result {isValid, error}
 */
function validateOptionParams(params) {
  const { S0, K, r, sigma, T, numTrials } = params;
  
  // Convert to numbers for validation
  const parsedParams = {
    S0: parseFloat(S0),
    K: parseFloat(K),
    r: parseFloat(r),
    sigma: parseFloat(sigma),
    T: parseFloat(T),
    numTrials: parseInt(numTrials)
  };
  
  // Check missing parameters
  if (!S0 || !K || r === undefined || !sigma || !T || numTrials === undefined) {
    return { 
      isValid: false, 
      error: 'Missing required parameters' 
    };
  }
  
  // Validate S0 (Stock Price)
  if (parsedParams.S0 <= 0) {
    return { 
      isValid: false, 
      error: 'Stock price must be positive' 
    };
  }
  
  // Validate K (Strike Price)
  if (parsedParams.K <= 0) {
    return { 
      isValid: false, 
      error: 'Strike price must be positive' 
    };
  }
  
  // Validate sigma (Volatility)
  if (parsedParams.sigma <= 0) {
    return { 
      isValid: false, 
      error: 'Volatility must be positive' 
    };
  }
  
  // Validate T (Time to Maturity)
  if (parsedParams.T <= 0) {
    return { 
      isValid: false, 
      error: 'Time to maturity must be positive' 
    };
  }
  
  // Validate numTrials (Number of Monte Carlo Trials)
  if (parsedParams.numTrials < 100) {
    return { 
      isValid: false, 
      error: 'Number of trials must be at least 100' 
    };
  }
  
  return { isValid: true };
}

// Common validation rules
const commonValidationRules = [
  body('S0').isFloat({ min: 0.01 }).withMessage('Stock price must be a positive number'),
  body('K').isFloat({ min: 0.01 }).withMessage('Strike price must be a positive number'),
  body('r').isFloat().withMessage('Interest rate must be a number'),
  body('sigma').isFloat({ min: 0.01 }).withMessage('Volatility must be a positive number'),
  body('T').isFloat({ min: 0.01 }).withMessage('Time to maturity must be a positive number'),
  body('isCall').isBoolean().withMessage('isCall must be a boolean value')
];

// Monte Carlo specific validation
const monteCarloValidation = [
  ...commonValidationRules,
  body('numTrials').isInt({ min: 100, max: 10000000 }).withMessage('Number of trials must be between 100 and 10,000,000')
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

// Sanitize numeric inputs
const sanitizeNumericInputs = (req, res, next) => {
  if (req.body.S0) req.body.S0 = parseFloat(req.body.S0);
  if (req.body.K) req.body.K = parseFloat(req.body.K);
  if (req.body.r) req.body.r = parseFloat(req.body.r);
  if (req.body.sigma) req.body.sigma = parseFloat(req.body.sigma);
  if (req.body.T) req.body.T = parseFloat(req.body.T);
  if (req.body.numTrials) req.body.numTrials = parseInt(req.body.numTrials);
  if (req.body.isCall !== undefined) req.body.isCall = Boolean(req.body.isCall);
  if (req.body.validateWithAnalytical !== undefined) req.body.validateWithAnalytical = Boolean(req.body.validateWithAnalytical);
  next();
};

// API endpoint for Black-Scholes calculation
router.post(
  '/api/black-scholes', 
  monteCarloValidation, 
  handleValidationErrors,
  sanitizeNumericInputs,
  async (req, res) => {
    try {
      const { S0, K, r, sigma, T, isCall, numTrials, validateWithAnalytical } = req.body;
      
      // Double-check validation with our custom validator
      const validation = validateOptionParams({ S0, K, r, sigma, T, numTrials });
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.error });
      }
      
      // Parse inputs - data already sanitized by middleware
      const params = {
        S0,
        K,
        r,
        sigma,
        T,
        isCall,
        numTrials,
        validateWithAnalytical
      };

      const result = await monteCarloService.calculateOptionPrice(params);
      res.json(result);
    } catch (error) {
      console.error('Error calculating option price:', error);
      res.status(500).json({ error: 'Failed to calculate option price' });
    }
  }
);

// API endpoint for analytical Black-Scholes calculation
router.post(
  '/api/analytical-black-scholes',
  commonValidationRules,
  handleValidationErrors,
  sanitizeNumericInputs,
  async (req, res) => {
    try {
      const { S0, K, r, sigma, T, isCall } = req.body;
      
      // Double-check validation with our custom validator
      const validation = validateOptionParams({ S0, K, r, sigma, T, numTrials: 1000 });
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.error });
      }
      
      // Inputs already sanitized by middleware
      const params = {
        S0,
        K,
        r,
        sigma,
        T,
        isCall
      };

      const result = monteCarloService.getAnalyticalPrice(params);
      res.json(result);
    } catch (error) {
      console.error('Error calculating analytical price:', error);
      res.status(500).json({ error: 'Failed to calculate analytical price' });
    }
  }
);

// API endpoint for model validation
router.post(
  '/api/validate-model',
  monteCarloValidation,
  handleValidationErrors,
  sanitizeNumericInputs,
  async (req, res) => {
    try {
      const { S0, K, r, sigma, T, isCall, numTrials } = req.body;
      
      // Double-check validation with our custom validator
      const validation = validateOptionParams({ S0, K, r, sigma, T, numTrials });
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.error });
      }
      
      // Inputs already sanitized by middleware
      const params = {
        S0,
        K,
        r,
        sigma,
        T,
        isCall,
        numTrials,
        validateWithAnalytical: true // Force validation
      };

      const result = await monteCarloService.calculateOptionPrice(params);
      res.json(result);
    } catch (error) {
      console.error('Error validating model:', error);
      res.status(500).json({ error: 'Failed to validate model' });
    }
  }
);


// Endpoint to check which implementation is being used
router.get('/api/implementation-status', (req, res) => {
  res.json(monteCarloService.getImplementationStatus());
});

// History routes
router.use('/api/history', historyRoutes);

module.exports = router; 