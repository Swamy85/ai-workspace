'use client';
import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { estimateTokens, fmtNum } from '@/lib/utils';

function Inner() {
  const setPanel = useStore((s) => s.setPanel);
  const notify = useStore((s) => s.notify);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [notes, setNotes] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setNotes(await api.listMemory());
    } catch (err) {
      notify(err.message, 'error');
      setNotes([]);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.addMemory(text.trim());
      setText('');
      await load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (n) => {
    setNotes((list) => list.map((x) => (x.id === n.id ? { ...x, enabled: !(x.enabled !== false) } : x)));
    try {
      await api.updateMemory(n.id, { enabled: n.enabled === false });
    } catch (err) {
      notify(err.message, 'error');
      load();
    }
  };

  const remove = async (n) => {
    setNotes((list) => list.filter((x) => x.id !== n.id));
    try {
      await api.deleteMemory(n.id);
    } catch (err) {
      notify(err.message, 'error');
      load();
    }
  };

  const active = (notes || []).filter((n) => n.enabled !== false);
  const tokens = active.reduce((n, x) => n + estimateTokens(x.text), 0);

  return (
    <Modal
      title="Workspace memory"
      subtitle="Long-term notes added to the system context of every chat"
      onClose={() => setPanel(null)}
    >
      <label className="mb-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-panel px-3.5 py-3 text-sm">
        <span>
          Use memory in chats
          <span className="block text-xs text-muted">{active.length} active · ~{fmtNum(tokens)} tokens</span>
        </span>
        <input type="checkbox" checked={settings.useMemory} onChange={(e) => updateSettings({ useMemory: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />
      </label>

      <div className="mb-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && add()}
          rows={3}
          maxLength={1000}
          placeholder="e.g. I work in TypeScript and prefer functional style. Our API uses snake_case."
          aria-label="New memory note"
          className="w-full resize-none rounded-xl border border-line bg-panel p-3 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted">Ctrl/⌘ + Enter to save</span>
          <button onClick={add} disabled={busy || !text.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-40">
            <Plus size={15} /> Add note
          </button>
        </div>
      </div>

      {notes === null ? (
        <div className="flex justify-center py-8 text-muted"><Loader2 className="animate-spin" /></div>
      ) : notes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          No notes yet. Add facts about you, your projects, or preferences — or use the brain icon under any reply to save it.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3">
              <input type="checkbox" checked={n.enabled !== false} onChange={() => toggle(n)} aria-label="Enable note" className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" />
              <p className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed ${n.enabled === false ? 'text-muted line-through' : ''}`}>{n.text}</p>
              <button onClick={() => remove(n)} aria-label="Delete note" className="rounded p-1 text-muted hover:bg-raised hover:text-danger">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function MemoryPanel() {
  const open = useStore((s) => s.panel === 'memory');
  return open ? <Inner /> : null;
}
