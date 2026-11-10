/**
 * End-to-end smoke test. Spawns the API against a temp data file (demo model,
 * no keys, no Mongo) and exercises every route. Run: `npm test`.
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PORT = 4799;
const BASE = `http://localhost:${PORT}/api`;
const DATA = path.join(os.tmpdir(), `aiw-smoke-${Date.now()}.json`);

let passed = 0;
const check = (name, cond, extra = '') => {
  if (!cond) {
    console.error(`  ✗ ${name} ${extra}`);
    throw new Error(`Failed: ${name}`);
  }
  passed++;
  console.log(`  ✓ ${name}`);
};

const json = async (p, opts = {}) => {
  const res = await fetch(BASE + p, {
    ...opts,
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body instanceof FormData || typeof opts.body === 'string' || !opts.body ? opts.body : JSON.stringify(opts.body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

const stream = async (id, body) => {
  const res = await fetch(`${BASE}/chats/${id}/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelId: 'mock:mock-assistant', ...body }),
  });
  const text = await res.text();
  const events = [...text.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map((m) => ({ event: m[1], data: JSON.parse(m[2]) }));
  return { status: res.status, text, events, get: (e) => events.filter((x) => x.event === e) };
};

async function run() {
  const proc = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_FILE: DATA, MONGODB_URI: '', WEB_SEARCH: 'off', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', OPENROUTER_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  try {
    for (let i = 0; i < 40; i++) {
      try {
        if ((await fetch(`${BASE}/health`)).ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    console.log('Core');
    const health = await json('/health');
    check('health ok', health.data?.ok === true);
    const models = await json('/models');
    check('demo model available', models.data.models.some((m) => m.id === 'mock:mock-assistant' && m.available));
    check('free real model available', models.data.models.some((m) => m.provider === 'pollinations' && m.available));
    check('default model is real', models.data.defaultModelId.startsWith('pollinations:'));
    check('keyless providers flagged unavailable', models.data.models.filter((m) => m.provider === 'openai').every((m) => !m.available));
    const prompts = await json('/prompts');
    check('prompt library seeded', prompts.data.length >= 8);

    console.log('Chat + RAG + streaming');
    const chat = (await json('/chats', { method: 'POST', body: { systemPrompt: 'Be brief' } })).data;
    check('chat created', !!chat.id);

    const form = new FormData();
    form.append('file', new Blob(['# Notes\n\nThe zebracorn protocol requires three handshakes before any data is sent.\n'], { type: 'text/markdown' }), 'notes.md');
    const up = await json(`/files?chatId=${chat.id}`, { method: 'POST', body: form });
    check('file uploaded', up.status === 201 && up.data.tokens > 0, JSON.stringify(up.data));
    const bad = new FormData();
    bad.append('file', new Blob(['x'], { type: 'application/zip' }), 'a.zip');
    check('unsupported type rejected', (await json(`/files?chatId=${chat.id}`, { method: 'POST', body: bad })).status === 415);

    const s1 = await stream(chat.id, { content: 'What does the document say about zebracorn?' });
    check('SSE meta/delta/done', s1.get('meta').length === 1 && s1.get('delta').length > 5 && s1.get('done').length === 1);
    check('RAG source in context', s1.get('meta')[0].data.sources[0]?.file === 'notes.md');
    check('custom system detected', s1.text.includes('custom prompt active'));
    check('title generated', s1.get('title')[0]?.data.title.startsWith('What does the document'));

    const full = (await json(`/chats/${chat.id}`)).data;
    check('messages persisted', full.messages.length === 2 && full.files.length === 1);

    console.log('Memory');
    const note = (await json('/memory', { method: 'POST', body: { text: 'User prefers metric units' } })).data;
    const s2 = await stream(chat.id, { content: 'hello again' });
    check('memory injected', s2.get('meta')[0].data.memoryCount === 1);
    const s2b = await stream(chat.id, { content: 'and again', useMemory: false });
    check('memory can be disabled', s2b.get('meta')[0].data.memoryCount === 0);
    await json(`/memory/${note.id}`, { method: 'PATCH', body: { enabled: false } });
    check('disabled note skipped', (await stream(chat.id, { content: 'x' })).get('meta')[0].data.memoryCount === 0);
    await json(`/memory/${note.id}`, { method: 'DELETE' });

    console.log('Context trimming + regenerate');
    const big = 'lorem ipsum dolor sit amet '.repeat(120);
    for (let i = 0; i < 3; i++) await stream(chat.id, { content: big, contextTokens: 1800 });
    const s3 = await stream(chat.id, { content: 'final', contextTokens: 1800 });
    check('old messages trimmed to fit budget', s3.get('meta')[0].data.stats.trimmed > 0);
    const before = (await json(`/chats/${chat.id}`)).data.messages.length;
    const rg = await stream(chat.id, { regenerate: true });
    const after = (await json(`/chats/${chat.id}`)).data.messages.length;
    check('regenerate replaces last reply', rg.get('done').length === 1 && after === before);
    check('unknown model rejected', (await stream(chat.id, { content: 'x', modelId: 'nope:nope' })).status === 400);
    check('unconfigured provider rejected', (await stream(chat.id, { content: 'x', modelId: 'openai:gpt-4o' })).status === 400);

    console.log('History, search, export');
    check('search by message content', (await json('/chats?q=zebracorn')).data.some((c) => c.id === chat.id));
    check('search miss', (await json('/chats?q=qqqqnotfound')).data.length === 0);
    const patched = await json(`/chats/${chat.id}`, { method: 'PATCH', body: { title: 'Renamed', pinned: true } });
    check('rename + pin', patched.data.title === 'Renamed' && patched.data.pinned === true);
    const md = await fetch(`${BASE}/chats/${chat.id}/export?format=md`);
    const mdText = await md.text();
    check('markdown export', md.headers.get('content-disposition')?.includes('.md') && mdText.includes('## Assistant'));
    const js = await fetch(`${BASE}/chats/${chat.id}/export?format=json`);
    check('json export', Array.isArray((await js.json()).messages));
    const all = await fetch(`${BASE}/chats/export?format=json`);
    check('export all', (await all.json()).chats.length === 1);

    console.log('Prompt library CRUD');
    const np = (await json('/prompts', { method: 'POST', body: { title: 'T', category: 'X', content: 'Hello {{name}}' } })).data;
    check('prompt created', !!np.id);
    check('prompt updated', (await json(`/prompts/${np.id}`, { method: 'PATCH', body: { title: 'T2', content: 'Hi' } })).data.title === 'T2');
    await json(`/prompts/${np.id}`, { method: 'DELETE' });
    check('prompt deleted', !(await json('/prompts')).data.some((p) => p.id === np.id));

    console.log('Delete');
    await json(`/chats/${chat.id}`, { method: 'DELETE' });
    check('chat deleted', (await json(`/chats/${chat.id}`)).status === 404);

    console.log(`\nAll ${passed} checks passed.`);
  } finally {
    proc.kill('SIGTERM');
    setTimeout(() => fs.rmSync(DATA, { force: true }), 600);
  }
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
