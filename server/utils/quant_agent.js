const { getMarketNews } = require('./market_news');
const monteCarloService = require('./monte_carlo_service');
const llmProvider = require('./llm_provider');
const config = require('../config');

const MODEL_NAME = llmProvider.getModelName();

const TEMPORAL_SYSTEM_NOTE =
  'IMPORTANT: Simulated price paths use simulationTime ISO timestamps (synthetic replay). Live news from get_market_news uses wall-clock fetchedAt/pubDateIso and may be from a different calendar date. Always compare events using explicit ISO 8601 UTC timestamps — never assume news and simulated ticks are contemporaneous.';

const QUANT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_market_news',
      description:
        'Fetch breaking financial news headlines, publication dates, and sources for a stock ticker from live web search RSS feeds.',
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
      description:
        'Compute option risk sensitivities (Delta, Gamma, Vega, Theta, Rho) using multi-threaded C++ engine.',
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

async function runToolLoop(messages, { skipTools = false, jsonMode = false } = {}) {
  const chatOpts = { jsonMode };
  if (!skipTools) {
    chatOpts.tools = QUANT_TOOLS;
  }

  const firstData = await llmProvider.chat(messages, chatOpts);
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

    const secondData = await llmProvider.chat(messages, { jsonMode });
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
 * Runs the LLM quant agent with optional tool-calling loop (non-streaming).
 */
async function runQuantAgent(userPrompt, options = {}) {
  const { skipTools = false } = options;

  const messages = [
    {
      role: 'system',
      content: `You are an autonomous Senior Quantitative Risk Analyst & MFT Volatility Trader. The user message already contains current C++ Monte Carlo prices, Greeks, and market news headlines — use that embedded data for your analysis. Do NOT call tools to re-fetch the same symbol or parameters unless the user explicitly asks for different inputs. Tools (get_market_news, calculate_greeks) are for follow-up questions only.

Respond with valid JSON only: {"recommendation":"BUY|SELL|HOLD","reasoning":"..."}. Put your full plain-English analysis (bullet points, comparisons, justification) in the reasoning field. ${TEMPORAL_SYSTEM_NOTE}`
    },
    {
      role: 'user',
      content: userPrompt
    }
  ];

  const startT = Date.now();

  try {
    const { finalContent, executedToolLogs, usage } = await runToolLoop(messages, {
      skipTools,
      jsonMode: true
    });

    return {
      status: 'success',
      executedToolCalls: executedToolLogs,
      quantAnalysis: finalContent,
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
      quantAnalysis: `LLM tool-call fallback: Unable to execute live LLM loop (${err.message}). Defaulting to quantitative rules.`,
      gemmaAnalysis: `LLM tool-call fallback: Unable to execute live LLM loop (${err.message}). Defaulting to quantitative rules.`
    };
  }
}

/**
 * Runs the LLM quant agent with Real-Time Streaming (SSE).
 * @param {string} userPrompt - User prompt containing current C++ metrics and news
 * @param {Function} onToken - Callback for streamed tokens
 * @param {Object} options - Options
 */
async function runQuantAgentStream(userPrompt, onToken, options = {}) {
  const messages = [
    {
      role: 'system',
      content: `You are an autonomous Senior Quantitative Risk Analyst & MFT Volatility Trader. The user message contains C++ Monte Carlo prices, Greeks, and market news. Provide a clear, sharp, plain-English analysis for the trader with:
1. Executive Risk Recommendation (BUY, SELL, or HOLD).
2. Bulleted breakdown of what happens if stock drops or volatility spikes.
3. European vs Asian path discount comparison.
4. Market news catalyst review.
${TEMPORAL_SYSTEM_NOTE}`
    },
    {
      role: 'user',
      content: userPrompt
    }
  ];

  const startT = Date.now();
  const streamResult = await llmProvider.chatStream(messages, onToken, { jsonMode: false });
  const latencyMs = Date.now() - startT;

  return {
    status: 'success',
    fullText: streamResult.content,
    latencyMs,
    provider: streamResult.provider,
    model: streamResult.model || llmProvider.getModelName()
  };
}

module.exports = {
  runQuantAgent,
  runQuantAgentStream,
  runGemmaAgent: runQuantAgent,
  QUANT_TOOLS,
  GEMMA_TOOLS: QUANT_TOOLS,
  MODEL_NAME
};
