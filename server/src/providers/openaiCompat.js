const { assertOk, readSSE, ProviderError } = require('./sse');

/**
 * Adapter for any OpenAI-compatible /chat/completions endpoint:
 * OpenAI, OpenRouter, Ollama (/v1), LM Studio, vLLM, etc.
 */
module.exports = function createOpenAICompat({ label, getBaseUrl, getApiKey, extraHeaders = {}, maxTokens = 8192 }) {
  return {
    async *stream({ model, system, messages, temperature, signal }) {
      const apiKey = getApiKey?.();
      const body = {
        model,
        stream: true,
        max_tokens: maxTokens,
        messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      };
      if (typeof temperature === 'number') body.temperature = temperature;

      let res;
      try {
        res = await fetch(`${getBaseUrl()}/chat/completions`, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            ...extraHeaders,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        if (signal?.aborted) return;
        throw new ProviderError(`Could not reach ${label}: ${err.cause?.code || err.message}`);
      }
      await assertOk(res, label);

      for await (const { data } of readSSE(res)) {
        if (data === '[DONE]') return;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta || {};
          // Reasoning models (GPT-OSS, DeepSeek-R1, …) stream their chain of
          // thought separately; surface it instead of dropping it.
          const thought = delta.reasoning || delta.reasoning_content;
          if (thought) yield { type: 'reasoning', text: thought };
          if (typeof delta.content === 'string' && delta.content) yield delta.content;
        } catch {
          /* ignore keep-alive / malformed chunks */
        }
      }
    },
  };
};
