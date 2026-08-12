const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const executablePath = path.join(__dirname, '..', 'cpp', 'monte_carlo');

function isExecutableAvailable() {
  try {
    return fs.existsSync(executablePath) && fs.accessSync(executablePath, fs.constants.X_OK) === undefined;
  } catch (error) {
    return false;
  }
}

function runCppProcess(args) {
  return new Promise((resolve, reject) => {
    if (!isExecutableAvailable()) {
      reject(new Error('C++ executable not found. Fallback to JavaScript implementation.'));
      return;
    }

    const process = spawn(executablePath, args);
    let stdoutData = '';
    let stderrData = '';

    process.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`C++ process exited with code ${code}: ${stderrData}`));
        return;
      }

      try {
        const result = JSON.parse(stdoutData);
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(new Error(`Failed to parse C++ output: ${error.message}`));
      }
    });

    process.on('error', (error) => {
      reject(new Error(`Failed to start C++ process: ${error.message}`));
    });
  });
}

function monteCarloBlackScholes(params) {
  const { S0, K, r, sigma, T, isCall, numTrials, threads } = params;
  const args = [
    S0.toString(),
    K.toString(),
    r.toString(),
    sigma.toString(),
    T.toString(),
    isCall ? '1' : '0',
    numTrials.toString(),
    '0' // Mode 0 = European
  ];
  if (threads !== undefined) args.push(threads.toString());
  return runCppProcess(args);
}

function monteCarloAsianOption(params) {
  const { S0, K, r, sigma, T, isCall, numTrials, numSteps = 252, threads } = params;
  const args = [
    S0.toString(),
    K.toString(),
    r.toString(),
    sigma.toString(),
    T.toString(),
    isCall ? '1' : '0',
    numTrials.toString(),
    '2', // Mode 2 = Asian
    (threads || 0).toString(),
    numSteps.toString()
  ];
  return runCppProcess(args);
}

function calculateGreeks(params) {
  const { S0, K, r, sigma, T, isCall, numTrials, threads } = params;
  const args = [
    S0.toString(),
    K.toString(),
    r.toString(),
    sigma.toString(),
    T.toString(),
    isCall ? '1' : '0',
    numTrials.toString(),
    '3' // Mode 3 = Greeks
  ];
  if (threads !== undefined) args.push(threads.toString());
  return runCppProcess(args);
}

function generatePricePaths(params) {
  const { S0, r, sigma, T, numPaths = 50, numSteps = 100 } = params;
  const args = [
    S0.toString(),
    '100', // K placeholder
    r.toString(),
    sigma.toString(),
    T.toString(),
    '1',
    '1000',
    '4', // Mode 4 = Paths
    numPaths.toString(),
    numSteps.toString()
  ];
  return runCppProcess(args);
}

module.exports = {
  monteCarloBlackScholes,
  monteCarloAsianOption,
  calculateGreeks,
  generatePricePaths,
  isExecutableAvailable
};