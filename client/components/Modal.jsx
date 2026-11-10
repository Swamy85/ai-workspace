'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Centered modal (bottom sheet on mobile) or right-hand drawer. */
export default function Modal({ title, subtitle, onClose, children, footer, wide = false, drawer = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex bg-black/50 animate-fade-in',
        drawer ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-4'
      )}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'flex w-full flex-col overflow-hidden border-line bg-bg shadow-2xl',
          drawer
            ? 'h-full max-w-md animate-slide-in border-l'
            : cn('max-h-[90dvh] rounded-t-2xl border sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-xl')
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 rounded-lg p-1.5 text-muted transition hover:bg-raised hover:text-fg"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
