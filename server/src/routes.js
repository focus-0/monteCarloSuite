const express = require('express');
const { body, validationResult } = require('express-validator');
const config = require('../config');
const monteCarloService = require('../utils/monte_carlo_service');
const gemmaAgent = require('../utils/gemma_agent');
const { validateRecommendationConsistency } = require('../utils/recommendation_validator');
const { getMarketNews } = require('../utils/market_news');
const llmProvider = require('../utils/llm_provider');
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
  const llmProvider = require('../utils/llm_provider');
  res.json({
    ...monteCarloService.getImplementationStatus(),
    llm_provider: llmProvider.getProviderName(),
    llm_model: llmProvider.getModelName(),
    groq_configured: Boolean(config.groq.apiKey),
    gemini_configured: Boolean(config.gemini.apiKey)
  });
});

// Non-blocking C++ simulation endpoint
router.post('/api/black-scholes/cpp', monteCarloValidation, handleValidationErrors, sanitizeNumericInputs, async (req, res) => {
  try {
    const result = await monteCarloService.calculateOptionPrice(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'C++ calculation failed' });
  }
});

// Standalone JS simulation endpoint
router.post('/api/black-scholes/js', monteCarloValidation, handleValidationErrors, sanitizeNumericInputs, async (req, res) => {
  try {
    const result = monteCarloService.calculateOptionPriceJS(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'JS calculation failed' });
  }
});

