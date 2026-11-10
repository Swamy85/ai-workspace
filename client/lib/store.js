import { create } from 'zustand';
import { api, downloadExport } from './api';
import { streamChat } from './stream';

const LS = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('aiw:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('aiw:' + key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};

const DEFAULT_SETTINGS = { temperature: 0.7, contextTokens: 32000, useMemory: true, webSearch: true };

const mapLast = (messages, fn) => messages.map((m, i) => (i === messages.length - 1 ? fn(m) : m));

const localTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

export const useStore = create((set, get) => ({
  // ── UI state ──────────────────────────────────────────
  ready: false,
  dark: false,
  sidebarOpen: true,
  panel: null, // 'settings' | 'prompts' | 'memory' | null
  toast: null,

  // ── Data ──────────────────────────────────────────────
  models: [],
  modelId: 'mock:mock-assistant',
  settings: DEFAULT_SETTINGS,
  chats: [],
  search: '',
  chat: null, // active chat (full), or null for an unsaved "new chat"
  pendingSystem: '', // system prompt for a chat that hasn't been created yet
  pendingFiles: [], // uploaded this turn, not yet sent
  draft: '',

  // ── Streaming ─────────────────────────────────────────
  streaming: false,
  abort: null,
  lastMeta: null,
  streamStatus: null,

  // ── Init / UI ─────────────────────────────────────────
  async init() {
    if (get().ready) return;
    const stored = LS.get('settings', {});
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    // Move anyone still on the old 8k default up to the roomier budget.
    if (settings.contextTokens === 8000) settings.contextTokens = DEFAULT_SETTINGS.contextTokens;
    LS.set('settings', settings);
    set({
      ready: true,
      dark: document.documentElement.classList.contains('dark'),
      sidebarOpen: LS.get('sidebar', window.innerWidth >= 768) && window.innerWidth >= 768,
      settings,
    });
    try {
      const [{ models, defaultModelId }, chats] = await Promise.all([api.models(), api.listChats()]);
      const saved = LS.get('model', null);
      const usable = (id) => models.find((m) => m.id === id && m.available);
      let chosen = usable(saved) ? saved : defaultModelId;
      // Migrate anyone still on the old demo model to the free real model.
      if (chosen === 'mock:mock-assistant' && defaultModelId !== 'mock:mock-assistant') chosen = defaultModelId;
      set({ models, chats, modelId: chosen });
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  notify(message, kind = 'info') {
    set({ toast: { message, kind, id: Date.now() } });
    const id = get().toast.id;
    setTimeout(() => get().toast?.id === id && set({ toast: null }), 4500);
  },

  toggleTheme() {
    const dark = !get().dark;
    document.documentElement.classList.toggle('dark', dark);
    LS.set('theme', dark ? 'dark' : 'light');
    set({ dark });
  },

  toggleSidebar() {
    const sidebarOpen = !get().sidebarOpen;
    if (window.innerWidth >= 768) LS.set('sidebar', sidebarOpen);
    set({ sidebarOpen });
  },

  setPanel: (panel) => set({ panel }),
  setDraft: (draft) => set({ draft }),

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    LS.set('settings', settings);
    set({ settings });
  },

  async setModel(id) {
    LS.set('model', id);
    set({ modelId: id });
    const { chat } = get();
    if (chat) api.patchChat(chat.id, { modelId: id }).catch(() => {});
  },

  // ── Chat list ─────────────────────────────────────────
  async loadChats(q = get().search) {
    try {
      set({ chats: await api.listChats(q) });
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  async setSearch(q) {
    set({ search: q });
    await get().loadChats(q);
  },

  newChat() {
    get().stop();
    set({ chat: null, pendingFiles: [], lastMeta: null, draft: '', pendingSystem: '', streamStatus: null });
    if (window.innerWidth < 768) set({ sidebarOpen: false });
  },

  async selectChat(id) {
    if (get().chat?.id === id) {
      if (window.innerWidth < 768) set({ sidebarOpen: false });
      return;
    }
    get().stop();
    try {
      const chat = await api.getChat(id);
      set({ chat, pendingFiles: [], lastMeta: null, streamStatus: null });
      if (chat.modelId && get().models.some((m) => m.id === chat.modelId && m.available)) set({ modelId: chat.modelId });
      if (window.innerWidth < 768) set({ sidebarOpen: false });
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  async deleteChat(id) {
    try {
      await api.deleteChat(id);
      if (get().chat?.id === id) set({ chat: null, pendingFiles: [], lastMeta: null, streamStatus: null });
      await get().loadChats();
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  async renameChat(id, title) {
    try {
      await api.patchChat(id, { title });
      if (get().chat?.id === id) set((s) => ({ chat: { ...s.chat, title } }));
      await get().loadChats();
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  async pinChat(id, pinned) {
    try {
      await api.patchChat(id, { pinned });
      await get().loadChats();
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  async clearAll() {
    try {
      get().stop();
      await api.clearChats();
      set({ chat: null, chats: [], pendingFiles: [], lastMeta: null });
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  // ── Per-session system prompt ─────────────────────────
  async setSystemPrompt(text) {
    const { chat } = get();
    if (!chat) return set({ pendingSystem: text });
    try {
      await api.patchChat(chat.id, { systemPrompt: text });
      set({ chat: { ...chat, systemPrompt: text } });
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  // ── Lazily create the server-side chat on first use ───
  async ensureChat() {
    const existing = get().chat;
    if (existing) return existing;
    const chat = await api.createChat({ systemPrompt: get().pendingSystem, modelId: get().modelId });
    set({ chat, pendingSystem: '' });
    await get().loadChats();
    return chat;
  },

  // ── Files / RAG ───────────────────────────────────────
  async uploadFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    try {
      const chat = await get().ensureChat();
      for (const file of files) {
        try {
          const meta = await api.uploadFile(chat.id, file);
          set((s) => ({
            pendingFiles: [...s.pendingFiles, meta],
            chat: { ...s.chat, files: [...(s.chat.files || []), meta] },
          }));
        } catch (err) {
          get().notify(`${file.name}: ${err.message}`, 'error');
        }
      }
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  async removeFile(fileId) {
    const { chat } = get();
    if (!chat) return;
    try {
      await api.deleteFile(chat.id, fileId);
      set((s) => ({
        pendingFiles: s.pendingFiles.filter((f) => f.id !== fileId),
        chat: { ...s.chat, files: (s.chat.files || []).filter((f) => f.id !== fileId) },
      }));
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  // ── Messaging ─────────────────────────────────────────
  stop() {
    get().abort?.abort();
  },

  async sendMessage(text, { regenerate = false } = {}) {
    if (get().streaming) return;
    let chat;
    try {
      chat = await get().ensureChat();
    } catch (err) {
      return get().notify(err.message, 'error');
    }

    const { modelId, settings, pendingFiles } = get();
    const attachments = regenerate ? [] : pendingFiles.map((f) => ({ id: f.id, name: f.name }));
    const now = new Date().toISOString();
    const tmp = Date.now();
    const userMsg = { id: `tmp-u-${tmp}`, role: 'user', content: text, createdAt: now, attachments };
    const asstMsg = { id: `tmp-a-${tmp}`, role: 'assistant', content: '', model: modelId, createdAt: now, streaming: true };

    set((s) => {
      let msgs = [...(s.chat.messages || [])];
      if (regenerate) while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop();
      else msgs.push(userMsg);
      return {
        chat: { ...s.chat, messages: [...msgs, asstMsg] },
        streaming: true,
        draft: regenerate ? s.draft : '',
        pendingFiles: regenerate ? s.pendingFiles : [],
        lastMeta: null,
        streamStatus: null,
      };
    });

    const controller = new AbortController();
    set({ abort: controller });

    // Batch token deltas into one state update per animation frame.
    let buffer = '';
    let thoughtBuffer = '';
    let raf = null;
    let rafThought = null;
    const flush = () => {
      raf = null;
      if (!buffer) return;
      const chunk = buffer;
      buffer = '';
      set((s) => ({ chat: { ...s.chat, messages: mapLast(s.chat.messages, (m) => ({ ...m, content: m.content + chunk })) } }));
    };
    const flushThought = () => {
      rafThought = null;
      if (!thoughtBuffer) return;
      const chunk = thoughtBuffer;
      thoughtBuffer = '';
      set((s) => ({
        chat: {
          ...s.chat,
          messages: mapLast(s.chat.messages, (m) => ({ ...m, reasoning: (m.reasoning || '') + chunk })),
        },
      }));
    };

    let streamError = null;
    try {
      await streamChat({
        chatId: chat.id,
        signal: controller.signal,
        body: {
          content: text,
          regenerate,
          modelId,
          temperature: settings.temperature,
          contextTokens: settings.contextTokens,
          useMemory: settings.useMemory,
          webSearch: settings.webSearch,
          timeZone: localTimeZone(),
          attachments,
        },
        handlers: {
          onStatus: (status) => set({ streamStatus: status }),
          onMeta: (meta) => set({ lastMeta: meta, streamStatus: null }),
          onReasoning: (t) => {
            thoughtBuffer += t;
            if (rafThought == null) rafThought = requestAnimationFrame(flushThought);
          },
          onDelta: (t) => {
            buffer += t;
            if (raf == null) raf = requestAnimationFrame(flush);
          },
          onTitle: (title) => set((s) => ({ chat: { ...s.chat, title } })),
          onDone: ({ message } = {}) => {
            if (!message) return;
            // The server sends the cleaned final text; use it so any trailing
            // source block or raw link never survives in the transcript.
            if (raf != null) cancelAnimationFrame(raf);
            if (rafThought != null) cancelAnimationFrame(rafThought);
            raf = rafThought = null;
            buffer = '';
            thoughtBuffer = '';
            set((s) => ({
              chat: {
                ...s.chat,
                messages: mapLast(s.chat.messages, (m) => ({
                  ...m,
                  content: typeof message.content === 'string' ? message.content : m.content,
                  ...(message.reasoning ? { reasoning: message.reasoning } : {}),
                  ...(message.stopped ? { stopped: true } : {}),
                })),
              },
            }));
          },
          onError: (message) => (streamError = message),
        },
      });
    } catch (err) {
      streamError = err.message;
    } finally {
      if (raf != null) cancelAnimationFrame(raf);
      if (rafThought != null) cancelAnimationFrame(rafThought);
      flush();
      flushThought();
      set({ streaming: false, abort: null, streamStatus: null });
    }

    // Re-sync with the server (real message ids, persisted stop/partial state).
    try {
      const fresh = await api.getChat(chat.id);
      if (get().chat?.id === chat.id) set({ chat: fresh });
    } catch {
      /* keep optimistic state */
    }
    if (streamError) get().notify(streamError, 'error');
    get().loadChats();
  },

  regenerate() {
    const msgs = get().chat?.messages || [];
    if (msgs.length) get().sendMessage(null, { regenerate: true });
  },

  // ── Export ────────────────────────────────────────────
  async exportChat(format) {
    const { chat } = get();
    if (!chat) return get().notify('Nothing to export yet', 'info');
    try {
      await downloadExport(`/chats/${chat.id}/export?format=${format}`, `chat.${format}`);
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },

  async exportAll(format) {
    try {
      await downloadExport(`/chats/export?format=${format}`, `chats.${format}`);
    } catch (err) {
      get().notify(err.message, 'error');
    }
  },
}));
