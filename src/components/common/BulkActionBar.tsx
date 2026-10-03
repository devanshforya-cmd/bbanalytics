'use client';

import React from 'react';
import { CheckSquare, X } from 'lucide-react';

interface BulkActionBarProps {
  selectedCount: number;
  totalCount?: number;
  onClearSelection: () => void;
  onSelectAll?: () => void;
  children: React.ReactNode;
  className?: string;
}

export default function BulkActionBar({
  selectedCount,
  totalCount,
  onClearSelection,
  onSelectAll,
  children,
  className = '',
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <aside
      aria-label="Bulk actions"
      className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-4xl bg-slate-900/95 text-white backdrop-blur-md shadow-2xl rounded-2xl border border-slate-700/60 p-3 sm:px-5 sm:py-3.5 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 ${className}`}
    >
      {/* Left info & selection controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="inline-flex items-center gap-1.5 font-bold text-xs sm:text-sm bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-1 rounded-lg">
          <CheckSquare className="w-3.5 h-3.5 shrink-0" />
          <span>{selectedCount} selected</span>
        </span>

        <button
          type="button"
          onClick={onClearSelection}
          className="text-xs text-slate-300 hover:text-white underline underline-offset-2 transition font-medium"
        >
          Deselect All
        </button>

        {onSelectAll && totalCount !== undefined && selectedCount < totalCount && (
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs text-blue-400 hover:text-blue-300 transition font-medium hidden sm:inline"
          >
            Select all {totalCount}
          </button>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end flex-1 sm:flex-initial">
        <div className="hidden sm:block h-6 w-px bg-slate-700 mx-1" />
        <div className="flex items-center gap-2 flex-wrap">{children}</div>
        <button
          type="button"
          onClick={onClearSelection}
          className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition ml-1 shrink-0"
          title="Dismiss selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
