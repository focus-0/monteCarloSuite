/**
 * Analytical Black-Scholes Option Pricing
 * This file contains the analytical solution for the Black-Scholes option pricing model
 */

/**
 * Standard normal cumulative distribution function
 * @param {number} x - Input value
 * @returns {number} Cumulative probability
 */
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  // Save the sign of x
  const sign = (x < 0) ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2.0);

  // A&S formula 7.1.26
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Analytical Black-Scholes option pricing formula
 * @param {number} S0 - Initial stock price
 * @param {number} K - Strike price
 * @param {number} r - Risk-free interest rate
 * @param {number} sigma - Volatility
 * @param {number} T - Time to maturity in years
 * @param {boolean} isCall - True for call option, false for put option
 * @returns {number} Option price
 */
function blackScholesAnalytical(S0, K, r, sigma, T, isCall) {
  // Check for edge cases
  if (sigma <= 0 || T <= 0) {
    throw new Error("Volatility and time to maturity must be positive");
  }

  // Calculate d1 and d2
  const d1 = (Math.log(S0 / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  // Calculate call price
  if (isCall) {
    return S0 * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
  } 
  // Calculate put price (using put-call parity)
  else {
    return K * Math.exp(-r * T) * normalCDF(-d2) - S0 * normalCDF(-d1);
  }
}

/**
 * Calculate analytical Black-Scholes option price
 * @param {Object} params - Black-Scholes parameters
 * @param {number} params.S0 - Initial stock price
 * @param {number} params.K - Strike price
 * @param {number} params.r - Risk-free interest rate
 * @param {number} params.sigma - Volatility
 * @param {number} params.T - Time to maturity in years
 * @param {boolean} params.isCall - True for call option, false for put option
 * @returns {Object} Analytical option price
 */
function calculateAnalyticalPrice(params) {
  const { S0, K, r, sigma, T, isCall } = params;
  
  try {
    const analyticalPrice = blackScholesAnalytical(
      parseFloat(S0),
      parseFloat(K),
      parseFloat(r),
      parseFloat(sigma),
      parseFloat(T),
      Boolean(isCall)
    );

    return {
      analyticalPrice,
      method: 'Black-Scholes'
    };
  } catch (error) {
    throw new Error(`Analytical calculation failed: ${error.message}`);
  }
}

module.exports = {
  blackScholesAnalytical,
  calculateAnalyticalPrice
}; 