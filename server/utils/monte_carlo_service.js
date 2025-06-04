const cppMonteCarlo = require('./monte_carlo_cpp');
const analyticalBS = require('./black_scholes_analytical');

/**
 * Monte Carlo Black-Scholes Option Pricing Service
 * Uses only C++ implementation
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
    const { validateWithAnalytical = false } = params;

    if (!cppMonteCarlo.isExecutableAvailable()) {
      throw new Error('C++ Monte Carlo executable not found. Cannot proceed without it.');
    }

    let result;
    try {
      console.log('Using C++ implementation for Monte Carlo simulation');
      result = await cppMonteCarlo.monteCarloBlackScholes(params);
      result.implementation = 'cpp';
    } catch (error) {
      console.error('C++ implementation failed:', error.message);
      throw new Error('C++ Monte Carlo simulation failed. No fallback is available.');
    }

    // Validate with analytical solution if requested
    if (validateWithAnalytical) {
      try {
        const analyticalResult = analyticalBS.calculateAnalyticalPrice(params);
        
        const monteCarloPrice = result.optionPrice;
        const analyticalPrice = analyticalResult.analyticalPrice;
        const absoluteError = Math.abs(monteCarloPrice - analyticalPrice);
        const relativeError = absoluteError / analyticalPrice;

        const isWithinConfidenceInterval = 
          analyticalPrice >= result.confidence.lower && 
          analyticalPrice <= result.confidence.upper;

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
      default_implementation: isCppAvailable ? 'cpp' : 'none',
      analytical_available: true
    };
  }
}

module.exports = new MonteCarloService();
