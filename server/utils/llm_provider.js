/**
 * LLM Provider Abstraction — Supports Local Ollama (Gemma), Groq, and Google Gemini API.
 * Includes auto-detection/startup for Ollama and Real-Time Streaming support.
 */

const { Agent, fetch: undiciFetch } = require('undici');
const config = require('../config');
const { ensureOllamaRunning, getActiveOllamaModel } = require('./ollama_runner');

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

function extractUsageFromOpenAICompat(raw, latencyMs) {
  const evalCount = raw?.usage?.completion_tokens || 0;
  const tokensPerSec =
    evalCount && latencyMs > 0
      ? parseFloat((evalCount / (latencyMs / 1000)).toFixed(1))
      : null;
  return { evalCount, tokensPerSec };
}

function convertMessagesForOpenAI(messages) {
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
        name: msg.name || matched?.function?.name || 'tool',
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

async function openAICompatChat(messages, { tools, jsonMode } = {}, providerConfig, providerLabel) {
  const apiKey = providerConfig.apiKey;
  if (!apiKey) {
    throw new Error(
      `LLM_PROVIDER=${providerLabel} but ${providerLabel.toUpperCase()}_API_KEY is not set. Get a key at ${providerConfig.keysUrl}`
    );
  }

  const startT = Date.now();
  const body = {
    model: providerConfig.model,
    messages: convertMessagesForOpenAI(messages),
    stream: false
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
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

async function ollamaChat(messages, { tools, jsonMode } = {}) {
  // Ensure Ollama daemon is active & discover model tag
  const ollamaStatus = await ensureOllamaRunning();
  const activeModel = ollamaStatus.model || getActiveOllamaModel();

  const startT = Date.now();
  const body = {
    model: activeModel,
    messages,
    stream: false
  };
  if (tools?.length) {
    body.tools = tools;
  }
  if (jsonMode) {
    body.format = 'json';
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

/**
 * Send a chat completion request to the configured LLM provider.
 */
async function chat(messages, options = {}) {
  validateLlmConfig();
  const provider = getLlmProviderName();
  if (provider === 'groq') {
    return openAICompatChat(messages, options, groq, 'groq');
  }
  if (provider === 'gemini') {
    return openAICompatChat(messages, options, gemini, 'gemini');
  }
  return ollamaChat(messages, options);
}

/**
 * Stream chat tokens in real-time from the active LLM provider (Ollama / Gemini).
 * @param {Array} messages - Chat messages
 * @param {Function} onToken - Callback for each streamed token string
 * @param {Object} options - Options (jsonMode, etc.)
 */
async function chatStream(messages, onToken, options = {}) {
  validateLlmConfig();
  const provider = getLlmProviderName();

  if (provider === 'gemini' || provider === 'groq') {
    const providerConfig = provider === 'gemini' ? gemini : groq;
    const apiKey = providerConfig.apiKey;
    if (!apiKey) {
      throw new Error(`API key for ${provider} is not set.`);
    }

    const body = {
      model: providerConfig.model,
      messages: convertMessagesForOpenAI(messages),
      stream: true
    };
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(providerConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${provider} streaming error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              if (onToken) onToken(delta, fullText);
            }
          } catch {
            // Ignore partial SSE chunk parse error
          }
        }
      }
    }

    return { content: fullText, provider };
  }

  // Local Ollama streaming
  await ensureOllamaRunning();
  const activeModel = getActiveOllamaModel();

  const body = {
    model: activeModel,
    messages,
    stream: true
  };
  if (options.jsonMode) {
    body.format = 'json';
  }

  const res = await fetch(ollama.chatUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`Ollama streaming error (${res.status}): ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        const delta = parsed.message?.content || '';
        if (delta) {
          fullText += delta;
          if (onToken) onToken(delta, fullText);
        }
      } catch {
        // Ignore partial chunk parse error
      }
    }
  }

  return { content: fullText, provider: 'ollama', model: activeModel };
}

module.exports = {
  chat,
  chatStream,
  getProviderName: getLlmProviderName,
  getModelName: getLlmModelName,
  validateProviderConfig: validateLlmConfig,
  OLLAMA_MODEL: ollama.model,
  GROQ_MODEL: groq.model,
  GEMINI_MODEL: gemini.model
};
