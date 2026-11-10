const config = require('../config');
const { assertOk, readSSE, ProviderError } = require('./sse');

module.exports = {
  async *stream({ model, system, messages, temperature, signal }) {
    const { apiKey, baseUrl } = config.providers.gemini;
    let res;
    try {
      res = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            ...(typeof temperature === 'number' ? { temperature } : {}),
            maxOutputTokens: 8192,
          },
        }),
      });
    } catch (err) {
      if (signal?.aborted) return;
      throw new ProviderError(`Could not reach Gemini: ${err.cause?.code || err.message}`);
    }
    await assertOk(res, 'Gemini');

    for await (const { data } of readSSE(res)) {
      try {
        const parts = JSON.parse(data).candidates?.[0]?.content?.parts || [];
        const text = parts.map((p) => p.text || '').join('');
        if (text) yield text;
      } catch {
        /* ignore */
      }
    }
  },
};
