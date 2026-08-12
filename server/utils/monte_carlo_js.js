// Standalone JavaScript Monte Carlo Engine for side-by-side benchmarking

function boxMullerTransform() {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function calculatePayoff(ST, K, isCall) {
  const diff = isCall ? ST - K : K - ST;
  return Math.max(0.0, diff);
}

function monteCarloBlackScholesJS(S0, K, r, sigma, T, isCall = true, numTrials = 100000) {
  const startTime = process.hrtime.bigint();

  const drift = (r - 0.5 * sigma * sigma) * T;
  const volatility = sigma * Math.sqrt(T);
  const discount = Math.exp(-r * T);

  let sum = 0.0;
  let sumSquared = 0.0;

  for (let i = 0; i < numTrials; i++) {
    const z = boxMullerTransform();
    const ST = S0 * Math.exp(drift + volatility * z);
    const payoff = calculatePayoff(ST, K, isCall);

    sum += payoff;
    sumSquared += payoff * payoff;
  }

  const mean = sum / numTrials;
  const discountedMean = mean * discount;
  const variance = (sumSquared / numTrials) - (mean * mean);
  const stdDev = Math.sqrt(Math.max(0, variance));
  const marginOfError = 1.96 * (stdDev / Math.sqrt(numTrials)) * discount;

  const endTime = process.hrtime.bigint();
  const executionTimeMs = Number(endTime - startTime) / 1e6;

  return {
    optionPrice: Number(discountedMean.toFixed(6)),
    confidence: {
      lower: Number((discountedMean - marginOfError).toFixed(6)),
      upper: Number((discountedMean + marginOfError).toFixed(6))
    },
    executionTimeMs: Number(executionTimeMs.toFixed(3)),
    numTrials,
    engine: 'javascript'
  };
}

function monteCarloAsianJS(S0, K, r, sigma, T, isCall = true, numTrials = 100000, numSteps = 252) {
  const startTime = process.hrtime.bigint();

  const dt = T / numSteps;
  const drift = (r - 0.5 * sigma * sigma) * dt;
  const volSqrtDt = sigma * Math.sqrt(dt);
  const discount = Math.exp(-r * T);

  let sum = 0.0;
  let sumSquared = 0.0;

  for (let i = 0; i < numTrials; i++) {
    let currentS = S0;
    let pathSum = currentS;

    for (let step = 0; step < numSteps; step++) {
      const z = boxMullerTransform();
      currentS *= Math.exp(drift + volSqrtDt * z);
      pathSum += currentS;
    }

    const arithmeticAvg = pathSum / (numSteps + 1);
    const payoff = calculatePayoff(arithmeticAvg, K, isCall);

    sum += payoff;
    sumSquared += payoff * payoff;
  }

  const mean = sum / numTrials;
  const discountedMean = mean * discount;
  const variance = (sumSquared / numTrials) - (mean * mean);
  const stdDev = Math.sqrt(Math.max(0, variance));
  const marginOfError = 1.96 * (stdDev / Math.sqrt(numTrials)) * discount;

  const endTime = process.hrtime.bigint();
  const executionTimeMs = Number(endTime - startTime) / 1e6;

  return {
    optionPrice: Number(discountedMean.toFixed(6)),
    confidence: {
      lower: Number((discountedMean - marginOfError).toFixed(6)),
      upper: Number((discountedMean + marginOfError).toFixed(6))
    },
    executionTimeMs: Number(executionTimeMs.toFixed(3)),
    numTrials,
    numSteps,
    engine: 'javascript'
  };
}

module.exports = {
  monteCarloBlackScholesJS,
  monteCarloAsianJS
};
