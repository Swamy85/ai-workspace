'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, BookText, Code2, Globe, Lightbulb, Newspaper, Paperclip, Sparkles, Trophy } from 'lucide-react';
import Message from './Message';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  {
    icon: Newspaper,
    tint: 'text-sky-500',
    title: 'Today’s briefing',
    text: 'What are the biggest news stories today? Give me a concise briefing.',
  },
  {
    icon: Trophy,
    tint: 'text-amber-500',
    title: 'Live facts',
    text: 'Who won the most recent Formula 1 race, and what were the top three finishers?',
  },
  {
    icon: Lightbulb,
    tint: 'text-emerald-500',
    title: 'Explain a concept',
    text: 'Explain how Server-Sent Events work and when to use them instead of WebSockets.',
  },
  {
    icon: Code2,
    tint: 'text-violet-500',
    title: 'Write code',
    text: 'Write a TypeScript debounce function with a cancel method, and show a usage example.',
  },
];

function EmptyState() {
  const sendMessage = useStore((s) => s.sendMessage);
  const setPanel = useStore((s) => s.setPanel);
  const modelId = useStore((s) => s.modelId);
  const webSearch = useStore((s) => s.settings.webSearch);
  return (
    <div className="relative mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-12 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-6 -z-0 h-72 bg-[radial-gradient(ellipse_at_center,rgb(var(--accent)/0.16),transparent_70%)]"
      />

      <div className="relative flex flex-col items-center animate-fade-in">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-purple-500 text-white shadow-xl shadow-accent/20 ring-1 ring-white/20">
          <Sparkles size={30} />
        </div>
        <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1 text-xs text-muted backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live model · up-to-date information
        </span>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">What can I help you with?</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted sm:text-[0.95rem]">
          Ask a question, think through an idea, or work on a document. Answers stream in real time with current
          information and a context window built for long conversations.
        </p>
      </div>

      {modelId.startsWith('mock:') && (
        <p className="relative mt-5 max-w-md rounded-xl border border-line bg-panel/80 px-3 py-2 text-xs text-muted">
          You&apos;re on the offline demo model. Pick <strong>GPT-OSS 20B (free)</strong> in the model menu for real
          answers, or add an API key in <code className="font-mono">server/.env</code>.
        </p>
      )}

      <div className="relative mt-9 grid w-full gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.title}
              onClick={() => sendMessage(s.text)}
              className="group flex items-start gap-3 rounded-2xl border border-line bg-panel/70 p-4 text-left shadow-sm backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
            >
              <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised', s.tint)}>
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-medium">
                  {s.title}
                  <ArrowUpRight size={13} className="opacity-0 transition group-hover:opacity-60" />
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted">{s.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative mt-7 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className={webSearch ? 'inline-flex items-center gap-1.5 text-accent' : 'inline-flex items-center gap-1.5'}>
          <Globe size={13} /> {webSearch ? 'Live web search is on' : 'Live web search is off'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Paperclip size={13} /> Attach text, Markdown or PDF files
        </span>
        <button onClick={() => setPanel('prompts')} className="inline-flex items-center gap-1.5 transition hover:text-fg">
          <BookText size={13} /> Browse the prompt library
        </button>
      </div>
    </div>
  );
}

export default function ChatView() {
  const chat = useStore((s) => s.chat);
  const messages = chat?.messages || [];
  const last = messages[messages.length - 1];

  const scroller = useRef(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const toBottom = (smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  // New message or different chat: jump to the bottom and re-enable follow mode.
  useEffect(() => {
    stick.current = true;
    toBottom();
  }, [messages.length, chat?.id]);

  // While streaming, follow output only if the user hasn't scrolled up.
  useEffect(() => {
    if (stick.current) toBottom();
  }, [last?.content]);

  const onScroll = () => {
    const el = scroller.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stick.current = nearBottom;
    setShowJump(!nearBottom);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
            {messages.map((m, i) => (
              <Message key={m.id} message={m} isLast={i === messages.length - 1} />
            ))}
          </div>
        )}
      </div>
      {showJump && messages.length > 0 && (
        <button
          onClick={() => toBottom(true)}
          aria-label="Scroll to latest message"
          className="absolute bottom-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-bg text-muted shadow-lg transition hover:text-fg"
        >
          <ArrowDown size={16} />
        </button>
      )}
    </div>
  );
}
