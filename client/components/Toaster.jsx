'use client';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function Toaster() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4" role="status" aria-live="polite">
      <div
        key={toast.id}
        className={cn(
          'pointer-events-auto max-w-md animate-fade-in rounded-xl border px-4 py-2.5 text-sm shadow-xl',
          toast.kind === 'error' ? 'border-danger/40 bg-bg text-danger' : 'border-line bg-bg text-fg'
        )}
      >
        {toast.message}
      </div>
    </div>
  );
}
