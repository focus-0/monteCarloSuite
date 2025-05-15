/**
 * JavaScript implementation of Monte Carlo Black-Scholes Option Pricing
 * @param {number} S0 - Initial stock price
 * @param {number} K - Strike price
 * @param {number} r - Risk-free interest rate
 * @param {number} sigma - Volatility
 * @param {number} T - Time to maturity in years
 * @param {boolean} isCall - True for call option, false for put option
 * @param {number} numTrials - Number of Monte Carlo trials
 * @returns {Object} Option price and confidence interval
 * @throws {Error} If parameters are invalid
 */
function monteCarloBlackScholes(S0, K, r, sigma, T, isCall, numTrials) {
  // Validate parameters
  if (S0 <= 0) {
    throw new Error("Stock price (S0) must be positive");
  }
  if (K <= 0) {
    throw new Error("Strike price (K) must be positive");
  }
  if (sigma <= 0) {
    throw new Error("Volatility (sigma) must be positive");
  }
  if (T <= 0) {
    throw new Error("Time to maturity (T) must be positive");
  }
  if (numTrials <= 0) {
    throw new Error("Number of trials must be positive");
  }
  
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

module.exports = monteCarloBlackScholes; 