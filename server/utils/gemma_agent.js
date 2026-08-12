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

const TRADING_ACTIONS = ['OPEN_POSITION', 'BUY_HEDGE', 'SELL_HEDGE', 'CLOSE_OPTIONS', 'CLOSE_ALL', 'HOLD'];

function parseTradingDecision(content) {
  if (!content || typeof content !== 'string') {
    return { action: 'HOLD', quantity: 0, reason: 'No response from agent.', confidence: 0 };
  }

  const jsonMatch = content.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const action = String(parsed.action || 'HOLD').toUpperCase();
      if (TRADING_ACTIONS.includes(action)) {
        return {
          action,
          quantity: Math.max(0, parseInt(parsed.quantity, 10) || 0),
          reason: parsed.reason || content.slice(0, 200),
          confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5))
        };
      }
    } catch (_) {
      // fall through to heuristic parsing
    }
  }

  const upper = content.toUpperCase();
  if (upper.includes('OPEN_POSITION') || upper.includes('OPEN POSITION')) {
    return { action: 'OPEN_POSITION', quantity: 10, reason: content.slice(0, 200), confidence: 0.5 };
  }
  if (upper.includes('CLOSE_ALL') || upper.includes('CLOSE ALL') || upper.includes('LIQUIDATE')) {
    return { action: 'CLOSE_ALL', quantity: 0, reason: content.slice(0, 200), confidence: 0.5 };
  }
  if (upper.includes('BUY_HEDGE') || upper.includes('BUY HEDGE')) {
    return { action: 'BUY_HEDGE', quantity: 50, reason: content.slice(0, 200), confidence: 0.5 };
  }
  if (upper.includes('SELL_HEDGE') || upper.includes('SELL HEDGE')) {
    return { action: 'SELL_HEDGE', quantity: 50, reason: content.slice(0, 200), confidence: 0.5 };
  }
  return { action: 'HOLD', quantity: 0, reason: content.slice(0, 200), confidence: 0.5 };
}

/**
 * LLM trading step for MFT Arena — returns a structured trade decision.
 */
async function runGemmaTradingStep(observation, conversationHistory = []) {
  const prompt = `You are an autonomous MFT volatility trader managing a live intraday portfolio.

CURRENT MARKET OBSERVATION:
${JSON.stringify(observation, null, 2)}

Respond with ONLY a JSON object (no markdown) using this schema:
{
  "action": "OPEN_POSITION" | "BUY_HEDGE" | "SELL_HEDGE" | "CLOSE_OPTIONS" | "CLOSE_ALL" | "HOLD",
  "quantity": <number of option contracts OR shares depending on action>,
  "reason": "<one sentence rationale>",
  "confidence": <0.0 to 1.0>
}

Rules:
- Use OPEN_POSITION only when optionContractsHeld is 0 (default quantity: 10 contracts).
- Use BUY_HEDGE / SELL_HEDGE to adjust stock hedge when delta drift or news requires rebalancing (quantity = shares).
- Use CLOSE_ALL on the final minute or when risk is unacceptable.
- Use HOLD when no action is needed.
- Call tools if you need fresh news or Greeks before deciding.`;

  const messages = [
    {
      role: 'system',
      content: `You are an autonomous MFT volatility trader. Monitor portfolio risk and issue precise trade orders. Always finish with a single JSON trade decision object. ${TEMPORAL_SYSTEM_NOTE}`
    },
    ...conversationHistory,
    { role: 'user', content: prompt }
  ];

  const startT = Date.now();

  try {
    const firstData = await llmProvider.chat(messages, { tools: GEMMA_TOOLS });
    const assistantMsg = firstData.message || {};
    const executedToolLogs = [];
    let content = assistantMsg.content || '';

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

      messages.push({
        role: 'user',
        content: 'Based on the tool results above, respond with ONLY the JSON trade decision object.'
      });

      const secondData = await llmProvider.chat(messages);
      content = secondData.message?.content || assistantMsg.content || '';
      const decision = parseTradingDecision(content);

      return {
        status: 'success',
        decision,
        rawResponse: content,
        executedToolCalls: executedToolLogs,
        latencyMs: Date.now() - startT,
        conversationAppend: [
          { role: 'user', content: prompt },
          assistantMsg,
          ...executedToolLogs.map((r, i) => ({
            role: 'tool',
            content: JSON.stringify(r),
            name: assistantMsg.tool_calls[i]?.function?.name,
            tool_call_id: assistantMsg.tool_calls[i]?.id
          })),
          { role: 'assistant', content }
        ]
      };
    }

    const decision = parseTradingDecision(content);

    return {
      status: 'success',
      decision,
      rawResponse: content,
      executedToolCalls: [],
      latencyMs: Date.now() - startT,
      conversationAppend: [
        { role: 'user', content: prompt },
        { role: 'assistant', content }
      ]
    };
  } catch (err) {
    console.warn('LLM Trading Step Warning:', err.message);
    return {
      status: 'fallback',
      decision: { action: 'HOLD', quantity: 0, reason: `LLM unavailable: ${err.message}`, confidence: 0 },
      rawResponse: '',
      executedToolCalls: [],
      error: err.message,
      latencyMs: Date.now() - startT,
      conversationAppend: []
    };
  }
}

module.exports = {
  runGemmaAgent,
  runGemmaTradingStep,
  parseTradingDecision,
  TRADING_ACTIONS,
  GEMMA_TOOLS,
  MODEL_NAME
};
