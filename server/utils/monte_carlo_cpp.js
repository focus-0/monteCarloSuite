const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Try loading native N-API in-process addon for zero-overhead execution
let nativeAddon = null;
const addonPaths = [
  path.join(__dirname, '..', 'build', 'Release', 'monte_carlo_addon.node'),
  path.join(__dirname, '..', 'cpp', 'build', 'Release', 'monte_carlo_addon.node'),
  path.join(__dirname, '..', 'build', 'Debug', 'monte_carlo_addon.node')
];

for (const p of addonPaths) {
  if (fs.existsSync(p)) {
    try {
      nativeAddon = require(p);
      break;
    } catch (e) {
      // Fallback
    }
  }
}

const primaryPath = path.join(__dirname, '..', 'cpp', 'monte_carlo');
const buildPath = path.join(__dirname, '..', 'cpp', 'build', 'monte_carlo');

function getExecutablePath() {
  if (fs.existsSync(primaryPath)) return primaryPath;
  if (fs.existsSync(buildPath)) return buildPath;
  return primaryPath;
}

function isExecutableAvailable() {
  if (nativeAddon) return true;
  try {
    const execPath = getExecutablePath();
    return fs.existsSync(execPath) && fs.accessSync(execPath, fs.constants.X_OK) === undefined;
  } catch (error) {
    return false;
  }
}

function isNativeAddonLoaded() {
  return nativeAddon !== null;
}

function parseBool(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
  if (typeof val === 'number') return val !== 0;
  return true;
}

