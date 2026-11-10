const config = require('../config');
const createOpenAICompat = require('./openaiCompat');

const adapters = {
  mock: require('./mock'),
  anthropic: require('./anthropic'),
  gemini: require('./gemini'),
  // Free, keyless real model (GPT-OSS 20B). Works out of the box; an optional
  // POLLINATIONS_API_KEY raises rate limits / unlocks the paid tiers.
  pollinations: createOpenAICompat({
    label: 'Pollinations',
    getBaseUrl: () => config.providers.pollinations.baseUrl,
    getApiKey: () => config.providers.pollinations.apiKey,
    extraHeaders: { 'X-Title': 'AI Workspace', Referer: 'http://localhost:3000' },
  }),
  openai: createOpenAICompat({
    label: 'OpenAI',
    getBaseUrl: () => config.providers.openai.baseUrl,
    getApiKey: () => config.providers.openai.apiKey,
  }),
  openrouter: createOpenAICompat({
    label: 'OpenRouter',
    getBaseUrl: () => config.providers.openrouter.baseUrl,
    getApiKey: () => config.providers.openrouter.apiKey,
    extraHeaders: { 'X-Title': 'AI Workspace' },
  }),
  ollama: createOpenAICompat({
    label: 'Ollama',
    getBaseUrl: () => `${config.providers.ollama.baseUrl.replace(/\/$/, '')}/v1`,
    getApiKey: () => '',
  }),
};

/** Static catalog. IDs are `provider:model`; edit freely or use EXTRA_MODELS. */
const STATIC_MODELS = [
  {
    id: 'pollinations:openai-fast',
    provider: 'pollinations',
    label: 'GPT-OSS 20B (free)',
    contextWindow: 131072,
    available: true,
  },
  { id: 'mock:mock-assistant', provider: 'mock', label: 'Demo model (no key needed)', contextWindow: 32000 },
  { id: 'openai:gpt-4o', provider: 'openai', label: 'GPT-4o', contextWindow: 128000 },
  { id: 'openai:gpt-4o-mini', provider: 'openai', label: 'GPT-4o mini', contextWindow: 128000 },
  { id: 'openai:gpt-4.1', provider: 'openai', label: 'GPT-4.1', contextWindow: 1047576 },
  { id: 'openai:gpt-4.1-mini', provider: 'openai', label: 'GPT-4.1 mini', contextWindow: 1047576 },
  { id: 'anthropic:claude-sonnet-4-5', provider: 'anthropic', label: 'Claude Sonnet 4.5', contextWindow: 200000 },
  { id: 'anthropic:claude-opus-4-1', provider: 'anthropic', label: 'Claude Opus 4.1', contextWindow: 200000 },
  { id: 'anthropic:claude-3-5-haiku-latest', provider: 'anthropic', label: 'Claude Haiku 3.5', contextWindow: 200000 },
  { id: 'gemini:gemini-2.5-pro', provider: 'gemini', label: 'Gemini 2.5 Pro', contextWindow: 1000000 },
  { id: 'gemini:gemini-2.5-flash', provider: 'gemini', label: 'Gemini 2.5 Flash', contextWindow: 1000000 },
  {
    id: 'openrouter:meta-llama/llama-3.3-70b-instruct',
    provider: 'openrouter',
    label: 'Llama 3.3 70B',
    contextWindow: 128000,
  },
  { id: 'openrouter:deepseek/deepseek-chat', provider: 'openrouter', label: 'DeepSeek Chat', contextWindow: 64000 },
  {
    id: 'openrouter:anthropic/claude-sonnet-4.5',
    provider: 'openrouter',
    label: 'Claude Sonnet 4.5 (OpenRouter)',
    contextWindow: 200000,
  },
];

const KEY_ENV = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  pollinations: 'POLLINATIONS_API_KEY',
};

