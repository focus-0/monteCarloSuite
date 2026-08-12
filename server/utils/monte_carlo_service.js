const cppMonteCarlo = require('./monte_carlo_cpp');
const jsMonteCarlo = require('./monte_carlo_js');
const analyticalBS = require('./black_scholes_analytical');
const marketData = require('./market_data');

class MonteCarloService {
  async calculateOptionPrice(params) {
    const { validateWithAnalytical = false } = params;

    if (!cppMonteCarlo.isExecutableAvailable()) {
      throw new Error('C++ Monte Carlo executable not found.');
    }

    const result = await cppMonteCarlo.monteCarloBlackScholes(params);
    result.implementation = 'cpp';

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
        result.validation = { error: error.message };
      }
    }

    return result;
  }

  calculateOptionPriceJS(params) {
    const { S0, K, r, sigma, T, isCall = true, numTrials = 100000 } = params;
    return jsMonteCarlo.monteCarloBlackScholesJS(S0, K, r, sigma, T, isCall, numTrials);
  }

  async calculateAsianOptionPrice(params) {
    return cppMonteCarlo.monteCarloAsianOption(params);
  }

  async calculateGreeks(params) {
    return cppMonteCarlo.calculateGreeks(params);
  }

  async generatePricePaths(params) {
    return cppMonteCarlo.generatePricePaths(params);
  }

  async getMarketData(ticker) {
    return marketData.getMarketData(ticker);
  }

  getAnalyticalPrice(params) {
    return analyticalBS.calculateAnalyticalPrice(params);
  }

  getImplementationStatus() {
    const isCppAvailable = cppMonteCarlo.isExecutableAvailable();
    return {
      cpp_available: isCppAvailable,
      js_available: true,
      default_implementation: isCppAvailable ? 'cpp' : 'js',
      analytical_available: true
    };
  }
}

module.exports = new MonteCarloService();