function resolveThreads(explicit) {
  if (explicit !== undefined && explicit !== null && explicit !== '') {
    return Math.floor(Number(explicit));
  }
  return config.cppThreads;
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
        reject(new Error(`Failed to parse C++ output: ${error.message}. Raw: ${stdoutData}`));
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start C++ process: ${error.message}`));
    });
  });
}

function calculateOptionPrice(params) {
  const {
    S0 = 100,
    K = 100,
    r = 0.05,
    sigma = 0.2,
    T = 1,
    isCall = true,
    numTrials = 100000,
    threads
  } = params;

  if (nativeAddon && typeof nativeAddon.calculateOptionPrice === 'function') {
    try {
      const res = nativeAddon.calculateOptionPrice({
        S0: Number(S0),
        K: Number(K),
        r: Number(r),
        sigma: Number(sigma),
        T: Number(T),
        isCall: parseBool(isCall),
        numTrials: Math.floor(Number(numTrials)),
        threads: resolveThreads(threads)
      });
      return Promise.resolve(res);
    } catch (e) {
      // Fallback to CLI process
    }
  }

  const args = [
    Number(S0).toString(),
    Number(K).toString(),
    Number(r).toString(),
    Number(sigma).toString(),
    Number(T).toString(),
    parseBool(isCall) ? '1' : '0',
    Math.floor(Number(numTrials)).toString(),
    '0',
    resolveThreads(threads).toString()
  ];
  return runCppProcess(args);
}

function calculateAsianOptionPrice(params) {
  const {
    S0 = 100,
    K = 100,
    r = 0.05,
    sigma = 0.2,
    T = 1,
    isCall = true,
    numTrials = 100000,
    numSteps = 252,
    threads
  } = params;

  if (nativeAddon && typeof nativeAddon.calculateAsianOptionPrice === 'function') {
    try {
      const res = nativeAddon.calculateAsianOptionPrice({
        S0: Number(S0),
        K: Number(K),
        r: Number(r),
        sigma: Number(sigma),
        T: Number(T),
        isCall: parseBool(isCall),
        numTrials: Math.floor(Number(numTrials)),
        numSteps: Math.floor(Number(numSteps)),
        threads: resolveThreads(threads)
      });
      return Promise.resolve(res);
    } catch (e) {
      // Fallback to CLI process
    }
  }

  const args = [
    Number(S0).toString(),
    Number(K).toString(),
    Number(r).toString(),
    Number(sigma).toString(),
    Number(T).toString(),
    parseBool(isCall) ? '1' : '0',
    Math.floor(Number(numTrials)).toString(),
    '2',
    resolveThreads(threads).toString(),
    Math.floor(Number(numSteps)).toString()
  ];
  return runCppProcess(args);
}

function calculateGreeks(params) {
  const {
    S0 = 100,
    K = 100,
    r = 0.05,
    sigma = 0.2,
    T = 1,
    isCall = true,
    numTrials = 100000,
    threads
  } = params;

  if (nativeAddon && typeof nativeAddon.calculateGreeks === 'function') {
    try {
      const res = nativeAddon.calculateGreeks({
        S0: Number(S0),
        K: Number(K),
        r: Number(r),
        sigma: Number(sigma),
        T: Number(T),
        isCall: parseBool(isCall),
        numTrials: Math.floor(Number(numTrials)),
        threads: resolveThreads(threads)
      });
      return Promise.resolve(res);
    } catch (e) {
      // Fallback to CLI process
    }
  }

  const args = [
    Number(S0).toString(),
    Number(K).toString(),
    Number(r).toString(),
    Number(sigma).toString(),
    Number(T).toString(),
    parseBool(isCall) ? '1' : '0',
    Math.floor(Number(numTrials)).toString(),
    '3',
    resolveThreads(threads).toString()
  ];
  return runCppProcess(args);
}

function generatePricePaths(params) {
  const { S0 = 100, r = 0.05, sigma = 0.2, T = 1, numPaths = 50, numSteps = 100 } = params;

  if (nativeAddon && typeof nativeAddon.generatePricePaths === 'function') {
    try {
      const res = nativeAddon.generatePricePaths({
        S0: Number(S0),
        r: Number(r),
        sigma: Number(sigma),
        T: Number(T),
        numPaths: Math.floor(Number(numPaths)),
        numSteps: Math.floor(Number(numSteps))
      });
      return Promise.resolve(res);
    } catch (e) {
      // Fallback to CLI process
    }
  }

  const args = [
    Number(S0).toString(),
    '100',
    Number(r).toString(),
    Number(sigma).toString(),
    Number(T).toString(),
    '1',
    '1000',
    '4',
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
    threads
  } = params;

  if (nativeAddon && typeof nativeAddon.simulateDeltaHedging === 'function') {
    try {
      const res = nativeAddon.simulateDeltaHedging({
        S0: Number(S0),
        K: Number(K),
        r: Number(r),
        sigma: Number(sigma),
        T: Number(T),
        isCall: parseBool(isCall),
        numTrials: Math.floor(Number(numTrials)),
        numSteps: Math.floor(Number(numSteps)),
        rebalanceFreq: Math.floor(Number(rebalanceFreq)),
        txCostPct: Number(txCostPct),
        threads: resolveThreads(threads)
      });
      return Promise.resolve(res);
    } catch (e) {
      // Fallback to CLI process
    }
  }

  const args = [
    Number(S0).toString(),
    Number(K).toString(),
    Number(r).toString(),
    Number(sigma).toString(),
    Number(T).toString(),
    parseBool(isCall) ? '1' : '0',
    Math.floor(Number(numTrials)).toString(),
    '5',
    resolveThreads(threads).toString(),
    Math.floor(Number(numSteps)).toString(),
    Math.floor(Number(rebalanceFreq)).toString(),
    Number(txCostPct).toString()
  ];
  return runCppProcess(args);
}

module.exports = {
  calculateOptionPrice,
  calculateAsianOptionPrice,
  calculateGreeks,
  generatePricePaths,
  simulateDeltaHedging,
  monteCarloBlackScholes: calculateOptionPrice,
  monteCarloAsianOption: calculateAsianOptionPrice,
  isExecutableAvailable,
  isNativeAddonLoaded,
  getExecutablePath
};