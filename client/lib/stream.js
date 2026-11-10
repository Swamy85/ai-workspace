import { API } from './api';

/**
 * POST to the chat stream endpoint and dispatch Server-Sent Events.
 * (EventSource only supports GET, so we parse the SSE stream from fetch.)
 *
 * handlers: { onMeta, onDelta, onTitle, onError, onDone }
 * Resolves when the stream ends; rejects on network / HTTP errors.
 * An aborted request resolves quietly.
 */
export async function streamChat({ chatId, body, signal, handlers = {} }) {
  let res;
  try {
    res = await fetch(`${API}/chats/${chatId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    throw new Error('Cannot reach the API server. Is it running?');
  }

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const dispatch = (event, data) => {
    switch (event) {
      case 'status': return handlers.onStatus?.(data);
      case 'meta': return handlers.onMeta?.(data);
      case 'reasoning': return handlers.onReasoning?.(data.text);
      case 'delta': return handlers.onDelta?.(data.text);
      case 'title': return handlers.onTitle?.(data.title);
      case 'error': return handlers.onError?.(data.message);
      case 'done': return handlers.onDone?.(data);
    }
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('\n');
        if (event && data) {
          try {
            dispatch(event, JSON.parse(data));
          } catch {
            /* ignore malformed event */
          }
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  }
}
