class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

/** Throw a readable ProviderError for a non-2xx upstream response. */
async function assertOk(res, label) {
  if (res.ok) return;
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 400);
  } catch {
    /* ignore */
  }
  throw new ProviderError(`${label} returned ${res.status}${detail ? `: ${detail}` : ''}`, res.status);
}

/** Parse a fetch() Response body as Server-Sent Events. Yields {event, data}. */
async function* readSSE(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let m;
      while ((m = /\r?\n\r?\n/.exec(buf))) {
        const raw = buf.slice(0, m.index);
        buf = buf.slice(m.index + m[0].length);
        const lines = raw.split(/\r?\n/);
        const data = lines
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        const event = (lines.find((l) => l.startsWith('event:')) || '').slice(6).trim() || undefined;
        if (data) yield { event, data };
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

module.exports = { ProviderError, assertOk, readSSE };
