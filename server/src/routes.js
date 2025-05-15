const express = require('express');
const monteCarloService = require('../utils/monte_carlo_service');
const benchmarkService = require('../utils/benchmark_service');
const historyRoutes = require('../routes/historyRoutes');

const router = express.Router();

// API endpoint for Black-Scholes calculation
router.post('/api/black-scholes', async (req, res) => {
  try {
    const { S0, K, r, sigma, T, isCall, numTrials } = req.body;
    
    // Validate inputs
    if (!S0 || !K || r === undefined || !sigma || !T || numTrials === undefined) {
      return res.status(400).json({ error: 'Missing required parameters' });
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

    const result = await monteCarloService.calculateOptionPrice(params);
    res.json(result);
  } catch (error) {
    console.error('Error calculating option price:', error);
    res.status(500).json({ error: 'Failed to calculate option price' });
  }
});

// API endpoint for performance benchmarking
router.post('/api/benchmark', async (req, res) => {
  try {
    const { S0, K, r, sigma, T, isCall, numTrials } = req.body;
    
    // Validate inputs
    if (!S0 || !K || r === undefined || !sigma || !T || numTrials === undefined) {
      return res.status(400).json({ error: 'Missing required parameters' });
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