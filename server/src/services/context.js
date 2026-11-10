/**
 * Context assembly: system prompt + long-term memory + retrieved document
 * chunks + as much recent chat history as fits in the token budget.
 */
const { estimateTokens, messageTokens } = require('./tokens');
const { retrieve } = require('./rag');

const DEFAULT_SYSTEM = [
  'You are AI Workspace, a helpful, accurate assistant with live access to current information.',
  '',
  '## How to answer',
  '- Lead with the answer. Put the most useful sentence or two first, with no preamble and no restating the question.',
  '- Use clean GitHub-flavored Markdown: short paragraphs, `##`/`###` headings only when they genuinely help, bullet lists for steps or options, and tables for comparisons.',
  '- Bold key terms sparingly. Use fenced code blocks with a language tag for code, and LaTeX ($inline$ and $$block$$) for math.',
  '- Match the depth to the request: a couple of sentences for simple questions, structured detail only when the user asks for it.',
  '- For comparisons or recommendations, give a clear recommendation and the main trade-offs.',
  '- Be direct and natural. Skip filler such as "Great question!" and avoid ending every answer with a follow-up question.',
  '',
  '## Accuracy and freshness',
  '- When live results are supplied below, use them for anything current — news, prices, schedules, sports, weather and recent events — and prefer them over older knowledge.',
  '- Never mention that you searched, never name outlets or websites as sources, and never add a "Sources", "References" or "Citations" section or a raw URL list. Present the answer as your own knowledge. The only exception is when the user explicitly asks for links or sources.',
  '- If the available information is incomplete or conflicting, say so briefly and give the best-supported answer instead of inventing specifics.',
].join('\n');

/** Human-readable "now", formatted in the visitor's time zone when provided. */
function formatNow(now, timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timeZone || undefined,
    });
    return `${fmt.format(now)}${timeZone ? ` (${timeZone})` : ' (server time)'}`;
  } catch {
    return now.toISOString();
  }
}

/** Merge consecutive same-role messages and make sure history starts with a user turn. */
function normalizeHistory(msgs) {
  const out = [];
  for (const m of msgs) {
    if (!m.content || !['user', 'assistant'].includes(m.role)) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

function buildSystem({ base, memories, chunks, now, timeZone, web }) {
  let sys = `${base}\n\n## Current date\nIt is ${formatNow(now, timeZone)}. Use this for anything time-sensitive — "today", "latest", news, prices, schedules and recent events.`;

  if (web?.results?.length) {
    const lines = web.results.map((r, i) => {
      const excerpt = String(r.snippet || '').replace(/\s+/g, ' ').slice(0, 320);
      const date = r.publishedAt ? `Published: ${String(r.publishedAt).slice(0, 10)}\n` : '';
      return `[${i + 1}] ${r.title}\n${date}${excerpt}`;
    });
    const body = lines.join('\n\n').slice(0, 8000);
    sys +=
      `\n\n## Live information\n` +
      `Retrieved moments ago for the query "${web.query}". Treat it as current, prefer the most recent items, ` +
      `and mention publication dates when they matter. Weave the facts into a direct answer: do not mention ` +
      `the search, do not name outlets or websites, and do not include a sources section or link list. If the ` +
      `user explicitly asked for sources or links, give a short clean list instead.\n\n${body}`;
  }

  if (memories.length) {
    sys +=
      '\n\n## Workspace memory\nLong-term notes saved by the user. Apply them when relevant.\n' +
      memories.map((m) => `- ${m.text}`).join('\n');
  }
  if (chunks.length) {
    sys +=
      '\n\n## Reference documents\nThe user attached these documents. Ground your answer in them and cite the filename.\n\n' +
      chunks.map((c, i) => `[${i + 1}] ${c.file} (part ${c.idx + 1})\n${c.text}`).join('\n\n---\n\n');
  }
  return sys;
}

function buildContext({
  systemPrompt,
  memories = [],
  files = [],
  query = '',
  history,
  contextTokens,
  replyReserve,
  web = null,
  now = new Date(),
  timeZone,
}) {
  const limit = Math.max(1000, contextTokens);
  const budget = Math.max(500, limit - replyReserve);
  const base = (systemPrompt || '').trim() || DEFAULT_SYSTEM;
  const webResults = web?.results || [];

  // Cap memory at ~15% of the budget so notes can't crowd out the conversation.
  const memCap = Math.floor(budget * 0.15);
  const keptMemories = [];
  let memTokens = 0;
  for (const m of memories) {
    const t = estimateTokens(m.text) + 2;
    if (memTokens + t > memCap) break;
    keptMemories.push(m);
    memTokens += t;
  }

  const fixed = estimateTokens(base) + memTokens;
  const ragBudget = Math.max(0, Math.min(Math.floor(budget * 0.5), budget - fixed - 500));
  const rag = retrieve({ files, query, budgetTokens: ragBudget });

  const system = buildSystem({ base, memories: keptMemories, chunks: rag.chunks, now, timeZone, web });
  const systemTokens = estimateTokens(system);

  const norm = normalizeHistory(history);
  const kept = [];
  let remaining = budget - systemTokens;
  for (let i = norm.length - 1; i >= 0; i--) {
    const t = messageTokens(norm[i]);
    if (kept.length && t > remaining) break; // always keep the newest message
    kept.unshift(norm[i]);
    remaining -= t;
  }
  while (kept.length && kept[0].role !== 'user') kept.shift();

  const historyTokens = kept.reduce((n, m) => n + messageTokens(m), 0);
  const byFile = new Map();
  for (const c of rag.chunks) {
    if (!byFile.has(c.file)) byFile.set(c.file, []);
    byFile.get(c.file).push(c.idx + 1);
  }

  return {
    system,
    messages: kept,
    memoryCount: keptMemories.length,
    webSources: webResults,
    webQuery: web?.query || '',
    sources: [...byFile.entries()].map(([file, parts]) => ({
      file,
      parts,
      snippet: rag.chunks.find((c) => c.file === file)?.text.slice(0, 160) || '',
    })),
    stats: {
      limit,
      systemTokens,
      historyTokens,
      totalTokens: systemTokens + historyTokens,
      trimmed: norm.length - kept.length,
      kept: kept.length,
      docMode: rag.mode,
      docChunks: rag.chunks.length,
      webResults: webResults.length,
    },
  };
}

module.exports = { buildContext, DEFAULT_SYSTEM };
