#!/usr/bin/env node
const readline = require('readline');
const monteCarloService = require('./utils/monte_carlo_service');
const { getMarketNews } = require('./utils/market_news');
const { isDbConnected } = require('./config/db');
const SimulationHistory = require('./models/SimulationHistory');

/**
 * MonteCarloSuite Model Context Protocol (MCP) Server
 * JSON-RPC 2.0 interface exposing quantitative finance tools to AI Agents over stdio and HTTP.
 */

const SERVER_NAME = 'monte-carlo-suite-mcp';
const SERVER_VERSION = '2.0.0';

const TOOLS = [
  {
    name: 'simulate_monte_carlo',
    description: 'Calculate European option fair value, analytical Black-Scholes benchmark, standard error, and 95% confidence intervals using the multithreaded C++ Monte Carlo engine with Antithetic Variates.',
    inputSchema: {
      type: 'object',
      properties: {
        S0: { type: 'number', description: 'Spot price (default 100)' },
        K: { type: 'number', description: 'Strike price (default 100)' },
        r: { type: 'number', description: 'Risk-free interest rate (default 0.05)' },
        sigma: { type: 'number', description: 'Annualized volatility (default 0.20)' },
        T: { type: 'number', description: 'Time to maturity in years (default 1.0)' },
        isCall: { type: 'boolean', description: 'true for Call option, false for Put option (default true)' },
        numTrials: { type: 'integer', description: 'Number of simulation trials (default 100000)' }
      },
      required: []
    }
  },
  {
    name: 'price_asian_option',
    description: 'Calculate path-dependent Asian option fair value via daily arithmetic price averaging over discrete time steps.',
    inputSchema: {
      type: 'object',
      properties: {
        S0: { type: 'number', description: 'Spot price' },
        K: { type: 'number', description: 'Strike price' },
        r: { type: 'number', description: 'Risk-free interest rate' },
        sigma: { type: 'number', description: 'Annualized volatility' },
        T: { type: 'number', description: 'Time to maturity in years' },
        isCall: { type: 'boolean', description: 'true for Call, false for Put' },
        numTrials: { type: 'integer', description: 'Number of simulation trials (default 100000)' },
        numSteps: { type: 'integer', description: 'Discrete trading steps per year (default 252)' }
      },
      required: ['S0', 'K', 'r', 'sigma', 'T', 'isCall']
    }
  },
  {
    name: 'calculate_greeks',
    description: 'Compute full first and second-order option Greeks (Delta, Gamma, Vega, Theta, Rho) using finite-difference bump-and-reprice in C++.',
    inputSchema: {
      type: 'object',
      properties: {
        S0: { type: 'number', description: 'Spot price' },
        K: { type: 'number', description: 'Strike price' },
        r: { type: 'number', description: 'Risk-free interest rate' },
        sigma: { type: 'number', description: 'Annualized volatility' },
        T: { type: 'number', description: 'Time to maturity in years' },
        isCall: { type: 'boolean', description: 'true for Call, false for Put' },
        numTrials: { type: 'integer', description: 'Number of simulation trials' }
      },
      required: ['S0', 'K', 'r', 'sigma', 'T', 'isCall']
    }
  },
  {
    name: 'simulate_delta_hedging',
    description: 'Simulate dynamic discrete Delta-Hedging replication across Monte Carlo paths with transaction cost slippage, tracking error, P&L distribution, 95% VaR, and 95% CVaR.',
    inputSchema: {
      type: 'object',
      properties: {
        S0: { type: 'number', description: 'Spot price' },
        K: { type: 'number', description: 'Strike price' },
        r: { type: 'number', description: 'Risk-free interest rate' },
        sigma: { type: 'number', description: 'Annualized volatility' },
        T: { type: 'number', description: 'Time to maturity in years' },
        isCall: { type: 'boolean', description: 'true for Call, false for Put' },
        numTrials: { type: 'integer', description: 'Number of simulation paths (default 5000)' },
        numSteps: { type: 'integer', description: 'Trading steps per year (default 252)' },
        rebalanceFreq: { type: 'integer', description: 'Rebalance frequency in steps (default 1 for daily)' },
        txCostPct: { type: 'number', description: 'Transaction cost friction percentage (default 0.001 = 10 bps)' }
      },
      required: ['S0', 'K', 'r', 'sigma', 'T', 'isCall']
    }
  },
  {
    name: 'run_benchmark',
    description: 'Run side-by-side performance benchmark comparing native C++ execution latency against V8 JavaScript engine.',
    inputSchema: {
      type: 'object',
      properties: {
        S0: { type: 'number', description: 'Spot price (default 100)' },
        K: { type: 'number', description: 'Strike price (default 100)' },
        r: { type: 'number', description: 'Risk-free rate (default 0.05)' },
        sigma: { type: 'number', description: 'Volatility (default 0.20)' },
        T: { type: 'number', description: 'Time to maturity (default 1.0)' },
        isCall: { type: 'boolean', description: 'true for Call, false for Put (default true)' },
        numTrials: { type: 'integer', description: 'Number of trials (default 100000)' }
      }
    }
  },
  {
    name: 'get_market_news',
    description: 'Fetch real-time stock news headlines and catalyst intelligence from Google News RSS feed.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker symbol (e.g. AAPL, NVDA, TSLA)' },
        count: { type: 'integer', description: 'Number of news headlines to retrieve (default 5)' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'get_simulation_history',
    description: 'Retrieve persisted simulation runs, historical valuations, and parameters from MongoDB.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional stock ticker symbol filter' },
        limit: { type: 'integer', description: 'Maximum records to return (default 20)' }
      }
    }
  },
  {
    name: 'save_simulation_history',
    description: 'Persist a simulation run, parameters, and risk metrics to MongoDB.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker symbol' },
        name: { type: 'string', description: 'Scenario title or run name' },
        simulationType: { type: 'string', description: 'Type: european, asian, greeks, or delta-hedge' },
        parameters: { type: 'object', description: 'Simulation input parameters' },
        result: { type: 'object', description: 'Output metrics and summary' }
      },
      required: ['symbol', 'parameters', 'result']
    }
  }
];

