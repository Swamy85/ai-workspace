'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { cn, extractVars, fillTemplate } from '@/lib/utils';

const MULTILINE = /code|text|notes|email|document|content|body|message/i;
const field = 'w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20';

function VarsForm({ prompt, onBack, onInsert }) {
  const vars = extractVars(prompt.content);
  const [values, setValues] = useState({});
  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={15} /> Back
      </button>
      <h3 className="mb-3 text-sm font-semibold">{prompt.title}</h3>
      <div className="space-y-3">
        {vars.map((v, i) => (
          <label key={v} className="block text-sm">
            <span className="mb-1 block font-medium capitalize">{v.replace(/([A-Z])/g, ' $1')}</span>
            {MULTILINE.test(v) ? (
              <textarea autoFocus={i === 0} rows={5} value={values[v] || ''} onChange={(e) => setValues({ ...values, [v]: e.target.value })} className={cn(field, 'resize-y font-mono text-[13px]')} />
            ) : (
              <input autoFocus={i === 0} value={values[v] || ''} onChange={(e) => setValues({ ...values, [v]: e.target.value })} className={field} />
            )}
          </label>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={() => onInsert(fillTemplate(prompt.content, values))} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
          Insert into message
        </button>
      </div>
    </div>
  );
}

function EditForm({ prompt, categories, onBack, onSaved }) {
  const notify = useStore((s) => s.notify);
  const [title, setTitle] = useState(prompt?.title || '');
  const [category, setCategory] = useState(prompt?.category || 'General');
  const [content, setContent] = useState(prompt?.content || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body = { title, category, content };
      await (prompt ? api.updatePrompt(prompt.id, body) : api.createPrompt(body));
      onSaved();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={15} /> Back
      </button>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Title</span>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="e.g. Release notes writer" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Category</span>
            <input list="prompt-cats" value={category} onChange={(e) => setCategory(e.target.value)} className={field} />
            <datalist id="prompt-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Template</span>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} className={cn(field, 'resize-y font-mono text-[13px]')} placeholder={'Write a {{tone}} summary of {{topic}}…'} />
          <span className="mt-1 block text-xs text-muted">
            Use <code className="font-mono">{'{{variable}}'}</code> placeholders. You&apos;ll be asked to fill them in when you use the prompt.
          </span>
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onBack} className="rounded-lg px-3 py-2 text-sm hover:bg-raised">Cancel</button>
        <button onClick={save} disabled={saving || !title.trim() || !content.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save prompt'}
        </button>
      </div>
    </div>
  );
}

function Inner() {
  const setPanel = useStore((s) => s.setPanel);
  const setDraft = useStore((s) => s.setDraft);
  const notify = useStore((s) => s.notify);
  const [prompts, setPrompts] = useState(null);
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [view, setView] = useState({ name: 'list' });

  const load = async () => {
    try {
      setPrompts(await api.listPrompts());
    } catch (err) {
      notify(err.message, 'error');
      setPrompts([]);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => [...new Set((prompts || []).map((p) => p.category))], [prompts]);
  const visible = useMemo(() => {
    const needle = q.toLowerCase();
    return (prompts || []).filter(
      (p) => (cat === 'All' || p.category === cat) && (!needle || p.title.toLowerCase().includes(needle) || p.content.toLowerCase().includes(needle))
    );
  }, [prompts, cat, q]);

  const insert = (text) => {
    const cur = useStore.getState().draft;
    setDraft(cur.trim() ? `${cur}\n\n${text}` : text);
    setPanel(null);
  };
  const use = (p) => (extractVars(p.content).length ? setView({ name: 'vars', prompt: p }) : insert(p.content));
  const remove = async (p) => {
    if (!window.confirm(`Delete prompt "${p.title}"?`)) return;
    try {
      await api.deletePrompt(p.id);
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <Modal
      wide
      title="Prompt library"
      subtitle="Reusable templates for common work tasks"
      onClose={() => setPanel(null)}
    >
      {view.name === 'vars' && <VarsForm prompt={view.prompt} onBack={() => setView({ name: 'list' })} onInsert={insert} />}
      {view.name === 'edit' && (
        <EditForm prompt={view.prompt} categories={categories} onBack={() => setView({ name: 'list' })} onSaved={() => (setView({ name: 'list' }), load())} />
      )}
      {view.name === 'list' && (
        <>
          <div className="mb-3 flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-panel px-3 focus-within:border-accent/60">
              <Search size={15} className="text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search prompts…" aria-label="Search prompts" className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted" />
            </div>
            <button onClick={() => setView({ name: 'edit', prompt: null })} className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={16} /> New
            </button>
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {['All', ...categories].map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn('rounded-full border px-3 py-1 text-xs transition', c === cat ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted hover:text-fg')}>
                {c}
              </button>
            ))}
          </div>

          {prompts === null ? (
            <div className="flex justify-center py-12 text-muted"><Loader2 className="animate-spin" /></div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">No prompts found.</p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {visible.map((p) => (
                <div key={p.id} className="flex flex-col rounded-xl border border-line bg-panel p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{p.title}</h3>
                    <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] font-medium text-muted">{p.category}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-3 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-muted">{p.content}</p>
                  <div className="mt-3 flex items-center gap-1">
                    <button onClick={() => use(p)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90">Use</button>
                    <button onClick={() => setView({ name: 'edit', prompt: p })} aria-label={`Edit ${p.title}`} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-raised hover:text-fg"><Pencil size={14} /></button>
                    <button onClick={() => remove(p)} aria-label={`Delete ${p.title}`} className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-danger"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export default function PromptLibrary() {
  const open = useStore((s) => s.panel === 'prompts');
  return open ? <Inner /> : null;
}
