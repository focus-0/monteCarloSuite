const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const primaryPath = path.join(__dirname, '..', 'cpp', 'monte_carlo');
const buildPath = path.join(__dirname, '..', 'cpp', 'build', 'monte_carlo');

function getExecutablePath() {
  if (fs.existsSync(primaryPath)) return primaryPath;
  if (fs.existsSync(buildPath)) return buildPath;
  return primaryPath;
}

function isExecutableAvailable() {
  try {
    const execPath = getExecutablePath();
    return fs.existsSync(execPath) && fs.accessSync(execPath, fs.constants.X_OK) === undefined;
  } catch (error) {
    return false;
  }
}

function parseBool(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
  if (typeof val === 'number') return val !== 0;
  return true;
}

function runCppProcess(args) {
  return new Promise((resolve, reject) => {
    const execPath = getExecutablePath();
    if (!fs.existsSync(execPath)) {
      reject(new Error('C++ executable not found. Fallback to JavaScript implementation.'));
      return;
    }

    const child = spawn(execPath, args, { maxBuffer: 10 * 1024 * 1024 });
    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    child.on('close', (code, signal) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`C++ process exited with code ${code}: ${stderrData || stdoutData}`));
        return;
      }
      if (code === null && signal) {
        reject(new Error(`C++ process killed by signal ${signal}`));
        return;
      }

      try {
        const result = JSON.parse(stdoutData.trim());
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result);
        }
      } catch (error) {
        reject(new Error(`Failed to parse C++ output: ${error.message}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start C++ process: ${error.message}`));
    });
  });
}

function monteCarloBlackScholes(params) {
  const { S0 = 100, K = 100, r = 0.05, sigma = 0.2, T = 1, isCall = true, numTrials = 100000, threads = 0 } = params;
  const args = [
    Number(S0).toString(),
    Number(K).toString(),
    Number(r).toString(),
    Number(sigma).toString(),
    Number(T).toString(),
    parseBool(isCall) ? '1' : '0',
    Math.floor(Number(numTrials)).toString(),
    '0', // Mode 0 = European
    Number(threads).toString()
  ];
  return runCppProcess(args);
}

function monteCarloAsianOption(params) {
  const { S0 = 100, K = 100, r = 0.05, sigma = 0.2, T = 1, isCall = true, numTrials = 100000, numSteps = 252, threads = 0 } = params;
  const args = [
    Number(S0).toString(),
    Number(K).toString(),
    Number(r).toString(),
    Number(sigma).toString(),
    Number(T).toString(),
    parseBool(isCall) ? '1' : '0',
    Math.floor(Number(numTrials)).toString(),
    '2', // Mode 2 = Asian
    Number(threads).toString(),
    Math.floor(Number(numSteps)).toString()
  ];
  return runCppProcess(args);
}

function calculateGreeks(params) {
  const { S0 = 100, K = 100, r = 0.05, sigma = 0.2, T = 1, isCall = true, numTrials = 100000, threads = 0 } = params;
  const args = [
    Number(S0).toString(),
    Number(K).toString(),
    Number(r).toString(),
    Number(sigma).toString(),
    Number(T).toString(),
    parseBool(isCall) ? '1' : '0',
    Math.floor(Number(numTrials)).toString(),
    '3', // Mode 3 = Greeks
    Number(threads).toString()
  ];
  return runCppProcess(args);
}

function generatePricePaths(params) {
  const { S0 = 100, r = 0.05, sigma = 0.2, T = 1, numPaths = 50, numSteps = 100 } = params;
  const args = [
    Number(S0).toString(),
    '100', // K placeholder
    Number(r).toString(),
    Number(sigma).toString(),
    Number(T).toString(),
    '1',
    '1000',
    '4', // Mode 4 = Paths
    Math.floor(Number(numPaths)).toString(),
    Math.floor(Number(numSteps)).toString()
  ];
  return runCppProcess(args);
}

function simulateDeltaHedging(params) {
  const {
    S0 = 100,
    K = 100,
    r = 0.05,
    sigma = 0.2,
    T = 1,
    isCall = true,
    numTrials = 10000,
    numSteps = 252,
    rebalanceFreq = 1,
    txCostPct = 0.001,
    threads = 0
  } = params;

  const args = [
    Number(S0).toString(),
    Number(K).toString(),
    Number(r).toString(),
    Number(sigma).toString(),
    Number(T).toString(),
    parseBool(isCall) ? '1' : '0',
    Math.floor(Number(numTrials)).toString(),
    '5', // Mode 5 = Delta-Hedging Simulator
    Number(threads).toString(),
    Math.floor(Number(numSteps)).toString(),
    Math.floor(Number(rebalanceFreq)).toString(),
    Number(txCostPct).toString()
  ];
  return runCppProcess(args);
}

module.exports = {
  monteCarloBlackScholes,
  monteCarloAsianOption,
  calculateGreeks,
  generatePricePaths,
  simulateDeltaHedging,
  isExecutableAvailable
};