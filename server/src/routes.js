const express = require('express');
const monteCarloService = require('../utils/monte_carlo_service');
const benchmarkService = require('../utils/benchmark_service');
const historyRoutes = require('../routes/historyRoutes');

const router = express.Router();

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

// API endpoint for Black-Scholes calculation
router.post('/api/black-scholes', async (req, res) => {
  try {
    const { S0, K, r, sigma, T, isCall, numTrials, validateWithAnalytical } = req.body;
    
    // Validate inputs
    const validation = validateOptionParams({ S0, K, r, sigma, T, numTrials });
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // Parse inputs
    const params = {
      S0: parseFloat(S0),
      K: parseFloat(K),
      r: parseFloat(r),
      sigma: parseFloat(sigma),
      T: parseFloat(T),
      isCall: Boolean(isCall),
      numTrials: parseInt(numTrials),
      validateWithAnalytical: Boolean(validateWithAnalytical)
    };

    const result = await monteCarloService.calculateOptionPrice(params);
    res.json(result);
  } catch (error) {
    console.error('Error calculating option price:', error);
    res.status(500).json({ error: 'Failed to calculate option price' });
  }
});

// API endpoint for analytical Black-Scholes calculation
router.post('/api/analytical-black-scholes', async (req, res) => {
  try {
    const { S0, K, r, sigma, T, isCall } = req.body;
    
    // Validate inputs (exclude numTrials which isn't needed for analytical)
    const validation = validateOptionParams({ S0, K, r, sigma, T, numTrials: 1000 });
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // Parse inputs
    const params = {
      S0: parseFloat(S0),
      K: parseFloat(K),
      r: parseFloat(r),
      sigma: parseFloat(sigma),
      T: parseFloat(T),
      isCall: Boolean(isCall)
    };

    const result = monteCarloService.getAnalyticalPrice(params);
    res.json(result);
  } catch (error) {
    console.error('Error calculating analytical price:', error);
    res.status(500).json({ error: 'Failed to calculate analytical price' });
  }
});

// API endpoint for model validation
router.post('/api/validate-model', async (req, res) => {
  try {
    const { S0, K, r, sigma, T, isCall, numTrials } = req.body;
    
    // Validate inputs
    const validation = validateOptionParams({ S0, K, r, sigma, T, numTrials });
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // Parse inputs
    const params = {
      S0: parseFloat(S0),
      K: parseFloat(K),
      r: parseFloat(r),
      sigma: parseFloat(sigma),
      T: parseFloat(T),
      isCall: Boolean(isCall),
      numTrials: parseInt(numTrials),
      validateWithAnalytical: true // Force validation
    };

    const result = await monteCarloService.calculateOptionPrice(params);
    res.json(result);
  } catch (error) {
    console.error('Error validating model:', error);
    res.status(500).json({ error: 'Failed to validate model' });
  }
});

// API endpoint for performance benchmarking
router.post('/api/benchmark', async (req, res) => {
  try {
    const { S0, K, r, sigma, T, isCall, numTrials } = req.body;
    
    // Validate inputs
    const validation = validateOptionParams({ S0, K, r, sigma, T, numTrials });
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // Parse inputs
    const params = {
      S0: parseFloat(S0),
      K: parseFloat(K),
      r: parseFloat(r),
      sigma: parseFloat(sigma),
      T: parseFloat(T),
      isCall: Boolean(isCall),
      numTrials: parseInt(numTrials)
    };

    const result = await benchmarkService.runBenchmark(params);
    res.json(result);
  } catch (error) {
    console.error('Error running benchmark:', error);
    res.status(500).json({ error: 'Failed to run benchmark' });
  }
});

// Endpoint to check which implementation is being used
router.get('/api/implementation-status', (req, res) => {
  res.json(monteCarloService.getImplementationStatus());
});

// History routes
router.use('/api/history', historyRoutes);

module.exports = router; 