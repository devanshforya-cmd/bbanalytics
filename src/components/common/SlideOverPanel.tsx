'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { X, ArrowLeft } from 'lucide-react';

interface SlideOverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
  footer?: React.ReactNode;
  level?: 1 | 2;
}

export default function SlideOverPanel({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'md',
  footer,
  level = 1,
}: SlideOverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // ESC key close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const widthClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[width];
  const offsetClass = level === 2 ? 'sm:mr-8' : '';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`
          relative flex flex-col w-full ${widthClass} ${offsetClass}
          bg-white shadow-2xl
          transform transition-transform duration-350 ease-out
          animate-slide-in-right
        `}
        style={{ animation: 'slideInRight 0.35s ease-out forwards' }}
      >
        {/* Header */}
        {(title || subtitle) && (
          <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                {title && <h2 className="font-bold text-slate-900 text-sm">{title}</h2>}
                {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t border-slate-100 px-5 py-4 bg-slate-50/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