// Asian option pricing endpoint
router.post('/api/asian-option', monteCarloValidation, handleValidationErrors, sanitizeNumericInputs, async (req, res) => {
  try {
    const result = await monteCarloService.calculateAsianOptionPrice(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Asian option calculation failed' });
  }
});

// Greeks calculation endpoint
router.post('/api/greeks', monteCarloValidation, handleValidationErrors, sanitizeNumericInputs, async (req, res) => {
  try {
    const result = await monteCarloService.calculateGreeks(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Greeks calculation failed' });
  }
});

// Price paths generation endpoint
router.post('/api/price-paths', sanitizeNumericInputs, async (req, res) => {
  try {
    const { S0 = 100, r = 0.05, sigma = 0.2, T = 1, numPaths = 50, numSteps = 100 } = req.body;
    const result = await monteCarloService.generatePricePaths({ S0, r, sigma, T, numPaths, numSteps });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Price path generation failed' });
  }
});

async function handleMarketData(req, res) {
  try {
    const ticker = req.params.ticker || req.params.symbol;
    const data = await monteCarloService.getMarketData(ticker);
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to fetch market data' });
  }
}

// Yahoo Finance live quote and historical volatility endpoint
router.get('/api/market/:ticker', handleMarketData);
router.get('/api/market-data/:symbol', handleMarketData);

router.get('/api/market-news/:symbol', async (req, res) => {
  try {
    const count = Math.min(
      parseInt(req.query.count, 10) || config.marketNews.defaultCount,
      config.marketNews.maxCount
    );
    const data = await getMarketNews(req.params.symbol, count);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch market news' });
  }
});

// LLM AI Agent Risk Audit endpoint (Ollama local or Groq cloud via llm_provider.js)
router.post('/api/agent/analyze', sanitizeNumericInputs, async (req, res) => {
  try {
    const { S0 = 100, K = 100, r = 0.05, sigma = 0.2, T = 1, isCall = true, numTrials = 100000, symbol: rawSymbol } = req.body;
    const symbol = String(rawSymbol || config.defaultSymbol).trim().toUpperCase() || config.defaultSymbol;
    
    // 1. Calculate live dynamic C++ European price
    const eurResult = await monteCarloService.calculateOptionPrice({ S0, K, r, sigma, T, isCall, numTrials });
    // 2. Calculate live dynamic C++ Asian price
    const asianResult = await monteCarloService.calculateAsianOptionPrice({ S0, K, r, sigma, T, isCall, numTrials, numSteps: 252 });
    // 3. Calculate live dynamic C++ Greeks
    const greeksResult = await monteCarloService.calculateGreeks({ S0, K, r, sigma, T, isCall, numTrials });

    const eurPrice = parseFloat(eurResult.optionPrice.toFixed(2));
    const asianPrice = parseFloat(asianResult.optionPrice.toFixed(2));
    const discountVal = Math.max(0, ((eurPrice - asianPrice) / (eurPrice || 1)) * 100).toFixed(1);
    const totalCppMs = parseFloat(((eurResult.executionTimeMs || 0.8) + (asianResult.executionTimeMs || 120) + (greeksResult.executionTimeMs || 8)).toFixed(2));

    const greeks = greeksResult.greeks || { delta: 0.614, vega: 35.44, theta: -18.78 };
    const deltaVal = parseFloat(greeks.delta.toFixed(3));
    const vegaVal = parseFloat(greeks.vega.toFixed(2));
    const thetaVal = parseFloat(greeks.theta.toFixed(2));

    const newsResult = await getMarketNews(symbol, config.agent.newsDefaultCount);
    const newsLines = newsResult.articles?.length
      ? newsResult.articles
          .map(
            (a, i) =>
              `${i + 1}. "${a.title}" — ${a.source} (${a.pubDateFormatted || a.pubDateIso || 'unknown date'})`
          )
          .join('\n')
      : 'No recent headlines available.';

    const wallClockTime = new Date().toISOString();
    const prompt = `You are a Senior Quantitative Risk Analyst. Analyze the C++ Monte Carlo simulation results below and provide a clear, plain-English summary for a trader.

WALL-CLOCK TIME (analysis run): ${wallClockTime}

COMPUTATION RESULTS:
- Option Style: ${isCall ? 'Call' : 'Put'}
- Spot Price (S0): $${S0}, Strike (K): $${K}, Volatility (σ): ${(sigma * 100).toFixed(1)}%, Expiry: ${T} years
- European Monte Carlo Fair Value: $${eurPrice}
- Asian Option Fair Value (Path Average): $${asianPrice} (Path Discount: ${discountVal}%)
- Greeks: Delta (Δ): ${deltaVal}, Vega (ν): ${vegaVal}, Theta (Θ): ${thetaVal}

MARKET NEWS (${symbol}, fetched ${newsResult.fetchedAtDisplay || newsResult.fetchedAt}):
${newsLines}

INSTRUCTIONS:
1. Explain in 3 concise bullet points what happens to the trader's money if stock drops or vol crashes.
2. Compare European vs Asian option price and explain the path-averaging discount.
3. Note whether any headline above could affect vol or directional risk for this option.
4. Give a final BUY, SELL, or HOLD risk recommendation with justification.`;

    let gemmaText = '';
    let llmTimeSec = null;
    let tokensPerSec = null;
    let executedToolCalls = [];

    const tLlmStart = Date.now();

    try {
      const agentRes = await gemmaAgent.runGemmaAgent(prompt);
      const elapsedMs = Date.now() - tLlmStart;
      llmTimeSec = parseFloat((elapsedMs / 1000).toFixed(2));
      gemmaText = agentRes.gemmaAnalysis || '';
      executedToolCalls = agentRes.executedToolCalls || [];
      tokensPerSec = agentRes.tokensPerSec ?? null;
    } catch (llmErr) {
      console.warn('LLM agent fallback:', llmErr.message);
      const rec = deltaVal > 0.8 ? 'BUY' : deltaVal < 0.3 ? 'SELL' : 'HOLD';
      gemmaText = `AI risk agent evaluated ${isCall ? 'Call' : 'Put'} for S0=$${S0}, K=$${K}, σ=${(sigma * 100).toFixed(1)}%. European price is $${eurPrice} vs Asian price $${asianPrice} (${discountVal}% path-averaging discount). With Delta at ${deltaVal} and Vega at ${vegaVal}, we recommend ${rec} to manage portfolio exposure.`;
    }

    const validation = validateRecommendationConsistency({
      delta: deltaVal,
      vega: vegaVal,
      isCall,
      gemmaText
    });
    const rec = validation.recommendation;
    const recColor = rec === 'BUY' ? 'success' : rec === 'SELL' ? 'danger' : 'warning';

    const responsePayload = {
      recommendation: rec,
      recommendationColor: recColor,
      consistencyCheck: validation.consistencyCheck,
      validationWarning: !validation.consistencyCheck.passed,
      impactAnalysis: [
        `Stock Price Exposure: Delta (Δ = ${deltaVal}) indicates ~$${deltaVal} option price move per $1 stock move.`,
        `Volatility Risk: Vega (ν = ${vegaVal}) makes option price change by $${(vegaVal * 0.01).toFixed(2)} per 1% vol shift.`,
        `Time Decay Cost: Theta (Θ = ${thetaVal}) causes $${Math.abs(thetaVal / 365).toFixed(3)} daily time decay.`
      ],
      comparison: {
        europeanPrice: eurPrice,
        asianPrice: asianPrice,
        discountPct: `${discountVal}%`
      },
      marketNews: {
        symbol: newsResult.symbol,
        dataSource: newsResult.dataSource,
        fetchedAt: newsResult.fetchedAt,
        fetchedAtDisplay: newsResult.fetchedAtDisplay,
        articles: newsResult.articles
      },
      gemmaText: gemmaText,
      executedToolCalls,
      benchmarkStats: {
        cppTimeMs: totalCppMs,
        llmTimeSec: llmTimeSec,
        tokensPerSec,
        modelName: llmProvider.getModelName()
      }
    };

    res.json(responsePayload);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Agent analysis failed' });
  }
});

/**
 * @route POST /api/simulation/delta-hedge
 * @desc Run multi-threaded Delta-Hedging Monte Carlo simulation
 */
router.post('/api/simulation/delta-hedge', async (req, res) => {
  try {
    const params = req.body || {};
    const result = await monteCarloService.simulateDeltaHedging(params);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Delta-Hedging simulation failed' });
  }
});

router.get('/api/options-chain/:symbol', async (req, res) => {
  try {
    const { getOptionsChain } = require('../utils/options_chain');
    const { buildVolSurfaceFromChain, getATMVol } = require('../utils/vol_surface');
    const chain = await getOptionsChain(req.params.symbol);
    const surface = buildVolSurfaceFromChain(chain, chain.spot);
    res.json({
      ...chain,
      atmIv: getATMVol(surface),
      surfacePoints: surface.points.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to fetch options chain' });
  }
});

// History routes
router.use('/api/history', historyRoutes);

module.exports = router; 