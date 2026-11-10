'use client';
import { useRef, useState } from 'react';
import { Download, FileJson, FileText } from 'lucide-react';
import { useStore } from '@/lib/store';
import { useDismiss } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/** scope="chat" exports the active chat; scope="all" exports every chat. */
export default function ExportMenu({ scope = 'chat', up = false, triggerClass, children }) {
  const exportChat = useStore((s) => s.exportChat);
  const exportAll = useStore((s) => s.exportAll);
  const hasChat = useStore((s) => !!s.chat && s.chat.messages?.length > 0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(ref, () => setOpen(false), open);

  const run = (format) => {
    setOpen(false);
    return scope === 'all' ? exportAll(format) : exportChat(format);
  };
  const disabled = scope === 'chat' && !hasChat;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={scope === 'all' ? 'Export all chats' : 'Export this chat'}
        aria-label={scope === 'all' ? 'Export all chats' : 'Export this chat'}
        aria-haspopup="menu"
        className={cn('disabled:cursor-not-allowed disabled:opacity-40', triggerClass)}
      >
        {children || <Download size={18} />}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 w-48 rounded-xl border border-line bg-bg p-1.5 shadow-xl animate-fade-in',
            up ? 'bottom-full left-0 mb-1' : 'right-0 top-full mt-1'
          )}
        >
          <button role="menuitem" onClick={() => run('md')} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-raised">
            <FileText size={15} className="text-muted" /> Markdown (.md)
          </button>
          <button role="menuitem" onClick={() => run('json')} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-raised">
            <FileJson size={15} className="text-muted" /> JSON (.json)
          </button>
        </div>
      )}
    </div>
  );
}
