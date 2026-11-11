const config = require('../config');
const { ProviderError } = require('./sse');

/**
 * Native Ollama adapter (`/api/chat`).
 *
 * The OpenAI-compatible endpoint works for chat, but it does not reliably
 * expose `num_ctx`. Using the native API lets us pin a real context window so
 * long system prompts (live-search excerpts, documents) aren't silently
 * truncated — which is what makes small local models ignore current data.
 */
module.exports = {
  async *stream({ model, system, messages, temperature, signal }) {
    const base = config.providers.ollama.baseUrl.replace(/\/$/, '');
    const options = {
      num_ctx: config.providers.ollama.numCtx,
      num_predict: config.providers.ollama.numPredict,
    };
    if (typeof temperature === 'number') options.temperature = temperature;

    const body = {
      model,
      stream: true,
      keep_alive: config.providers.ollama.keepAlive,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      options,
    };

    let res;
    try {
      res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (signal?.aborted) return;
      throw new ProviderError(`Could not reach Ollama: ${err.cause?.code || err.message}`);
    }

    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 400);
      } catch {
        /* ignore */
      }
      throw new ProviderError(`Ollama returned ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
    }

    // Ollama streams newline-delimited JSON.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let json;
          try {
            json = JSON.parse(line);
          } catch {
            continue;
          }
          if (json.error) throw new ProviderError(`Ollama: ${json.error}`);
          const thought = json.message?.thinking;
          if (thought) yield { type: 'reasoning', text: thought };
          const content = json.message?.content;
          if (typeof content === 'string' && content) yield content;
          if (json.done) return;
        }
      }

      const tail = buf.trim();
      if (tail) {
        try {
          const json = JSON.parse(tail);
          if (typeof json.message?.content === 'string' && json.message.content) yield json.message.content;
        } catch {
          /* ignore incomplete tail */
        }
      }
    } finally {
      reader.releaseLock?.();
    }
  },
};
