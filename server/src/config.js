const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const num = (v, d) => {
  const n = Number(v);
  return v === undefined || v === '' || Number.isNaN(n) ? d : n;
};

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[config] Could not parse JSON env value:', e.message);
    return fallback;
  }
}

module.exports = {
  port: num(process.env.PORT, 4000),
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()),
  mongoUri: process.env.MONGODB_URI || '',
  dataFile: process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'),
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    },
    pollinations: {
      apiKey: process.env.POLLINATIONS_API_KEY || '',
      baseUrl: process.env.POLLINATIONS_BASE_URL || 'https://text.pollinations.ai/openai',
      modelsUrl: process.env.POLLINATIONS_MODELS_URL || 'https://text.pollinations.ai/models',
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      // Context window requested from Ollama. Kept modest so a 3B model fits
      // comfortably in laptop RAM while still holding the system prompt,
      // live-search excerpts and several turns of history.
      numCtx: num(process.env.OLLAMA_NUM_CTX, 8192),
      // Cap generated tokens so a slow CPU model can't ramble for minutes.
      numPredict: num(process.env.OLLAMA_NUM_PREDICT, 768),
      // Keep the model in memory between requests (avoids a cold load each time).
      keepAlive: process.env.OLLAMA_KEEP_ALIVE || '30m',
    },
  },
  /** Live web search (keyless, DuckDuckGo HTML). Disable with WEB_SEARCH=off. */
  web: {
    enabled: String(process.env.WEB_SEARCH || 'on').toLowerCase() !== 'off',
    endpoint: process.env.WEB_SEARCH_ENDPOINT || 'https://html.duckduckgo.com/html/',
    maxResults: num(process.env.WEB_SEARCH_RESULTS, 6),
    timeoutMs: num(process.env.WEB_SEARCH_TIMEOUT_MS, 6000),
    /** Read the top result pages so snippets alone don't starve the model. */
    readPages: String(process.env.WEB_PAGE_READ || 'on').toLowerCase() !== 'off',
    pageResults: num(process.env.WEB_PAGE_RESULTS, 2),
    pageTimeoutMs: num(process.env.WEB_PAGE_TIMEOUT_MS, 6000),
    pageChars: num(process.env.WEB_PAGE_CHARS, 2200),
  },
  /** Preferred default model (`provider:model`). Falls back to auto-detection. */
  defaultModel: process.env.DEFAULT_MODEL || process.env.DEFAULT_MODEL_ID || '',
  extraModels: parseJson(process.env.EXTRA_MODELS, []),
  limits: {
    maxFileBytes: num(process.env.MAX_FILE_MB, 10) * 1024 * 1024,
    defaultContextTokens: num(process.env.DEFAULT_CONTEXT_TOKENS, 32000),
    replyReserveTokens: num(process.env.REPLY_RESERVE_TOKENS, 4096),
  },
};