async function handleToolCall(name, args = {}) {
  switch (name) {
    case 'simulate_monte_carlo':
    case 'price_european_option': {
      const payload = {
        S0: args.S0 ?? 100,
        K: args.K ?? 100,
        r: args.r ?? 0.05,
        sigma: args.sigma ?? 0.20,
        T: args.T ?? 1.0,
        isCall: args.isCall !== undefined ? args.isCall : true,
        numTrials: args.numTrials ?? 100000,
        validateWithAnalytical: true
      };
      const result = await monteCarloService.calculateOptionPrice(payload);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'price_asian_option': {
      const payload = {
        S0: args.S0 ?? 100,
        K: args.K ?? 100,
        r: args.r ?? 0.05,
        sigma: args.sigma ?? 0.20,
        T: args.T ?? 1.0,
        isCall: args.isCall !== undefined ? args.isCall : true,
        numTrials: args.numTrials ?? 100000,
        numSteps: args.numSteps ?? 252
      };
      const result = await monteCarloService.calculateAsianOptionPrice(payload);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'calculate_greeks': {
      const payload = {
        S0: args.S0 ?? 100,
        K: args.K ?? 100,
        r: args.r ?? 0.05,
        sigma: args.sigma ?? 0.20,
        T: args.T ?? 1.0,
        isCall: args.isCall !== undefined ? args.isCall : true,
        numTrials: args.numTrials ?? 100000
      };
      const result = await monteCarloService.calculateGreeks(payload);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'simulate_delta_hedging': {
      const payload = {
        S0: args.S0 ?? 100,
        K: args.K ?? 100,
        r: args.r ?? 0.05,
        sigma: args.sigma ?? 0.20,
        T: args.T ?? 1.0,
        isCall: args.isCall !== undefined ? args.isCall : true,
        numTrials: args.numTrials ?? 5000,
        numSteps: args.numSteps ?? 252,
        rebalanceFreq: args.rebalanceFreq ?? 1,
        txCostPct: args.txCostPct ?? 0.001
      };
      const result = await monteCarloService.simulateDeltaHedging(payload);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'run_benchmark': {
      const payload = {
        S0: args.S0 ?? 100,
        K: args.K ?? 100,
        r: args.r ?? 0.05,
        sigma: args.sigma ?? 0.20,
        T: args.T ?? 1.0,
        isCall: args.isCall !== undefined ? args.isCall : true,
        numTrials: args.numTrials ?? 100000
      };
      const [cppResult, jsResult] = await Promise.all([
        monteCarloService.calculateOptionPrice({ ...payload, validateWithAnalytical: true }),
        Promise.resolve(monteCarloService.calculateOptionPriceJS(payload))
      ]);
      const cppMs = cppResult.executionTimeMs || 0.5;
      const jsMs = jsResult.executionTimeMs || 10.0;
      const speedup = Number((jsMs / cppMs).toFixed(2));
      const response = {
        trials: payload.numTrials,
        cppExecutionTimeMs: cppMs,
        jsExecutionTimeMs: jsMs,
        speedupMultiplier: speedup,
        cppThroughputPathsPerSec: Math.round((payload.numTrials / (cppMs / 1000))),
        jsThroughputPathsPerSec: Math.round((payload.numTrials / (jsMs / 1000))),
        cppPrice: cppResult.optionPrice,
        jsPrice: jsResult.optionPrice
      };
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    }

    case 'get_market_news': {
      const news = await getMarketNews(args.symbol || 'AAPL', args.count || 5);
      return { content: [{ type: 'text', text: JSON.stringify(news, null, 2) }] };
    }

    case 'get_simulation_history': {
      if (!isDbConnected()) {
        return { content: [{ type: 'text', text: JSON.stringify({ message: 'MongoDB offline', history: [] }) }] };
      }
      const filter = {};
      if (args.symbol) filter.symbol = String(args.symbol).toUpperCase();
      const history = await SimulationHistory.find(filter)
        .sort({ createdAt: -1 })
        .limit(args.limit || 20);
      return { content: [{ type: 'text', text: JSON.stringify(history, null, 2) }] };
    }

    case 'save_simulation_history': {
      if (!isDbConnected()) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'MongoDB is offline' }) }] };
      }
      const newSim = new SimulationHistory({
        symbol: String(args.symbol || 'AAPL').toUpperCase(),
        name: args.name || `${args.symbol || 'AAPL'} Simulation`,
        simulationType: args.simulationType || 'european',
        parameters: args.parameters,
        result: args.result
      });
      const saved = await newSim.save();
      return { content: [{ type: 'text', text: JSON.stringify(saved, null, 2) }] };
    }

    default:
      throw new Error(`Unknown MCP tool: ${name}`);
  }
}

// Handle JSON-RPC message
async function handleMessage(msg) {
  const { id = 1, method, params } = msg || {};

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
      }
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS }
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params || {};
    try {
      const toolRes = await handleToolCall(name, toolArgs);
      return {
        jsonrpc: '2.0',
        id,
        result: toolRes
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err.message }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  };
}

// Standard stdio interface for CLI MCP clients
if (require.main === module) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const request = JSON.parse(trimmed);
      const res = await handleMessage(request);
      process.stdout.write(JSON.stringify(res) + '\n');
    } catch (err) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Parse error: ${err.message}` }
        }) + '\n'
      );
    }
  });
}

module.exports = {
  TOOLS,
  handleToolCall,
  handleMessage
};