/** Free models advertised by Pollinations, discovered at runtime. */
let pollinationsCache = { at: 0, models: [] };
async function pollinationsModels() {
  if (Date.now() - pollinationsCache.at < 10 * 60 * 1000) return pollinationsCache.models;
  let models = [];
  try {
    const res = await fetch(config.providers.pollinations.modelsUrl, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      const json = await res.json();
      models = (Array.isArray(json) ? json : [])
        .map((m) => {
          const name = m?.name || m?.id;
          if (!name) return null;
          const desc = typeof m.description === 'string' ? m.description.split('(')[0].trim() : '';
          return {
            id: `pollinations:${name}`,
            provider: 'pollinations',
            label: desc ? `${name} · ${desc}` : `${name} (free)`,
            contextWindow: 131072,
            available: true,
            free: true,
          };
        })
        .filter(Boolean);
    }
  } catch {
    /* offline: fall back to the static free model */
  }
  if (!models.some((m) => m.id === 'pollinations:openai-fast')) {
    models.push({
      id: 'pollinations:openai-fast',
      provider: 'pollinations',
      label: 'GPT-OSS 20B (free)',
      contextWindow: 131072,
      available: true,
      free: true,
    });
  }
  pollinationsCache = { at: Date.now(), models };
  return models;
}

let ollamaCache = { at: 0, models: [] };
async function ollamaModels() {
  if (Date.now() - ollamaCache.at < 15000) return ollamaCache.models;
  let models = [];
  try {
    const res = await fetch(`${config.providers.ollama.baseUrl.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(800),
    });
    if (res.ok) {
      const json = await res.json();
      models = (json.models || []).map((m) => ({
        id: `ollama:${m.name}`,
        provider: 'ollama',
        label: `${m.name} (local)`,
        contextWindow: 8192,
        available: true,
      }));
    }
  } catch {
    /* Ollama not running: no local models listed */
  }
  ollamaCache = { at: Date.now(), models };
  return models;
}

function withAvailability(m) {
  if (m.available !== undefined) return m;
  if (m.provider === 'mock' || m.provider === 'pollinations') return { ...m, available: true };
  const hasKey = !!config.providers[m.provider]?.apiKey;
  return { ...m, available: hasKey, hint: hasKey ? undefined : `Set ${KEY_ENV[m.provider]} in server/.env` };
}

async function listModels() {
  const extras = (config.extraModels || []).map((m) => ({
    provider: m.id?.split(':')[0],
    contextWindow: 32000,
    ...m,
  }));
  const [free, local] = await Promise.all([pollinationsModels(), ollamaModels()]);
  const byId = new Map();
  for (const m of [...STATIC_MODELS, ...extras, ...free, ...local]) byId.set(m.id, m);
  return [...byId.values()].filter((m) => adapters[m.provider]).map(withAvailability);
}

/** Resolve a `provider:model` id to an adapter. Unknown model names on a known provider are allowed. */
async function resolveModel(id) {
  if (!id || !id.includes(':')) return null;
  const known = (await listModels()).find((m) => m.id === id);
  const provider = id.split(':')[0];
  if (!adapters[provider]) return null;
  const entry = known || withAvailability({ id, provider, label: id.slice(provider.length + 1), contextWindow: 32000 });
  return { ...entry, model: id.slice(provider.length + 1), adapter: adapters[provider] };
}

const DEFAULT_MODEL_ID = 'pollinations:openai-fast';

/** Prefer a configured paid/local model, then the free hosted one, then the demo. */
async function defaultModelId() {
  const models = await listModels();
  const paid = models.find((m) => !['mock', 'pollinations', 'ollama'].includes(m.provider) && m.available);
  const free = models.find((m) => m.provider === 'pollinations' && m.available);
  const local = models.find((m) => m.provider === 'ollama' && m.available);
  return paid?.id || free?.id || local?.id || DEFAULT_MODEL_ID;
}

module.exports = { listModels, resolveModel, defaultModelId };
