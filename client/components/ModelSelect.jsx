'use client';
import { useRef, useState } from 'react';
import { Check, ChevronDown, Cpu } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useDismiss } from '@/lib/hooks';
import { cn } from '@/lib/utils';

const PROVIDER_LABELS = {
  pollinations: 'Free · live model',
  mock: 'Demo',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  ollama: 'Ollama (local)',
};

export default function ModelSelect() {
  const models = useStore((s) => s.models);
  const modelId = useStore((s) => s.modelId);
  const setModel = useStore((s) => s.setModel);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, () => setOpen(false), open);

  const current = models.find((m) => m.id === modelId);
  const groups = models.reduce((acc, m) => ((acc[m.provider] ||= []).push(m), acc), {});

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-[11.5rem] items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition hover:bg-raised sm:max-w-xs"
      >
        <Cpu size={15} className="shrink-0 text-muted" />
        <span className="truncate">{current?.label || 'Select model'}</span>
        <ChevronDown size={14} className={cn('shrink-0 text-muted transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div role="listbox" className="absolute left-0 top-full z-30 mt-1 max-h-[70dvh] w-72 overflow-y-auto rounded-xl border border-line bg-bg p-1.5 shadow-xl animate-fade-in">
          {Object.entries(groups).map(([provider, list]) => (
            <div key={provider} className="mb-1 last:mb-0">
              <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {PROVIDER_LABELS[provider] || provider}
              </div>
              {list.map((m) => (
                <button
                  key={m.id}
                  role="option"
                  aria-selected={m.id === modelId}
                  disabled={!m.available}
                  title={m.available ? m.id : m.hint}
                  onClick={() => (setModel(m.id), setOpen(false))}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition',
                    m.available ? 'hover:bg-raised' : 'cursor-not-allowed opacity-45',
                    m.id === modelId && 'bg-raised'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{m.label}</span>
                    {!m.available && <span className="block truncate text-xs text-muted">{m.hint}</span>}
                  </span>
                  {m.id === modelId && <Check size={15} className="shrink-0 text-accent" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
