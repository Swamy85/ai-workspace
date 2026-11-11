# AI Workspace

A full-stack, multi-model AI chat workspace (think ChatGPT / Claude / Gemini in one UI).

**Stack:** Next.js 14 (App Router) · React 18 · Tailwind CSS · Zustand · Node.js/Express · MongoDB (optional)

It works out of the box with **zero configuration**: a free hosted real model (GPT-OSS 20B via Pollinations) streams actual answers, and live DuckDuckGo web search keeps replies current. Sources stay internal, so answers read naturally instead of ending in link dumps. Storage falls back to a JSON file when MongoDB isn't configured. Add API keys to unlock OpenAI, Anthropic, Gemini, OpenRouter or local Ollama models.

## Quick start

```bash
npm run install:all                      # root + server + client deps
cp server/.env.example server/.env       # optional: add API keys / MongoDB URI
cp client/.env.example client/.env.local # optional: only if the API isn't on :4000
npm run dev                              # API on :4000, web on :3000
```

On Windows PowerShell, use `Copy-Item server/.env.example server/.env` (same for the client file).
Open http://localhost:3000. Requires Node 18+ (Node 20+ recommended). No API key is needed to chat.

Other commands: `npm test` (29-check API smoke test, no keys needed) · `npm run build && npm start` (production).

For MongoDB: `docker compose up -d`, then set `MONGODB_URI=mongodb://localhost:27017/ai-workspace` in `server/.env`. If Mongo is unreachable the server logs a warning and uses the file store.

### Using a local Ollama model

Install [Ollama](https://ollama.com) and pull a model, for example `ollama pull qwen2.5:3b`. The server discovers running local models from `OLLAMA_BASE_URL` (default `http://localhost:11434`) and lists them in the picker as `<name> (local)`. To make one the default, set it in `server/.env`:

```bash
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_MODEL=ollama:qwen2.5:3b
# Optional tuning (defaults shown):
OLLAMA_NUM_CTX=8192      # context window
OLLAMA_NUM_PREDICT=768   # max tokens per reply (lower = faster)
OLLAMA_KEEP_ALIVE=30m    # keep the model loaded between requests
```

The `DEFAULT_MODEL` value uses the same `provider:model` id shown in the model picker. If that model isn't available (for example Ollama isn't running), the server falls back to the next usable model.

Local models are served through Ollama's native `/api/chat` API so the app can set `num_ctx`. Raise `OLLAMA_NUM_CTX` if you have spare RAM and want longer chats; lower it on memory-constrained machines. The app never asks for more context than the model advertises.

Small CPU-only models are slow on long prompts. If replies feel sluggish, lower `OLLAMA_NUM_PREDICT`, or disable page reading (`WEB_PAGE_READ=off`) so less text is sent to the model. The first request after starting Ollama is the slowest because the model has to load; `OLLAMA_KEEP_ALIVE` avoids repeating that cost.

## Features

| Area | What you get |
| --- | --- |
| **Layout** | Collapsible sidebar (drawer on mobile), chat workspace, top bar with model picker, export, theme toggle |
| **Rendering** | Markdown + GFM tables, KaTeX math (`$…$`, `$$…$$`, also `\(…\)` / `\[…\]`), syntax-highlighted code with per-block copy buttons |
| **Theming** | Light/dark toggle (follows system on first visit, persisted, no flash on load) |
| **Session control** | Per-chat system instructions (with presets), temperature, context-token budget, live context usage meter |
| **Models** | **Free GPT-OSS 20B (no key needed)**, OpenAI, Anthropic, Gemini, OpenRouter, Ollama (auto-discovered), plus an offline demo model. Unconfigured models are shown disabled with a hint |
| **Live web** | Keyless DuckDuckGo + Google News search before each answer, plus a read of the top result pages for real scores, tables and figures, with the current date/time. Results are used privately — no source list is shown under replies. Globe toggle in the composer, switch in Context settings |
| **Streaming** | SSE token streaming, live "Searching the web…" status, reasoning-model "Thinking" panel, stop button, partial replies are saved, regenerate |
| **Context** | History trimmed oldest-first to fit the budget (newest message always kept) |
| **Memory** | Long-term notes injected into every chat; toggle per note or globally; save any reply as a note |
| **Files & RAG** | Attach `.txt/.md/.pdf/.csv/.json/code` files (drag & drop supported); small files go in whole, large ones are chunked and BM25-ranked against your question |
| **Prompt library** | 10 seeded templates (code, summary, email, research), full CRUD, `{{variable}}` fill-in form |
| **History** | Search across titles and message bodies, rename, pin, delete, date-grouped list |
| **Export** | One chat or all chats as Markdown or JSON |

## Project structure

```
ai-workspace/
├── docker-compose.yml          # optional local MongoDB
├── server/
│   ├── .env.example
│   ├── scripts/smoke.js        # end-to-end API test (npm test)
│   └── src/
│       ├── index.js            # Express app, CORS, error handling
│       ├── config.js           # env parsing
│       ├── db/                 # store factory: mongoStore.js | memoryStore.js (same interface)
│       ├── providers/          # openaiCompat · anthropic · gemini · mock · catalog (index.js) · sse.js
│       ├── routes/             # chats · stream (SSE) · files · prompts · memory
│       └── services/           # context.js (budgeting) · rag.js (chunk + BM25) · fileParser.js · tokens.js · websearch.js
└── client/
    ├── app/                    # layout.jsx, page.jsx, globals.css (theme tokens, markdown, hljs)
    ├── lib/                    # store.js (Zustand) · api.js · stream.js (SSE reader) · utils.js · hooks.js
    └── components/             # Workspace · Sidebar · TopBar · ModelSelect · ChatView · Message · Markdown
                                # Composer · SettingsPanel · PromptLibrary · MemoryPanel · ExportMenu · Modal · Toaster
```

