const cppMonteCarlo = require('./monte_carlo_cpp');
const jsMonteCarlo = require('./monte_carlo_js');

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
   * @returns {Promise<Object>} Option price, confidence interval, and implementation used
   */
  async calculateOptionPrice(params) {
    const { S0, K, r, sigma, T, isCall, numTrials } = params;
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
    
    return result;
  }

  /**
   * Check which implementation is available
   * @returns {Object} Status of available implementations
   */
  getImplementationStatus() {
    const isCppAvailable = cppMonteCarlo.isExecutableAvailable();
    return {
      cpp_available: isCppAvailable,
      default_implementation: isCppAvailable ? 'cpp' : 'javascript'
    };
  }
}

module.exports = new MonteCarloService(); 