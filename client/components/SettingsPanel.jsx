'use client';
import { useState } from 'react';
import { FileText, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { useStore } from '@/lib/store';
import { fmtBytes, fmtNum } from '@/lib/utils';

const PRESETS = [
  { label: 'Concise', text: 'You are a concise assistant. Answer in as few words as possible without losing accuracy. Use bullet points for lists.' },
  { label: 'Senior engineer', text: 'You are a senior software engineer. Give production-quality code with brief explanations, note edge cases and trade-offs, and prefer simple solutions.' },
  { label: 'Editor', text: 'You are a meticulous writing editor. Improve clarity, tone and structure while preserving the author\'s voice. Show changes briefly.' },
  { label: 'Research analyst', text: 'You are a careful research analyst. Separate facts from assumptions, state uncertainty, and cite the provided documents where possible.' },
];

function Section({ title, hint, children }) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Inner() {
  const chat = useStore((s) => s.chat);
  const pendingSystem = useStore((s) => s.pendingSystem);
  const setSystemPrompt = useStore((s) => s.setSystemPrompt);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const models = useStore((s) => s.models);
  const modelId = useStore((s) => s.modelId);
  const lastMeta = useStore((s) => s.lastMeta);
  const removeFile = useStore((s) => s.removeFile);
  const setPanel = useStore((s) => s.setPanel);

  const saved = chat ? chat.systemPrompt || '' : pendingSystem;
  const [sys, setSys] = useState(saved);
  const dirty = sys !== saved;

  const model = models.find((m) => m.id === modelId);
  const maxCtx = Math.min(model?.contextWindow || 128000, 200000);
  const ctx = Math.min(settings.contextTokens, maxCtx);
  const stats = lastMeta?.stats;
  const files = chat?.files || [];
  const filesTokens = files.reduce((n, f) => n + f.tokens, 0);

  const close = () => setPanel(null);
  const apply = async () => {
    await setSystemPrompt(sys);
  };

  return (
    <Modal
      drawer
      title="Context & instructions"
      subtitle={chat ? 'Applies to this session' : 'Applies to the next chat you start'}
      onClose={close}
      footer={
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setSys('')} disabled={!sys} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-raised disabled:opacity-40">
            Reset to default
          </button>
          <div className="flex gap-2">
            <button onClick={close} className="rounded-lg px-3 py-2 text-sm hover:bg-raised">
              Close
            </button>
            <button
              onClick={apply}
              disabled={!dirty}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition enabled:hover:opacity-90 disabled:opacity-40"
            >
              {dirty ? 'Apply' : 'Applied'}
            </button>
          </div>
        </div>
      }
    >
      <Section title="System instructions" hint="Sent with every message in this session. Leave empty for the default assistant.">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setSys(p.text)} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-fg">
              {p.label}
            </button>
          ))}
        </div>
        <textarea
          value={sys}
          onChange={(e) => setSys(e.target.value)}
          rows={7}
          placeholder="e.g. You are a patient tutor. Explain step by step and ask a check-in question at the end."
          className="w-full resize-y rounded-xl border border-line bg-panel p-3 text-sm leading-relaxed outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
        />
        <p className="mt-1 text-right text-xs text-muted">{fmtNum(sys.length)} chars</p>
      </Section>

      <Section title="Model parameters">
        <label className="block text-sm">
          <div className="mb-1 flex justify-between">
            <span>Temperature</span>
            <span className="font-mono text-muted">{settings.temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.1}
            value={settings.temperature}
            onChange={(e) => updateSettings({ temperature: Number(e.target.value) })}
            className="w-full accent-[rgb(var(--accent))]"
          />
          <div className="flex justify-between text-[11px] text-muted">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </label>

        <label className="mt-4 block text-sm">
          <div className="mb-1 flex justify-between">
            <span>Context budget</span>
            <span className="font-mono text-muted">{fmtNum(ctx)} tokens</span>
          </div>
          <input
            type="range"
            min={2000}
            max={maxCtx}
            step={1000}
            value={ctx}
            onChange={(e) => updateSettings({ contextTokens: Number(e.target.value) })}
            className="w-full accent-[rgb(var(--accent))]"
          />
          <p className="text-[11px] text-muted">
            Older messages are trimmed to fit; the newest are always kept. Replies can run up to ~8,000 tokens.
          </p>
        </label>

        {stats && (
          <div className="mt-3 rounded-lg border border-line bg-panel p-3 text-xs">
            <div className="mb-1.5 flex justify-between">
              <span className="text-muted">Last request</span>
              <span className="font-mono">
                {fmtNum(stats.totalTokens)} / {fmtNum(stats.limit)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (stats.totalTokens / stats.limit) * 100)}%` }} />
            </div>
            <div className="mt-1.5 text-muted">
              System {fmtNum(stats.systemTokens)} · History {fmtNum(stats.historyTokens)}
              {stats.webResults > 0 && ` · ${stats.webResults} web source${stats.webResults > 1 ? 's' : ''}`}
              {stats.trimmed > 0 && ` · ${stats.trimmed} trimmed`}
            </div>
          </div>
        )}
      </Section>

      <Section title="Live web access" hint="Looks up current information before answering. Sources stay internal, so answers read naturally.">
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span>
            Search the web for each message
            <span className="block text-xs text-muted">
              Uses DuckDuckGo — no API key needed. Turn off for fully offline answers.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.webSearch}
            onChange={(e) => updateSettings({ webSearch: e.target.checked })}
            className="h-4 w-4 accent-[rgb(var(--accent))]"
          />
        </label>
      </Section>

      <Section title="Long-term memory">
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span>
            Include workspace memory
            <span className="block text-xs text-muted">Saved notes are added to the system context.</span>
          </span>
          <input
            type="checkbox"
            checked={settings.useMemory}
            onChange={(e) => updateSettings({ useMemory: e.target.checked })}
            className="h-4 w-4 accent-[rgb(var(--accent))]"
          />
        </label>
        <button onClick={() => setPanel('memory')} className="mt-2 text-xs text-accent hover:underline">
          Manage notes →
        </button>
      </Section>

      <Section title="Attached documents" hint={files.length ? `~${fmtNum(filesTokens)} tokens total. Relevant parts are retrieved per message.` : 'None yet. Use the paperclip in the message box.'}>
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-sm">
              <FileText size={15} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{f.name}</span>
                <span className="text-xs text-muted">
                  {fmtBytes(f.size)} · ~{fmtNum(f.tokens)} tokens
                </span>
              </span>
              <button onClick={() => removeFile(f.id)} aria-label={`Remove ${f.name}`} className="rounded p-1 text-muted hover:bg-raised hover:text-danger">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </Modal>
  );
}

export default function SettingsPanel() {
  const open = useStore((s) => s.panel === 'settings');
  return open ? <Inner /> : null;
}
