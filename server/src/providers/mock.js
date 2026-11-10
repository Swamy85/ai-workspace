/**
 * Built-in demo "model". Needs no API key and streams a canned Markdown
 * response that exercises every renderer (code, tables, LaTeX) and echoes
 * what the context pipeline did (system prompt, memory, RAG sources, trimming),
 * which makes the whole app demo-able and testable offline.
 */
const sleep = (ms, signal) =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

function compose({ messages, context = {} }) {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const firstLine = last.split('\n').find((l) => l.trim()) || '(empty message)';
  const s = context.stats || {};
  const out = [];

  out.push(
    `Hi! I'm the **built-in demo model**. No API key is needed for me, so my reply is canned, ` +
      `but everything around it (streaming, context handling, memory, RAG, rendering) is the real pipeline.\n`
  );
  out.push(`> ${firstLine.slice(0, 200)}\n`);

  out.push('### What the pipeline did for this request\n');
  out.push(`- **Context:** ${s.totalTokens ?? '?'} of ${s.limit ?? '?'} tokens used (${s.kept ?? '?'} messages kept, ${s.trimmed ?? 0} older trimmed)`);
  out.push(`- **System instructions:** ${context.hasCustomSystem ? 'custom prompt active for this session' : 'default prompt'}`);
  out.push(`- **Workspace memory:** ${context.memoryCount || 0} note(s) injected`);
  if (context.sources?.length) {
    out.push(`- **Documents (${s.docMode}):** ${context.sources.length} file(s) in context`);
    for (const src of context.sources) {
      out.push(`  - \`${src.file}\` parts ${src.parts.join(', ')}: "${src.snippet.replace(/\s+/g, ' ').trim()}…"`);
    }
  } else {
    out.push('- **Documents:** none attached');
  }

  out.push('\n### Rendering check\n');
  out.push('Inline math like $E = mc^2$ and a block equation:\n');
  out.push('$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}$$\n');
  out.push('```ts');
  out.push('// Streaming a response with fetch + ReadableStream');
  out.push('async function* readStream(res: Response) {');
  out.push('  const reader = res.body!.getReader();');
  out.push('  const decoder = new TextDecoder();');
  out.push('  for (;;) {');
  out.push('    const { done, value } = await reader.read();');
  out.push('    if (done) return;');
  out.push('    yield decoder.decode(value, { stream: true });');
  out.push('  }');
  out.push('}');
  out.push('```\n');
  out.push('| Provider | Transport | Notes |');
  out.push('| --- | --- | --- |');
  out.push('| OpenAI / OpenRouter / Ollama | `/chat/completions` SSE | One shared adapter |');
  out.push('| Anthropic | `/messages` SSE | `content_block_delta` events |');
  out.push('| Gemini | `streamGenerateContent?alt=sse` | `candidates[].content.parts` |\n');
  out.push('Pick a real model in the top bar (GPT-OSS 20B is free) for actual answers.');
  return out.join('\n');
}

module.exports = {
  async *stream({ messages, signal, context }) {
    await sleep(250, signal);
    const parts = compose({ messages, context }).match(/\s+|\S+/g) || [];
    for (let i = 0; i < parts.length; i += 3) {
      if (signal?.aborted) return;
      yield parts.slice(i, i + 3).join('');
      await sleep(14, signal);
    }
  },
};
