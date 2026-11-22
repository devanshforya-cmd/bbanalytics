'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTipProps {
  children: React.ReactNode;
  /** Read by screen readers on the button, e.g. "About Daily Orders". */
  label?: string;
  /** Which way the bubble opens from the icon. */
  align?: 'left' | 'right' | 'center';
  className?: string;
}

/**
 * A small ⓘ that explains something on hover, keyboard focus or tap, so screens stay clean
 * instead of carrying a paragraph under every heading.
 */
export default function InfoTip({ children, label = 'More information', align = 'left', className = '' }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const position = align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0';
  return (
    <span ref={ref} className={`group/info relative inline-flex align-middle ${className}`} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={label} aria-describedby={open ? id : undefined} aria-expanded={open}
        onClick={() => setOpen((value) => !value)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-black/[0.05] hover:text-slate-600 active:scale-95">
        <Info className="h-[15px] w-[15px]" />
      </button>
      {open && (
        <span id={id} role="tooltip"
          className={`absolute top-full z-50 mt-1.5 w-max max-w-[300px] rounded-xl bg-slate-900/95 px-3 py-2 text-left text-xs font-normal leading-snug text-white shadow-lg backdrop-blur ${position}`}>
          {children}
        </span>
      )}
    </span>
  );
}
