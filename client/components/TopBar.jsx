'use client';
import { Moon, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Sun } from 'lucide-react';
import { useStore } from '@/lib/store';
import ModelSelect from './ModelSelect';
import ExportMenu from './ExportMenu';

const iconBtn = 'rounded-lg p-2 text-muted transition hover:bg-raised hover:text-fg';

export default function TopBar() {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const dark = useStore((s) => s.dark);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const setPanel = useStore((s) => s.setPanel);
  const title = useStore((s) => s.chat?.title);
  const hasCustomSystem = useStore((s) => !!(s.chat ? s.chat.systemPrompt : s.pendingSystem)?.trim());

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b border-line/80 bg-bg/80 px-2 backdrop-blur-xl sm:px-3">
      <button onClick={toggleSidebar} aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} className={iconBtn}>
        {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
      </button>
      <ModelSelect />
      <div className="mx-2 hidden min-w-0 flex-1 truncate text-center text-sm font-medium text-muted md:block">
        {title || 'New chat'}
      </div>
      <div className="flex-1 md:hidden" />
      <button onClick={() => setPanel('settings')} aria-label="System prompt and context settings" title="System prompt & context" className={`${iconBtn} relative`}>
        <SlidersHorizontal size={18} />
        {hasCustomSystem && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />}
      </button>
      <ExportMenu scope="chat" triggerClass={iconBtn} />
      <button onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title="Toggle theme" className={iconBtn}>
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </header>
  );
}
