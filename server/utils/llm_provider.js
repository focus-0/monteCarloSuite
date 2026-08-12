/**
 * LLM provider abstraction — supports local Ollama (default), Groq, and Google Gemini.
 * All env-backed settings come from server/config.js.
 */

const { Agent, fetch: undiciFetch } = require('undici');
const config = require('../config');
const {
  ollama,
  groq,
  gemini,
  getLlmProviderName,
  getLlmModelName,
  validateLlmConfig
} = config;

let ollamaDispatcher;
function getOllamaDispatcher() {
  if (!ollamaDispatcher) {
    const t = ollama.timeoutMs;
    ollamaDispatcher = new Agent({
      headersTimeout: t,
      bodyTimeout: t,
      connectTimeout: t || 60_000
    });
  }
  return ollamaDispatcher;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  if (timeoutMs === 0) {
    return undiciFetch(url, { ...options, dispatcher: getOllamaDispatcher() });
  }
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

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

function normalizeToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((tc, i) => ({
    id: tc.id || `call_${i}`,
    type: tc.type || 'function',
    function: {
      name: tc.function?.name || '',
      arguments: parseToolArguments(tc.function?.arguments)
    }
  }));
}

function extractUsageFromOllama(raw, latencyMs) {
  const evalCount = raw?.eval_count || 0;
  const evalDurationNs = raw?.eval_duration || 0;
  if (evalCount && evalDurationNs) {
    return {
      evalCount,
      tokensPerSec: parseFloat((evalCount / (evalDurationNs / 1e9)).toFixed(1))
    };
  }
  if (evalCount && latencyMs > 0) {
    return {
      evalCount,
      tokensPerSec: parseFloat((evalCount / (latencyMs / 1000)).toFixed(1))
    };
  }
  return { evalCount: 0, tokensPerSec: null };
}

function extractUsageFromGroq(raw, latencyMs) {
  const evalCount = raw?.usage?.completion_tokens || 0;
  const tokensPerSec =
    evalCount && latencyMs > 0
      ? parseFloat((evalCount / (latencyMs / 1000)).toFixed(1))
      : null;
  return { evalCount, tokensPerSec };
}

const extractUsageFromOpenAICompat = extractUsageFromGroq;

function convertMessagesForGroq(messages) {
  const out = [];
  let pendingToolCalls = [];

  for (const msg of messages) {
    if (msg.role === 'tool') {
      const idx = pendingToolCalls.findIndex((tc) => tc.function.name === msg.name);
      const matched =
        idx >= 0 ? pendingToolCalls.splice(idx, 1)[0] : pendingToolCalls.shift();
      out.push({
        role: 'tool',
        tool_call_id: msg.tool_call_id || matched?.id || `call_${out.length}`,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      });
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const toolCalls = msg.tool_calls.map((tc, i) => ({
        id: tc.id || `call_${i}`,
        type: 'function',
        function: {
          name: tc.function?.name || '',
          arguments:
            typeof tc.function?.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function?.arguments || {})
        }
      }));
      pendingToolCalls = toolCalls;
      out.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: toolCalls
      });
      continue;
    }

    pendingToolCalls = [];
    out.push({
      role: msg.role,
      content: msg.content
    });
  }

  return out;
}

async function openAICompatChat(messages, { tools } = {}, providerConfig, providerLabel) {
  const apiKey = providerConfig.apiKey;
  if (!apiKey) {
    throw new Error(
      `LLM_PROVIDER=${providerLabel} but ${providerLabel.toUpperCase()}_API_KEY is not set. Get a key at ${providerConfig.keysUrl}`
    );
  }

  const startT = Date.now();
  const body = {
    model: providerConfig.model,
    messages: convertMessagesForGroq(messages),
    stream: false
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetchWithTimeout(
    providerConfig.apiUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    },
    providerConfig.timeoutMs
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(
      `${providerLabel} API error: ${res.status} ${res.statusText}${errBody ? ` — ${errBody.slice(0, 200)}` : ''}`
    );
  }

  const raw = await res.json();
  const assistant = raw.choices?.[0]?.message || {};
  const latencyMs = Date.now() - startT;

  return {
    message: {
      role: 'assistant',
      content: assistant.content || '',
      tool_calls: normalizeToolCalls(assistant.tool_calls)
    },
    usage: extractUsageFromOpenAICompat(raw, latencyMs),
    latencyMs,
    raw
  };
}

async function ollamaChat(messages, { tools } = {}) {
  const startT = Date.now();
  const body = {
    model: ollama.model,
    messages,
    stream: false
  };
  if (tools?.length) {
    body.tools = tools;
  }

  const res = await fetchWithTimeout(
    ollama.chatUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    ollama.timeoutMs
  );

  if (!res.ok) {
    throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();
  const assistant = raw.message || {};
  const latencyMs = Date.now() - startT;

  return {
    message: {
      role: 'assistant',
      content: assistant.content || '',
      tool_calls: normalizeToolCalls(assistant.tool_calls)
    },
    usage: extractUsageFromOllama(raw, latencyMs),
    latencyMs,
    raw
  };
}

async function groqChat(messages, options = {}) {
  return openAICompatChat(messages, options, groq, 'groq');
}

async function geminiChat(messages, options = {}) {
  return openAICompatChat(messages, options, gemini, 'gemini');
}

/**
 * Send a chat completion request to the configured LLM provider.
 * @returns {{ message: { role, content, tool_calls? }, usage: { evalCount, tokensPerSec }, latencyMs, raw }}
 */
async function chat(messages, options = {}) {
  validateLlmConfig();
  const provider = getLlmProviderName();
  if (provider === 'groq') {
    return groqChat(messages, options);
  }
  if (provider === 'gemini') {
    return geminiChat(messages, options);
  }
  return ollamaChat(messages, options);
}

module.exports = {
  chat,
  getProviderName: getLlmProviderName,
  getModelName: getLlmModelName,
  validateProviderConfig: validateLlmConfig,
  OLLAMA_MODEL: ollama.model,
  GROQ_MODEL: groq.model,
  GEMINI_MODEL: gemini.model
};