## API

All routes are under `/api`.

| Method & path | Purpose |
| --- | --- |
| `GET /health` · `GET /models` | Status; model catalog with `available` flags |
| `GET /chats?q=` · `POST /chats` | List/search chats; create |
| `GET/PATCH/DELETE /chats/:id` | Read (with file metadata); rename, pin, set system prompt/model; delete |
| `POST /chats/:id/stream` | **SSE** completion: events `status`? → `meta` → `reasoning`* / `delta`* → `title`? → `done` (or `error`) |
| `GET /chats/:id/export?format=md\|json` · `GET /chats/export` | Download one / all chats |
| `POST /files?chatId=` · `DELETE /chats/:id/files/:fileId` | Upload (multipart `file`) / remove a document |
| `GET/POST/PATCH/DELETE /prompts` | Prompt library |
| `GET/POST/PATCH/DELETE /memory` | Long-term memory notes |

Stream request body: `{ content, regenerate?, modelId?, temperature?, contextTokens?, useMemory?, webSearch?, timeZone?, attachments? }`.
The browser's `EventSource` is GET-only, so the client reads the SSE stream from `fetch` (`client/lib/stream.js`).

## Real-time information

Every message is optionally grounded with live lookups before the model runs:

1. The server streams a `status` event (`searching`), so the UI reacts immediately.
2. `services/websearch.js` queries several keyless sources in parallel:
   - **DuckDuckGo HTML** — broad web results (title, URL, snippet)
   - **Google News RSS** — real, dated headlines for newsy questions
   - **DuckDuckGo Instant Answer** — direct factual abstracts
   - **Wikipedia** — encyclopedic fallback with plain-text intros
   - **wttr.in** — live weather and a short forecast when you ask about weather
3. Snippets alone often omit the actual numbers, so the server also fetches the top few direct result pages (`WEB_PAGE_RESULTS`, default 3) and extracts the most relevant passage — the part dense in query terms, scores and result phrases. This is what lets the model quote real scorecards instead of telling you to check a website.
4. Results, publication dates, page excerpts and the visitor's current date/time are injected into the system prompt; the model is told to use the exact figures and write a direct answer without mentioning the search or adding link lists.
5. Sources are kept in `meta.webSources` for diagnostics and saved with the message, but the UI does not display them.

Disable it globally with `WEB_SEARCH=off`, or per browser with the globe button. Page reading can be turned off separately with `WEB_PAGE_READ=off`. Tune with `WEB_SEARCH_RESULTS`, `WEB_SEARCH_TIMEOUT_MS`, `WEB_SEARCH_ENDPOINT` (any DuckDuckGo-HTML-compatible endpoint, e.g. a SearXNG instance), `WEB_PAGE_RESULTS`, `WEB_PAGE_TIMEOUT_MS` and `WEB_PAGE_CHARS`. Greetings and one-word messages skip the lookup. If every source fails, the chat still works from the model's own knowledge.

## Adding a provider or model

- **New model on an existing provider:** add it to `STATIC_MODELS` in `server/src/providers/index.js`, or set `EXTRA_MODELS` in `.env`. Any `provider:model` id works, even if it isn't in the catalog.
- **Default model:** set `DEFAULT_MODEL=provider:model` in `server/.env` (e.g. `ollama:qwen2.5:3b`). Without it the server picks a configured paid model, then the free hosted model, then a local one.
- **OpenAI-compatible endpoint** (LM Studio, vLLM, Groq, …): copy the `openrouter` entry in `providers/index.js` and change the base URL/key.
- **Different API:** add `providers/<name>.js` exporting `async *stream({ model, system, messages, temperature, signal })` that yields text deltas, then register it in `adapters`.

## Design notes & known limits

- **Free model:** the keyless Pollinations tier is shared and rate-limited; if a reply is slow, regenerate, or set `POLLINATIONS_API_KEY` / another provider key for priority. If an upstream returns an empty stream, the server retries once and then surfaces a clear error.
- **Web search is keyless and best-effort.** It reads the top few direct result pages, but JavaScript-heavy sites, paywalls and Google News redirects may not yield text. For guaranteed structured data (e.g. a live sports feed), plug a proper API into `services/websearch.js`.
- **Token counting is an estimate** (~4 chars/token, `services/tokens.js`). Swap in tiktoken or a provider counter for exact budgets.
- **RAG is lexical (BM25)**, not semantic, so it needs no embedding API. `retrieve()` in `services/rag.js` is the seam to plug in a vector store.
- **PDFs** must contain a text layer; scanned PDFs need OCR first. Images aren't supported yet.
- **Model IDs** in the catalog are defaults; provider model names change, so adjust them to what your keys can access.
- Some newer OpenAI models reject a custom `temperature`. If you hit that, drop the temperature line in `providers/openaiCompat.js`.

## Before exposing this publicly

This is a single-user app with no authentication. Before deploying beyond localhost, add: user auth and per-user data scoping, rate limiting, request logging, secret management for provider keys, upload virus scanning, and a restrictive `CLIENT_ORIGIN`.
