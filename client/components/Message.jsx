'use client';
import { memo, useState } from 'react';
import { Brain, Check, FileText, RefreshCw, Sparkles } from 'lucide-react';
import Markdown from './Markdown';
import CopyButton from './CopyButton';
import { useStore } from '@/lib/store';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function TypingDots() {
  return (
    <div className="flex h-6 items-center gap-1" aria-label="Assistant is thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

const statusLabel = (status) => {
  if (status?.stage === 'searching') return status.query ? `Checking the latest on “${status.query}”…` : 'Checking the latest information…';
  if (status?.stage === 'reading') return 'Reviewing recent updates…';
  if (status?.stage === 'retrying') return 'Retrying…';
  return 'Thinking…';
};

function UserMessage({ message }) {
  return (
    <div className="flex justify-end animate-fade-in">
      <div className="max-w-[88%] space-y-2 sm:max-w-[80%]">
        {message.attachments?.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {message.attachments.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1 text-xs text-muted">
                <FileText size={13} /> {a.name}
              </span>
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-raised px-4 py-2.5 text-[0.95rem] leading-relaxed ring-1 ring-line/60">
          {message.content}
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ message, isLast }) {
  const regenerate = useStore((s) => s.regenerate);
  const streaming = useStore((s) => s.streaming);
  const notify = useStore((s) => s.notify);
  const models = useStore((s) => s.models);
  const streamStatus = useStore((s) => s.streamStatus);
  const [saved, setSaved] = useState(false);
  const busy = message.streaming;
  const modelLabel = models.find((m) => m.id === message.model)?.label || message.model;

  const saveNote = async () => {
    try {
      await api.addMemory(message.content.slice(0, 600));
      setSaved(true);
      notify('Saved to workspace memory', 'info');
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="group flex gap-3 animate-fade-in">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-purple-500 text-white shadow-sm ring-1 ring-black/5">
        <Sparkles size={16} />
      </div>
      <div className="min-w-0 flex-1">
        {message.reasoning && (
          <details
            open={busy && !message.content}
            className="mb-2 rounded-xl border border-line bg-panel px-3 py-2 text-xs text-muted"
          >
            <summary className="cursor-pointer select-none font-medium">Reasoning</summary>
            <div className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {message.reasoning}
            </div>
          </details>
        )}

        {busy && !message.content ? (
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            <TypingDots />
            <span className="text-xs text-muted">{statusLabel(streamStatus)}</span>
          </div>
        ) : (
          <div className={cn(busy && 'caret')}>
            <Markdown text={message.content} />
          </div>
        )}

        {message.stopped && <p className="mt-2 text-xs italic text-muted">Generation stopped</p>}

        {!busy && message.content && (
          <div
            className={cn(
              'mt-2 flex items-center gap-0.5 text-muted transition-opacity',
              isLast ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
            )}
          >
            <CopyButton text={message.content} label="Copy" />
            {isLast && !streaming && (
              <button
                onClick={regenerate}
                title="Regenerate"
                aria-label="Regenerate response"
                className="rounded-md p-1.5 transition hover:bg-raised hover:text-fg"
              >
                <RefreshCw size={14} />
              </button>
            )}
            <button
              onClick={saveNote}
              title="Save to workspace memory"
              aria-label="Save to workspace memory"
              className="rounded-md p-1.5 transition hover:bg-raised hover:text-fg"
            >
              {saved ? <Check size={14} className="text-emerald-500" /> : <Brain size={14} />}
            </button>
            {modelLabel && <span className="ml-2 text-xs">{modelLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(function Message({ message, isLast }) {
  return message.role === 'user' ? <UserMessage message={message} /> : <AssistantMessage message={message} isLast={isLast} />;
});
