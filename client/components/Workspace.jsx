'use client';
import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ChatView from './ChatView';
import Composer from './Composer';
import SettingsPanel from './SettingsPanel';
import PromptLibrary from './PromptLibrary';
import MemoryPanel from './MemoryPanel';
import Toaster from './Toaster';

export default function Workspace() {
  const init = useStore((s) => s.init);
  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-fg">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <ChatView />
        <Composer />
      </main>
      <SettingsPanel />
      <PromptLibrary />
      <MemoryPanel />
      <Toaster />
    </div>
  );
}
