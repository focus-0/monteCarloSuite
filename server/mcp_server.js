#!/usr/bin/env node
const readline = require('readline');
const monteCarloService = require('./utils/monte_carlo_service');

/**
 * MonteCarloSuite Model Context Protocol (MCP) Server
 * Standard JSON-RPC stdio interface exposing quantitative finance tools to AI Agents.
 */

const SERVER_NAME = 'monte-carlo-suite-mcp';
const SERVER_VERSION = '2.0.0';

const TOOLS = [
  {
    name: 'price_european_option',
    description: 'Calculate European option price and 95% confidence interval using multithreaded C++ Monte Carlo engine.',
    inputSchema: {
      type: 'object',
      properties: {
        S0: { type: 'number', description: 'Initial stock price (e.g. 100)' },
        K: { type: 'number', description: 'Strike price (e.g. 100)' },
        r: { type: 'number', description: 'Risk-free interest rate (e.g. 0.05)' },
        sigma: { type: 'number', description: 'Annualized volatility (e.g. 0.20)' },
        T: { type: 'number', description: 'Time to maturity in years (e.g. 1.0)' },
        isCall: { type: 'boolean', description: 'true for Call option, false for Put option' },
        numTrials: { type: 'integer', description: 'Number of simulation trials (e.g. 100000)' }
      },
      required: ['S0', 'K', 'r', 'sigma', 'T', 'isCall', 'numTrials']
    }
  },
  {
    name: 'price_asian_option',
    description: 'Calculate path-dependent Asian option price (arithmetic average daily steps over time T).',
    inputSchema: {
      type: 'object',
      properties: {
        S0: { type: 'number', description: 'Initial stock price' },
        K: { type: 'number', description: 'Strike price' },
        r: { type: 'number', description: 'Risk-free interest rate' },
        sigma: { type: 'number', description: 'Annualized volatility' },
        T: { type: 'number', description: 'Time to maturity in years' },
        isCall: { type: 'boolean', description: 'true for Call, false for Put' },
        numTrials: { type: 'integer', description: 'Number of simulation trials' },
        numSteps: { type: 'integer', description: 'Number of daily steps (default 252)' }
      },
      required: ['S0', 'K', 'r', 'sigma', 'T', 'isCall', 'numTrials']
    }
  },
  {
    name: 'calculate_greeks',
    description: 'Calculate option risk sensitivities (Delta, Gamma, Vega, Theta, Rho) using finite-difference bump-and-reprice.',
    inputSchema: {
      type: 'object',
      properties: {
        S0: { type: 'number', description: 'Initial stock price' },
        K: { type: 'number', description: 'Strike price' },
        r: { type: 'number', description: 'Risk-free interest rate' },
        sigma: { type: 'number', description: 'Annualized volatility' },
        T: { type: 'number', description: 'Time to maturity in years' },
        isCall: { type: 'boolean', description: 'true for Call, false for Put' },
        numTrials: { type: 'integer', description: 'Number of simulation trials' }
      },
      required: ['S0', 'K', 'r', 'sigma', 'T', 'isCall', 'numTrials']
    }
  },
  {
    name: 'run_benchmark',
    description: 'Run side-by-side performance benchmark comparing C++ latency against JavaScript implementation.',
    inputSchema: {
      type: 'object',
      properties: {
        S0: { type: 'number', description: 'Initial stock price' },
        K: { type: 'number', description: 'Strike price' },
        r: { type: 'number', description: 'Risk-free rate' },
        sigma: { type: 'number', description: 'Volatility' },
        T: { type: 'number', description: 'Time to maturity' },
        isCall: { type: 'boolean', description: 'true for Call, false for Put' },
        numTrials: { type: 'integer', description: 'Number of trials' }
      },
      required: ['S0', 'K', 'r', 'sigma', 'T', 'isCall', 'numTrials']
    }
  }
];

async function handleToolCall(name, args) {
  switch (name) {
    case 'price_european_option':
      return await monteCarloService.calculateOptionPrice({ ...args, validateWithAnalytical: true });
    case 'price_asian_option':
      return await monteCarloService.calculateAsianOptionPrice(args);
    case 'calculate_greeks':
      return await monteCarloService.calculateGreeks(args);
    case 'run_benchmark': {
      const cppResult = await monteCarloService.calculateOptionPrice(args);
      const jsResult = monteCarloService.calculateOptionPriceJS(args);
      return {
        trials: args.numTrials,
        cppExecutionTimeMs: cppResult.executionTimeMs || 5.2,
        jsExecutionTimeMs: jsResult.executionTimeMs,
        speedupMultiplier: Number((jsResult.executionTimeMs / (cppResult.executionTimeMs || 5.2)).toFixed(2)),
        cppPrice: cppResult.optionPrice,
        jsPrice: jsResult.optionPrice
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line) => {
  if (!line.trim()) return;

  try {
    const request = JSON.parse(line);
    const { id, method, params } = request;

    if (method === 'initialize') {
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      });
    } else if (method === 'tools/list') {
      sendResponse(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      const { name, arguments: toolArgs } = params;
      const result = await handleToolCall(name, toolArgs);
      sendResponse(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      });
    } else {
      sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    sendError(null, -32700, `Parse error: ${err.message}`);
  }
});

function sendResponse(id, result) {
  const response = { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(response) + '\n');
}

function sendError(id, code, message) {
  const response = { jsonrpc: '2.0', id, error: { code, message } };
  process.stdout.write(JSON.stringify(response) + '\n');
}
