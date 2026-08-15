/**
 * Central configuration — single source of truth for env-backed settings.
 * Defaults live here only; document all vars in server/.env.example.
 */

function env(key, defaultValue = '') {
  const v = process.env[key];
  if (v !== undefined && v !== '') return v;
  return defaultValue;
}

function envInt(key, defaultValue) {
  const v = process.env[key];
  if (v !== undefined && v !== '') {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n)) return n;
  }
  return defaultValue;
}

function envFloat(key, defaultValue) {
  const v = process.env[key];
  if (v !== undefined && v !== '') {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return defaultValue;
}

function resolveLlmProvider() {
  if (process.env.NODE_ENV !== 'production') {
    return 'ollama';
  }
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === 'google') return 'gemini';
  if (explicit) return explicit;
  return 'gemini';
}

const ollamaUrl = env('OLLAMA_URL', 'http://localhost:11434').replace(/\/$/, '');

const config = {
  port: envInt('PORT', 5001),
  nodeEnv: env('NODE_ENV', 'development'),
  mongoUri: env('MONGO_URI', 'mongodb://localhost:27017/montecarlo'),
  mongoDbName: env('MONGO_DB_NAME', 'montecarlo'),
  mongoTimeoutMs: envInt('MONGO_TIMEOUT_MS', 3000),

  corsOrigins: env(
    'CORS_ORIGINS',
    'http://localhost:3000,https://montecarlosuitefe.onrender.com'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  bodyLimit: env('BODY_LIMIT', '10kb'),

  rateLimit: {
    windowMs: envInt('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    maxProduction: envInt('RATE_LIMIT_MAX_PRODUCTION', 1000),
    maxDevelopment: envInt('RATE_LIMIT_MAX_DEVELOPMENT', 10000)
  },

  clientBuildPath: env('CLIENT_BUILD_PATH', ''),

  llmProvider: resolveLlmProvider(),

  ollama: {
    url: ollamaUrl,
    chatUrl: `${ollamaUrl}/api/chat`,
    model: env('OLLAMA_MODEL', env('GEMMA_MODEL', 'gemma4:12b')),
    // 0 = no timeout (Node undici default is 300s — too short for local 12B inference)
    timeoutMs: envInt('OLLAMA_TIMEOUT_MS', 0)
  },

  groq: {
    apiKey: env('GROQ_API_KEY', ''),
    model: env('GROQ_MODEL', 'llama-3.3-70b-versatile'),
    apiUrl: env('GROQ_API_URL', 'https://api.groq.com/openai/v1/chat/completions'),
    keysUrl: env('GROQ_KEYS_URL', 'https://console.groq.com/keys'),
    timeoutMs: envInt('GROQ_TIMEOUT_MS', 120000)
  },

  gemini: {
    apiKey: env('GEMINI_API_KEY', ''),
    model: env('GEMINI_MODEL', 'gemini-2.5-flash'),
    apiUrl: env(
      'GEMINI_API_URL',
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    ),
    keysUrl: env('GEMINI_KEYS_URL', 'https://aistudio.google.com/apikey'),
    timeoutMs: envInt('GEMINI_TIMEOUT_MS', 120000)
  },

  defaultSymbol: env('DEFAULT_SYMBOL', 'AAPL'),

  marketNews: {
    rssBaseUrl: env('MARKET_NEWS_RSS_URL', 'https://news.google.com/rss/search'),
    rssLocale: env('MARKET_NEWS_RSS_LOCALE', 'en-US'),
    rssRegion: env('MARKET_NEWS_RSS_REGION', 'US'),
    defaultCount: envInt('MARKET_NEWS_DEFAULT_COUNT', 5),
    maxCount: envInt('MARKET_NEWS_MAX_COUNT', 20)
  },

  intraday: {
    defaultVol: envFloat('INTRADAY_DEFAULT_VOL', 0.25)
  },

  agent: {
    greeksNumTrials: envInt('AGENT_GREEKS_NUM_TRIALS', 100000),
    newsDefaultCount: envInt('AGENT_NEWS_DEFAULT_COUNT', 5)
  },

  // C++ thread count passed to monte_carlo binary (0 = hardware_concurrency / auto-detect all available cores).
  cppThreads: envInt('CPP_THREADS', 0),

  validation: {
    strongDelta: envFloat('VALIDATION_STRONG_DELTA', 0.5),
    strongVega: envFloat('VALIDATION_STRONG_VEGA', 25)
  }
};

function getLlmProviderName() {
  return config.llmProvider;
}

function getLlmModelName() {
  const provider = getLlmProviderName();
  if (provider === 'groq') return config.groq.model;
  if (provider === 'gemini') return config.gemini.model;
  return config.ollama.model;
}

function validateLlmConfig() {
  const provider = getLlmProviderName();
  if (provider === 'groq' && !config.groq.apiKey) {
    throw new Error(
      `LLM_PROVIDER=groq but GROQ_API_KEY is not set. Get a free key at ${config.groq.keysUrl}`
    );
  }
  if (provider === 'gemini' && !config.gemini.apiKey) {
    throw new Error(
      `LLM_PROVIDER=gemini but GEMINI_API_KEY is not set. Get a key at ${config.gemini.keysUrl}`
    );
  }
}

module.exports = {
  ...config,
  getLlmProviderName,
  getLlmModelName,
  validateLlmConfig
};
