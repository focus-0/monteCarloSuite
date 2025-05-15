const cppMonteCarlo = require('./monte_carlo_cpp');
const jsMonteCarlo = require('./monte_carlo_js');
const { performance } = require('perf_hooks');

/**
 * Benchmarking service for Monte Carlo simulations
 */
class BenchmarkService {
  /**
   * Run performance benchmark across different thread counts and implementations
   * @param {Object} params - Black-Scholes parameters
   * @param {number} params.S0 - Initial stock price
   * @param {number} params.K - Strike price
   * @param {number} params.r - Risk-free interest rate
   * @param {number} params.sigma - Volatility
   * @param {number} params.T - Time to maturity in years
   * @param {boolean} params.isCall - True for call option, false for put option
   * @param {number} params.numTrials - Number of Monte Carlo trials
   * @returns {Promise<Object>} Benchmark results
   */
  async runBenchmark(params) {
    // Validate that C++ implementation is available
    const isCppAvailable = cppMonteCarlo.isExecutableAvailable();
    
    const results = {
      cpp: isCppAvailable ? {} : null,
      javascript: {},
      speedup: {},
      parameters: { ...params }
    };

    // Run JavaScript benchmark with multiple iterations
    console.log('Running JavaScript benchmark...');
    const jsResults = await this.runJavaScriptBenchmark(params, 5); // 5 iterations
    
    results.javascript = jsResults;

    // Run C++ benchmarks with different thread counts if available
    if (isCppAvailable) {
      console.log('Running C++ benchmarks with different thread counts...');
      
      // Test with thread counts from 1 to 16
      for (let threads = 1; threads <= 16; threads++) {
        try {
          console.log(`Running C++ benchmark with ${threads} threads...`);
          const cppResults = await this.runCppBenchmark(params, threads, 5); // 5 iterations
          results.cpp[threads] = cppResults;
          
          // Calculate speedup compared to JavaScript
          results.speedup[threads] = results.javascript.statistics.avg / cppResults.statistics.avg;
        } catch (error) {
          console.error(`Error running C++ benchmark with ${threads} threads:`, error.message);
          results.cpp[threads] = { error: error.message };
        }
      }
    }

    return results;
  }

  /**
   * Run JavaScript benchmark with multiple iterations
   * @param {Object} params - Black-Scholes parameters
   * @param {number} iterations - Number of benchmark iterations
   * @returns {Promise<Object>} JavaScript benchmark results
   */
  async runJavaScriptBenchmark(params, iterations = 5) {
    const { S0, K, r, sigma, T, isCall, numTrials } = params;
    const runs = [];

    // Warm-up run (not included in results)
    jsMonteCarlo(
      parseFloat(S0),
      parseFloat(K),
      parseFloat(r),
      parseFloat(sigma),
      parseFloat(T),
      Boolean(isCall),
      parseInt(numTrials)
    );

    // Timed benchmark runs
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      const result = jsMonteCarlo(
        parseFloat(S0),
        parseFloat(K),
        parseFloat(r),
        parseFloat(sigma),
        parseFloat(T),
        Boolean(isCall),
        parseInt(numTrials)
      );
      const endTime = performance.now();
      
      runs.push({
        iteration: i + 1,
        executionTime: endTime - startTime,
        optionPrice: result.optionPrice,
        confidence: result.confidence
      });
    }

    // Calculate statistics
    const times = runs.map(run => run.executionTime);
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
    
    // Calculate median
    const sortedTimes = [...times].sort((a, b) => a - b);
    let median;
    if (sortedTimes.length % 2 === 0) {
      median = (sortedTimes[sortedTimes.length / 2 - 1] + sortedTimes[sortedTimes.length / 2]) / 2;
    } else {
      median = sortedTimes[Math.floor(sortedTimes.length / 2)];
    }

    return {
      statistics: { min, max, avg, median },
      iterations,
      runs
    };
  }

  /**
   * Run C++ benchmark with multiple iterations
   * @param {Object} params - Black-Scholes parameters
   * @param {number} threads - Number of threads to use
   * @param {number} iterations - Number of benchmark iterations
   * @returns {Promise<Object>} C++ benchmark results
   */
  async runCppBenchmark(params, threads, iterations = 5) {
    const { S0, K, r, sigma, T, isCall, numTrials } = params;
    
    try {
      // Use benchmark mode (1) with the specified number of threads and iterations
      const result = await cppMonteCarlo.runBenchmarkMode({
        S0: parseFloat(S0),
        K: parseFloat(K),
        r: parseFloat(r),
        sigma: parseFloat(sigma),
        T: parseFloat(T),
        isCall: Boolean(isCall),
        numTrials: parseInt(numTrials),
        benchmarkMode: 1,
        threads,
        iterations
      });
      
      return result;
    } catch (error) {
      throw new Error(`C++ benchmark failed: ${error.message}`);
    }
  }
}

module.exports = new BenchmarkService(); 