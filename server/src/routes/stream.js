const { randomUUID } = require('crypto');
const config = require('../config');
const { resolveModel, defaultModelId } = require('../providers');
const { buildContext } = require('../services/context');
const { searchWeb, shouldSearch, buildQuery } = require('../services/websearch');
const { sanitizeAnswer } = require('../services/sanitize');

const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const titleFrom = (text) => {
  const line = String(text).split('\n').find((l) => l.trim()) || 'New chat';
  const t = line.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? t.slice(0, 47).trimEnd() + '…' : t;
};

const timeZoneFrom = (v) =>
  typeof v === 'string' && v.length > 0 && v.length <= 64 && /^[\w+\-/]+$/.test(v) ? v : undefined;

/**
 * POST /api/chats/:id/stream
 * body: { content?, regenerate?, modelId?, temperature?, contextTokens?, useMemory?,
 *         webSearch?, timeZone?, attachments? }
 *
 * Responds with Server-Sent Events:
 *   status → { stage: 'searching' | 'reading', query?, count? }
 *   meta   → { model, stats, sources, webSources, webQuery, memoryCount }
 *   reasoning → { text }        (reasoning models only)
 *   delta  → { text }
 *   title  → { title }
 *   done   → { message }
 *   error  → { message }
 */
module.exports = (store) => async (req, res) => {
  const chat = await store.chats.get(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  const body = req.body || {};
  const messages = chat.messages || [];

  if (body.regenerate) {
    while (messages.length && messages[messages.length - 1].role === 'assistant') messages.pop();
    if (!messages.length) return res.status(400).json({ error: 'Nothing to regenerate' });
  } else {
    if (!String(body.content || '').trim()) return res.status(400).json({ error: 'Message content is required' });
    messages.push({
      id: randomUUID(),
      role: 'user',
      content: String(body.content),
      createdAt: new Date().toISOString(),
      ...(Array.isArray(body.attachments) && body.attachments.length
        ? { attachments: body.attachments.map((a) => ({ id: a.id, name: a.name })) }
        : {}),
    });
  }

  const modelId = body.modelId || chat.modelId || (await defaultModelId());
  const resolved = await resolveModel(modelId);
  if (!resolved) return res.status(400).json({ error: `Unknown model "${modelId}"` });
  if (!resolved.available) {
    return res.status(400).json({ error: resolved.hint || `Model "${modelId}" is not configured on the server` });
  }

  // Persist the user turn immediately so nothing is lost if the stream fails.
  const isFirstTurn = !chat.messages?.some((m) => m.role === 'assistant') && (chat.title === 'New chat' || !chat.title);
  await store.chats.update(chat.id, { messages, modelId });

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const userText = lastUser?.content || '';

  // ── SSE setup ──────────────────────────────────────────
  // Open the stream before searching: the browser gets instant feedback
  // ("Searching the web…") instead of waiting for the lookup to finish.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  const send = (event, data) => {
    if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });

  // ── Live web search ────────────────────────────────────
  const wantWeb = body.webSearch !== false && config.web.enabled;
  let web = { query: '', results: [], provider: null, ms: 0, skipped: true };
  if (wantWeb && shouldSearch(userText)) {
    send('status', { stage: 'searching', query: buildQuery(userText) });
    web = await searchWeb(userText, { signal: abort.signal });
    if (web.results.length) send('status', { stage: 'reading', count: web.results.length });
  }

  const memories = body.useMemory === false ? [] : (await store.memories.list()).filter((m) => m.enabled !== false);
  const files = (await Promise.all((chat.fileIds || []).map((id) => store.files.get(id)))).filter(Boolean);

  const ctx = buildContext({
    systemPrompt: chat.systemPrompt,
    memories,
    files,
    query: userText,
    history: messages,
    // Never ask for more context than the resolved model can actually serve
    // (important for local Ollama models with a pinned num_ctx).
    contextTokens: Math.min(
      clampNum(body.contextTokens, 1000, 1_000_000, config.limits.defaultContextTokens),
      resolved.contextWindow || 1_000_000
    ),
    replyReserve: config.limits.replyReserveTokens,
    web,
    timeZone: timeZoneFrom(body.timeZone),
  });

  send('meta', {
    model: { id: resolved.id, label: resolved.label },
    stats: ctx.stats,
    sources: ctx.sources,
    webSources: ctx.webSources,
    webQuery: ctx.webQuery,
    search: { provider: web.provider, ms: web.ms },
    memoryCount: ctx.memoryCount,
  });

  let full = '';
  let reasoning = '';
  let failure = null;

  // A free provider can occasionally return an empty stream (queue/rate
  // limit). Retry once, but only when nothing at all was produced, so the
  // user never sees duplicated text.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      send('status', { stage: 'retrying' });
      await new Promise((r) => setTimeout(r, 700));
      if (abort.signal.aborted) break;
    }
    try {
      const stream = resolved.adapter.stream({
        model: resolved.model,
        system: ctx.system,
        messages: ctx.messages,
        temperature: clampNum(body.temperature, 0, 2, 0.7),
        signal: abort.signal,
        context: {
          stats: ctx.stats,
          sources: ctx.sources,
          webSources: ctx.webSources,
          memoryCount: ctx.memoryCount,
          hasCustomSystem: !!(chat.systemPrompt || '').trim(),
        },
      });
      for await (const chunk of stream) {
        if (typeof chunk === 'string') {
          full += chunk;
          send('delta', { text: chunk });
        } else if (chunk?.type === 'reasoning' && chunk.text) {
          reasoning += chunk.text;
          send('reasoning', { text: chunk.text });
        }
      }
      failure = null;
    } catch (err) {
      failure = abort.signal.aborted ? null : err;
    }
    if (full || reasoning || failure || abort.signal.aborted) break;
  }

  if (!full && !failure && !abort.signal.aborted) {
    failure = new Error('The model returned an empty response. Please try again.');
  }

  const stopped = abort.signal.aborted;
  // Only strip links when the user didn't explicitly ask for sources.
  const wantsSources = /\b(links?|urls?|sources?|references?|citations?)\b/i.test(userText);
  let answer = sanitizeAnswer(full, { keepSources: wantsSources, hasLive: ctx.webSources.length > 0 });
  if (!answer && full) answer = full.trim();
  let assistant = null;
  if (answer) {
    assistant = {
      id: randomUUID(),
      role: 'assistant',
      content: answer,
      model: resolved.id,
      createdAt: new Date().toISOString(),
      ...(stopped ? { stopped: true } : {}),
      ...(reasoning ? { reasoning: reasoning.slice(0, 20000) } : {}),
      ...(ctx.webSources.length ? { sources: ctx.webSources, webQuery: ctx.webQuery } : {}),
    };
    messages.push(assistant);
  }

  const patch = { messages };
  let newTitle = null;
  if (isFirstTurn && lastUser) {
    newTitle = titleFrom(lastUser.content);
    patch.title = newTitle;
  }
  await store.chats.update(chat.id, patch);

  if (newTitle) send('title', { title: newTitle });
  if (failure) send('error', { message: failure.message || 'The model request failed' });
  send('done', { message: assistant, stopped });
  res.end();
};
