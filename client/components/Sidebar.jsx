'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BookText, Brain, Download, MessageSquare, Pencil, Pin, PinOff, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useStore } from '@/lib/store';
import { cn, groupChats } from '@/lib/utils';
import ExportMenu from './ExportMenu';

function ChatItem({ chat, active }) {
  const selectChat = useStore((s) => s.selectChat);
  const deleteChat = useStore((s) => s.deleteChat);
  const renameChat = useStore((s) => s.renameChat);
  const pinChat = useStore((s) => s.pinChat);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(chat.title);

  const commit = () => {
    setEditing(false);
    const t = value.trim();
    if (t && t !== chat.title) renameChat(chat.id, t);
    else setValue(chat.title);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') (setValue(chat.title), setEditing(false));
        }}
        aria-label="Rename chat"
        className="w-full rounded-lg border border-accent/60 bg-bg px-2.5 py-2 text-sm outline-none"
      />
    );
  }

  const act = 'rounded p-1 text-muted hover:bg-bg hover:text-fg';
  return (
    <div
      className={cn(
        'group relative flex items-center rounded-lg transition',
        active ? 'bg-raised' : 'hover:bg-raised/60'
      )}
    >
      <button onClick={() => selectChat(chat.id)} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm" title={chat.title}>
        {chat.title}
      </button>
      <div className="absolute right-1 hidden items-center gap-0.5 rounded-md bg-raised pl-1 group-focus-within:flex group-hover:flex">
        <button onClick={() => pinChat(chat.id, !chat.pinned)} aria-label={chat.pinned ? 'Unpin chat' : 'Pin chat'} title={chat.pinned ? 'Unpin' : 'Pin'} className={act}>
          {chat.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button onClick={() => setEditing(true)} aria-label="Rename chat" title="Rename" className={act}>
          <Pencil size={14} />
        </button>
        <button
          onClick={() => window.confirm(`Delete "${chat.title}"?`) && deleteChat(chat.id)}
          aria-label="Delete chat"
          title="Delete"
          className={cn(act, 'hover:text-danger')}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const open = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const chats = useStore((s) => s.chats);
  const activeId = useStore((s) => s.chat?.id);
  const newChat = useStore((s) => s.newChat);
  const setSearch = useStore((s) => s.setSearch);
  const setPanel = useStore((s) => s.setPanel);
  const clearAll = useStore((s) => s.clearAll);

  const [q, setQ] = useState('');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, setSearch]);

  const groups = useMemo(() => groupChats(chats), [chats]);
  const footerBtn = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-raised hover:text-fg';

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={toggleSidebar} aria-hidden />}
      <aside
        aria-label="Chat history"
        className={cn(
          'z-40 shrink-0 overflow-hidden border-r border-line bg-panel transition-[width,transform,visibility] duration-200',
          'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-72',
          open ? 'visible md:w-72 max-md:translate-x-0' : 'invisible md:w-0 md:border-r-0 max-md:-translate-x-full'
        )}
      >
        <div className="flex h-full w-72 flex-col">
          <div className="flex items-center gap-2.5 px-3 pb-1 pt-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-purple-500 text-white shadow-sm ring-1 ring-white/20">
              <Sparkles size={16} />
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold tracking-tight">AI Workspace</div>
              <div className="truncate text-[11px] text-muted">Live answers · your documents</div>
            </div>
            <button onClick={toggleSidebar} aria-label="Close sidebar" className="rounded-lg p-2 text-muted hover:bg-raised md:hidden">
              <X size={18} />
            </button>
          </div>

          <div className="px-3 py-2.5">
            <button
              onClick={newChat}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-accent-fg shadow-sm transition hover:opacity-90 active:scale-[0.99]"
            >
              <Plus size={16} /> New chat
            </button>
          </div>

          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2.5 focus-within:border-accent/60">
              <Search size={14} className="shrink-0 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search chats…"
                aria-label="Search chats"
                className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted"
              />
              {q && (
                <button onClick={() => setQ('')} aria-label="Clear search" className="text-muted hover:text-fg">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {groups.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
                <MessageSquare size={22} />
                {q ? 'No chats match your search.' : 'Your conversations will appear here.'}
              </div>
            )}
            {groups.map((g) => (
              <div key={g.label} className="mb-3">
                <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</div>
                <div className="space-y-0.5">
                  {g.items.map((c) => (
                    <ChatItem key={c.id} chat={c} active={c.id === activeId} />
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="space-y-0.5 border-t border-line p-2">
            <button onClick={() => setPanel('prompts')} className={footerBtn}>
              <BookText size={16} /> Prompt library
            </button>
            <button onClick={() => setPanel('memory')} className={footerBtn}>
              <Brain size={16} /> Workspace memory
            </button>
            <ExportMenu scope="all" up triggerClass={footerBtn}>
              <Download size={16} /> Export all chats
            </ExportMenu>
            <button
              onClick={() => chats.length && window.confirm('Delete ALL chats and attached files? This cannot be undone.') && clearAll()}
              disabled={!chats.length}
              className={cn(footerBtn, 'hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted')}
            >
              <Trash2 size={16} /> Clear history
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
