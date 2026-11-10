const config = require('../config');
const { assertOk, readSSE, ProviderError } = require('./sse');

module.exports = {
  async *stream({ model, system, messages, temperature, signal }) {
    const { apiKey, baseUrl } = config.providers.anthropic;
    let res;
    try {
      res = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          stream: true,
          ...(system ? { system } : {}),
          ...(typeof temperature === 'number' ? { temperature: Math.min(1, temperature) } : {}),
          messages,
        }),
      });
    } catch (err) {
      if (signal?.aborted) return;
      throw new ProviderError(`Could not reach Anthropic: ${err.cause?.code || err.message}`);
    }
    await assertOk(res, 'Anthropic');

    for await (const { data } of readSSE(res)) {
      try {
        const evt = JSON.parse(data);
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') yield evt.delta.text;
        else if (evt.type === 'error') throw new ProviderError(evt.error?.message || 'Anthropic stream error');
      } catch (err) {
        if (err instanceof ProviderError) throw err;
      }
    }
  },
};
