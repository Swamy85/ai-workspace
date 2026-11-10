'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText, cn } from '@/lib/utils';

export default function CopyButton({ text, label = 'Copy', showLabel = false, className }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={async () => {
        if (await copyText(typeof text === 'function' ? text() : text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted transition hover:bg-raised hover:text-fg',
        className
      )}
    >
      {done ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
      {showLabel && <span>{done ? 'Copied' : label}</span>}
    </button>
  );
}
