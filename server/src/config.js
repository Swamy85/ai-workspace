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
    },
  },
  /** Live web search (keyless, DuckDuckGo HTML). Disable with WEB_SEARCH=off. */
  web: {
    enabled: String(process.env.WEB_SEARCH || 'on').toLowerCase() !== 'off',
    endpoint: process.env.WEB_SEARCH_ENDPOINT || 'https://html.duckduckgo.com/html/',
    maxResults: num(process.env.WEB_SEARCH_RESULTS, 5),
    timeoutMs: num(process.env.WEB_SEARCH_TIMEOUT_MS, 8000),
  },
  extraModels: parseJson(process.env.EXTRA_MODELS, []),
  limits: {
    maxFileBytes: num(process.env.MAX_FILE_MB, 10) * 1024 * 1024,
    defaultContextTokens: num(process.env.DEFAULT_CONTEXT_TOKENS, 32000),
    replyReserveTokens: num(process.env.REPLY_RESERVE_TOKENS, 4096),
  },
};
