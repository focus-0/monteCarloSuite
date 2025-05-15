const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path to the C++ executable
const executablePath = path.join(__dirname, '..', 'cpp', 'monte_carlo');

/**
 * Check if the C++ executable exists
 * @returns {boolean} True if the executable exists, false otherwise
 */
function isExecutableAvailable() {
  try {
    return fs.existsSync(executablePath) && fs.accessSync(executablePath, fs.constants.X_OK) === undefined;
  } catch (error) {
    return false;
  }
}

/**
 * Calculate option price using Monte Carlo simulation with C++ implementation
 * @param {Object} params - Black-Scholes parameters
 * @param {number} params.S0 - Initial stock price
 * @param {number} params.K - Strike price
 * @param {number} params.r - Risk-free interest rate
 * @param {number} params.sigma - Volatility
 * @param {number} params.T - Time to maturity in years
 * @param {boolean} params.isCall - True for call option, false for put option
 * @param {number} params.numTrials - Number of Monte Carlo trials
 * @param {number} [params.threads] - Number of threads to use (optional)
 * @returns {Promise<Object>} Option price and confidence interval
 */
function monteCarloBlackScholes(params) {
  return new Promise((resolve, reject) => {
    // Validate that the executable exists
    if (!isExecutableAvailable()) {
      reject(new Error('C++ executable not found. Fallback to JavaScript implementation.'));
      return;
    }

    // Validate inputs
    const { S0, K, r, sigma, T, isCall, numTrials, threads } = params;
    if (!S0 || !K || r === undefined || !sigma || !T || numTrials === undefined) {
      reject(new Error('Missing required parameters'));
      return;
    }

    // Prepare command-line arguments for C++ executable
    const args = [
      S0.toString(),
      K.toString(),
      r.toString(),
      sigma.toString(),
      T.toString(),
      isCall ? '1' : '0',
      numTrials.toString(),
      '0' // benchmark mode 0 = single run
    ];
    
    // Add thread count if specified
    if (threads !== undefined) {
      args.push(threads.toString());
    }

    // Spawn the C++ process
    const process = spawn(executablePath, args);
    
    let stdoutData = '';
    let stderrData = '';

    // Collect stdout data
    process.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    // Collect stderr data
    process.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    // Handle process completion
    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`C++ process exited with code ${code}: ${stderrData}`));
        return;
      }

      try {
        // Parse the JSON output from the C++ executable
        const result = JSON.parse(stdoutData);
        if (result.error) {
          reject(new Error('Error in C++ calculation'));
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(new Error(`Failed to parse C++ output: ${error.message}`));
      }
    });

    // Handle process errors
    process.on('error', (error) => {
      reject(new Error(`Failed to start C++ process: ${error.message}`));
    });
  });
}

/**
 * Run C++ benchmark with multiple iterations
 * @param {Object} params - Black-Scholes parameters
 * @param {number} params.S0 - Initial stock price
 * @param {number} params.K - Strike price
 * @param {number} params.r - Risk-free interest rate
 * @param {number} params.sigma - Volatility
 * @param {number} params.T - Time to maturity in years
 * @param {boolean} params.isCall - True for call option, false for put option
 * @param {number} params.numTrials - Number of Monte Carlo trials
 * @param {number} params.benchmarkMode - 1 for benchmark mode
 * @param {number} params.threads - Number of threads to use
 * @param {number} params.iterations - Number of benchmark iterations
 * @returns {Promise<Object>} Benchmark results
 */
function runBenchmarkMode(params) {
  return new Promise((resolve, reject) => {
    // Validate that the executable exists
    if (!isExecutableAvailable()) {
      reject(new Error('C++ executable not found.'));
      return;
    }

    // Validate inputs
    const { S0, K, r, sigma, T, isCall, numTrials, benchmarkMode, threads, iterations } = params;
    if (!S0 || !K || r === undefined || !sigma || !T || numTrials === undefined) {
      reject(new Error('Missing required parameters'));
      return;
    }

    // Prepare command-line arguments for C++ executable
    const args = [
      S0.toString(),
      K.toString(),
      r.toString(),
      sigma.toString(),
      T.toString(),
      isCall ? '1' : '0',
      numTrials.toString(),
      benchmarkMode.toString(), // 1 = benchmark mode
      threads.toString()
    ];
    
    // Add iterations if specified
    if (iterations !== undefined) {
      args.push(iterations.toString());
    }

    // Spawn the C++ process
    const process = spawn(executablePath, args);
    
    let stdoutData = '';
    let stderrData = '';

    // Collect stdout data
    process.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    // Collect stderr data
    process.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    // Handle process completion
    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`C++ process exited with code ${code}: ${stderrData}`));
        return;
      }

      try {
        // Parse the JSON output from the C++ executable
        const result = JSON.parse(stdoutData);
        if (result.error) {
          reject(new Error('Error in C++ calculation'));
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(new Error(`Failed to parse C++ output: ${error.message}\nOutput: ${stdoutData}`));
      }
    });

    // Handle process errors
    process.on('error', (error) => {
      reject(new Error(`Failed to start C++ process: ${error.message}`));
    });
  });
}

module.exports = {
  monteCarloBlackScholes,
  runBenchmarkMode,
  isExecutableAvailable
}; 