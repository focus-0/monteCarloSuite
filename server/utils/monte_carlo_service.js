const cppMonteCarlo = require('./monte_carlo_cpp');
const jsMonteCarlo = require('./monte_carlo_js');
const analyticalBS = require('./black_scholes_analytical');

/**
 * Monte Carlo Black-Scholes Option Pricing Service
 * Uses C++ implementation if available, falls back to JavaScript
 */
class MonteCarloService {
  /**
   * Calculate option price using Monte Carlo simulation
   * @param {Object} params - Black-Scholes parameters
   * @param {number} params.S0 - Initial stock price
   * @param {number} params.K - Strike price
   * @param {number} params.r - Risk-free interest rate
   * @param {number} params.sigma - Volatility
   * @param {number} params.T - Time to maturity in years
   * @param {boolean} params.isCall - True for call option, false for put option
   * @param {number} params.numTrials - Number of Monte Carlo trials
   * @param {boolean} [params.validateWithAnalytical=false] - Whether to validate against analytical solution
   * @returns {Promise<Object>} Option price, confidence interval, implementation used, and validation (if requested)
   */
  async calculateOptionPrice(params) {
    const { S0, K, r, sigma, T, isCall, numTrials, validateWithAnalytical = false } = params;
    let result;
    let implementation = 'javascript';

    try {
      // Try to use C++ implementation first
      if (cppMonteCarlo.isExecutableAvailable()) {
        console.log('Using C++ implementation for Monte Carlo simulation');
        result = await cppMonteCarlo.monteCarloBlackScholes(params);
        implementation = 'cpp';
      } else {
        console.log('C++ executable not found, using JavaScript implementation');
        result = jsMonteCarlo(
          parseFloat(S0), 
          parseFloat(K), 
          parseFloat(r), 
          parseFloat(sigma), 
          parseFloat(T), 
          Boolean(isCall), 
          parseInt(numTrials)
        );
      }
    } catch (error) {
      console.error('C++ implementation failed, falling back to JavaScript:', error.message);
      result = jsMonteCarlo(
        parseFloat(S0), 
        parseFloat(K), 
        parseFloat(r), 
        parseFloat(sigma), 
        parseFloat(T), 
        Boolean(isCall), 
        parseInt(numTrials)
      );
    }
    
    // Add implementation info to result
    result.implementation = implementation;
    
    // Validate with analytical solution if requested
    if (validateWithAnalytical) {
      try {
        const analyticalResult = analyticalBS.calculateAnalyticalPrice(params);
        
        // Calculate relative error
        const monteCarloPrice = result.optionPrice;
        const analyticalPrice = analyticalResult.analyticalPrice;
        const absoluteError = Math.abs(monteCarloPrice - analyticalPrice);
        const relativeError = absoluteError / analyticalPrice;
        
        // Determine if Monte Carlo price is within the confidence interval
        const isWithinConfidenceInterval = 
          analyticalPrice >= result.confidence.lower && 
          analyticalPrice <= result.confidence.upper;
        
        // Add validation results to the response
        result.validation = {
          analyticalPrice,
          absoluteError,
          relativeError,
          isWithinConfidenceInterval
        };
      } catch (error) {
        console.error('Analytical validation failed:', error.message);
        result.validation = {
          error: error.message
        };
      }
    }
    
    return result;
  }

  /**
   * Get analytical Black-Scholes price
   * @param {Object} params - Black-Scholes parameters
   * @returns {Object} Analytical option price
   */
  getAnalyticalPrice(params) {
    return analyticalBS.calculateAnalyticalPrice(params);
  }

  /**
   * Check which implementation is available
   * @returns {Object} Status of available implementations
   */
  getImplementationStatus() {
    const isCppAvailable = cppMonteCarlo.isExecutableAvailable();
    return {
      cpp_available: isCppAvailable,
      default_implementation: isCppAvailable ? 'cpp' : 'javascript',
      analytical_available: true
    };
  }
}

module.exports = new MonteCarloService(); 