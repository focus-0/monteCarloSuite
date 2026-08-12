const { getMarketNews } = require('./market_news');
const monteCarloService = require('./monte_carlo_service');
const llmProvider = require('./llm_provider');
const config = require('../config');

const MODEL_NAME = llmProvider.getModelName();

const TEMPORAL_SYSTEM_NOTE = 'IMPORTANT: Simulated price paths use simulationTime ISO timestamps (synthetic replay). Live news from get_market_news uses wall-clock fetchedAt/pubDateIso and may be from a different calendar date. Always compare events using explicit ISO 8601 UTC timestamps — never assume news and simulated ticks are contemporaneous.';

/**
 * Tool Definitions registered with the LLM (Ollama / Groq OpenAI format)
 */
const GEMMA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_market_news',
      description: 'Fetch breaking financial news headlines, publication dates, and sources for a stock ticker from live web search RSS feeds.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'Stock ticker symbol (e.g. AAPL, NVDA, TSLA)' }
        },
        required: ['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'calculate_greeks',
      description: 'Compute option risk sensitivities (Delta, Gamma, Vega, Theta, Rho) using multi-threaded C++ engine.',
      parameters: {
        type: 'object',
        properties: {
          S0: { type: 'number', description: 'Spot price' },
          K: { type: 'number', description: 'Strike price' },
          r: { type: 'number', description: 'Risk-free rate' },
          sigma: { type: 'number', description: 'Volatility' },
          T: { type: 'number', description: 'Time to maturity in years' },
          isCall: { type: 'boolean', description: 'true for Call, false for Put' }
        },
        required: ['S0', 'K', 'r', 'sigma', 'T', 'isCall']
      }
    }
  }
];

function parseToolArguments(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }
  return args || {};
}

/**
 * Executes a tool called autonomously by the LLM agent
 */
async function executeToolCall(toolCall) {
  const { name, arguments: rawArgs } = toolCall.function || {};
  const args = parseToolArguments(rawArgs);

  if (name === 'get_market_news') {
    const newsResult = await getMarketNews(args.symbol || config.defaultSymbol, config.agent.newsDefaultCount);
    return {
      toolName: name,
      symbol: args.symbol,
      dataSource: newsResult.dataSource,
      fetchedAt: newsResult.fetchedAt,
      fetchedAtDisplay: newsResult.fetchedAtDisplay,
      articles: newsResult.articles.map((a) => ({
        title: a.title,
        source: a.source,
        pubDateIso: a.pubDateIso,
        pubDateFormatted: a.pubDateFormatted,
        ageMinutes: a.ageMinutes
      }))
    };
  } else if (name === 'calculate_greeks') {
    const greeksResult = await monteCarloService.calculateGreeks({
      S0: args.S0 || 100,
      K: args.K || 100,
      r: args.r || 0.05,
      sigma: args.sigma || 0.20,
      T: args.T || 1.0,
      isCall: args.isCall !== undefined ? args.isCall : true,
      numTrials: config.agent.greeksNumTrials
    });
    return {
      toolName: name,
      computedAt: new Date().toISOString(),
      optionPrice: greeksResult.optionPrice,
      greeks: greeksResult.greeks,
      executionTimeMs: greeksResult.executionTimeMs
    };
  } else {
    throw new Error(`Unknown tool call: ${name}`);
  }
}

async function runToolLoop(messages) {
  const firstData = await llmProvider.chat(messages, { tools: GEMMA_TOOLS });
  const assistantMsg = firstData.message || {};
  const executedToolLogs = [];

  if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
    messages.push(assistantMsg);

    for (const toolCall of assistantMsg.tool_calls) {
      const toolResult = await executeToolCall(toolCall);
      executedToolLogs.push(toolResult);
      messages.push({
        role: 'tool',
        content: JSON.stringify(toolResult),
        name: toolCall.function.name,
        tool_call_id: toolCall.id
      });
    }

    const secondData = await llmProvider.chat(messages);
    return {
      assistantMsg,
      finalContent: secondData.message?.content || assistantMsg.content || 'Analysis complete.',
      executedToolLogs,
      usage: secondData.usage || firstData.usage
    };
  }

  return {
    assistantMsg,
    finalContent: assistantMsg.content || 'Analysis complete.',
    executedToolLogs,
    usage: firstData.usage
  };
}

/**
 * Runs the LLM agent with autonomous function & tool calling loop
 */
async function runGemmaAgent(userPrompt) {
  const messages = [
    {
      role: 'system',
      content: `You are an autonomous Senior Quantitative Risk Analyst & MFT Volatility Trader. You have access to tools to fetch live web market news and compute sub-2ms C++ Greeks. When answering risk or market questions, call the tools to get real data before forming your final trading decision. ${TEMPORAL_SYSTEM_NOTE}`
    },
    {
      role: 'user',
      content: userPrompt
    }
  ];

  const startT = Date.now();

  try {
    const { finalContent, executedToolLogs, usage } = await runToolLoop(messages);

    return {
      status: 'success',
      executedToolCalls: executedToolLogs,
      gemmaAnalysis: finalContent,
      latencyMs: Date.now() - startT,
      evalCount: usage?.evalCount || 0,
      tokensPerSec: usage?.tokensPerSec ?? null
    };
  } catch (err) {
    console.warn('LLM Tool Agent Warning:', err.message);
    return {
      status: 'fallback',
      executedToolCalls: [],
      error: err.message,
      gemmaAnalysis: `LLM tool-call fallback: Unable to execute live LLM loop (${err.message}). Defaulting to quantitative rules.`
    };
  }
}

module.exports = {
  runGemmaAgent,
  GEMMA_TOOLS,
  MODEL_NAME
};
