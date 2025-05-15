const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Monte Carlo Black-Scholes Option Pricing
function monteCarloBlackScholes(S0, K, r, sigma, T, isCall, numTrials) {
  const payoffs = [];
  
  for (let i = 0; i < numTrials; i++) {
    // Generate random normal variable using Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    
    // Calculate stock price at maturity
    const ST = S0 * Math.exp((r - 0.5 * sigma * sigma) * T + sigma * Math.sqrt(T) * z);
    
    // Calculate payoff
    const payoff = isCall ? Math.max(ST - K, 0) : Math.max(K - ST, 0);
    payoffs.push(payoff);
  }
  
  // Calculate the average payoff and discount to present value
  const avgPayoff = payoffs.reduce((sum, val) => sum + val, 0) / numTrials;
  const optionPrice = avgPayoff * Math.exp(-r * T);
  
  // Calculate confidence interval
  const n = payoffs.length;
  const mean = payoffs.reduce((sum, val) => sum + val, 0) / n;
  const discountedMean = mean * Math.exp(-r * T);
  
  const variance = payoffs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  
  // 95% confidence interval (1.96 is the z-score for 95% confidence)
  const marginOfError = 1.96 * (stdDev / Math.sqrt(n)) * Math.exp(-r * T);
  
  return {
    optionPrice,
    confidence: {
      lower: discountedMean - marginOfError,
      upper: discountedMean + marginOfError
    }
  };
}

// API endpoint
app.post('/api/black-scholes', (req, res) => {
  try {
    const { S0, K, r, sigma, T, isCall, numTrials } = req.body;
    
    // Validate inputs
    if (!S0 || !K || r === undefined || !sigma || !T || numTrials === undefined) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const result = monteCarloBlackScholes(
      parseFloat(S0),
      parseFloat(K),
      parseFloat(r),
      parseFloat(sigma),
      parseFloat(T),
      Boolean(isCall),
      parseInt(numTrials)
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error calculating option price:', error);
    res.status(500).json({ error: 'Failed to calculate option price' });
  }
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 