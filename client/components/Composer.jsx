'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, BookText, FileText, Globe, Loader2, Paperclip, Square, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn, estimateTokens, fmtNum } from '@/lib/utils';

const ACCEPT = '.txt,.md,.markdown,.pdf,.csv,.tsv,.json,.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.c,.cpp,.cs,.rb,.php,.html,.css,.yml,.yaml,.xml,.sql,.sh,.log';

export default function Composer() {
  const draft = useStore((s) => s.draft);
  const setDraft = useStore((s) => s.setDraft);
  const streaming = useStore((s) => s.streaming);
  const sendMessage = useStore((s) => s.sendMessage);
  const stop = useStore((s) => s.stop);
  const pending = useStore((s) => s.pendingFiles);
  const uploadFiles = useStore((s) => s.uploadFiles);
  const removeFile = useStore((s) => s.removeFile);
  const setPanel = useStore((s) => s.setPanel);
  const panel = useStore((s) => s.panel);
  const lastMeta = useStore((s) => s.lastMeta);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);

  const ta = useRef(null);
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Auto-grow textarea
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }, [draft]);

  // Return focus to the textarea after a panel closes (e.g. after inserting a prompt)
  useEffect(() => {
    if (panel === null) ta.current?.focus();
  }, [panel]);

  const canSend = (draft.trim() || pending.length) && !streaming && !uploading;

  const submit = () => {
    if (!canSend) return;
    sendMessage(draft.trim() || 'Please analyze the attached file(s) and summarize the key points.');
  };

  const handleFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    await uploadFiles(files);
    setUploading(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const stats = lastMeta?.stats;

  return (
    <div className="shrink-0 px-3 pb-3 pt-1">
      <div className="mx-auto w-full max-w-3xl">
        <div
          onDragOver={(e) => (e.preventDefault(), setDragging(true))}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            'rounded-2xl border bg-panel/95 shadow-lg shadow-black/[0.04] backdrop-blur transition focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20',
            dragging ? 'border-accent ring-2 ring-accent/30' : 'border-line'
          )}
        >
          {(pending.length > 0 || uploading) && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
              {pending.map((f) => (
                <span key={f.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-bg py-1 pl-2 pr-1 text-xs">
                  <FileText size={13} className="shrink-0 text-muted" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-muted">~{fmtNum(f.tokens)} tok</span>
                  <button onClick={() => removeFile(f.id)} aria-label={`Remove ${f.name}`} className="rounded p-0.5 text-muted hover:bg-raised hover:text-fg">
                    <X size={13} />
                  </button>
                </span>
              ))}
              {uploading && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-muted">
                  <Loader2 size={13} className="animate-spin" /> Reading file…
                </span>
              )}
            </div>
          )}

          <textarea
            ref={ta}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask anything…  (drop files here to attach)"
            aria-label="Message"
            className="block max-h-56 w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[0.95rem] leading-relaxed outline-none placeholder:text-muted"
          />

          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-0.5">
              <input ref={fileInput} type="file" multiple accept={ACCEPT} hidden onChange={(e) => (handleFiles(e.target.files), (e.target.value = ''))} />
              <button
                onClick={() => updateSettings({ webSearch: !settings.webSearch })}
                aria-pressed={settings.webSearch}
                aria-label={settings.webSearch ? 'Live web search is on' : 'Live web search is off'}
                title={
                  settings.webSearch
                    ? 'Live web search is ON — answers use current information. Click to turn off.'
                    : 'Turn on live web search for current information'
                }
                className={cn(
                  'relative rounded-lg p-2 transition hover:bg-raised',
                  settings.webSearch ? 'text-accent' : 'text-muted hover:text-fg'
                )}
              >
                <Globe size={18} />
                {settings.webSearch && <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-accent" />}
              </button>
              <button
                onClick={() => fileInput.current?.click()}
                title="Attach files (text, Markdown, PDF)"
                aria-label="Attach files"
                className="rounded-lg p-2 text-muted transition hover:bg-raised hover:text-fg"
              >
                <Paperclip size={18} />
              </button>
              <button
                onClick={() => setPanel('prompts')}
                title="Prompt library"
                aria-label="Open prompt library"
                className="rounded-lg p-2 text-muted transition hover:bg-raised hover:text-fg"
              >
                <BookText size={18} />
              </button>
              {draft.length > 0 && <span className="ml-2 hidden text-xs text-muted sm:inline">~{fmtNum(estimateTokens(draft))} tokens</span>}
            </div>

            {streaming ? (
              <button onClick={stop} aria-label="Stop generating" title="Stop generating" className="flex h-9 w-9 items-center justify-center rounded-xl bg-fg text-bg transition hover:opacity-90">
                <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!canSend}
                aria-label="Send message"
                title="Send (Enter)"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 space-y-1 px-2 text-center text-[11px] text-muted">
          <p>AI Workspace can make mistakes. Check important information.</p>
          <p className="flex flex-wrap justify-center gap-x-3">
            <span className="hidden sm:inline">Enter to send · Shift+Enter for a new line</span>
            {stats && (
              <span>
                Context {fmtNum(stats.totalTokens)} / {fmtNum(stats.limit)} tokens
                {stats.trimmed > 0 && ` · ${stats.trimmed} older message${stats.trimmed > 1 ? 's' : ''} trimmed`}
                {stats.docChunks > 0 && ` · ${stats.docChunks} doc chunk${stats.docChunks > 1 ? 's' : ''}`}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
