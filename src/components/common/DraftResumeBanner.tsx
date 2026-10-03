'use client';

import React from 'react';
import { History, X } from 'lucide-react';

interface DraftResumeBannerProps {
  hasDraft: boolean;
  draftTimestamp?: string | null;
  onResume: () => void;
  onDiscard: () => void;
}

export default function DraftResumeBanner({
  hasDraft,
  draftTimestamp,
  onResume,
  onDiscard,
}: DraftResumeBannerProps) {
  if (!hasDraft) return null;

  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-slide-in-right">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 shrink-0">
          <History className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xs font-bold text-amber-950">
            Unsaved draft detected {draftTimestamp ? `(saved at ${draftTimestamp})` : ''}
          </p>
          <p className="text-[11px] text-amber-700">
            Would you like to resume where you left off or discard this draft?
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1.5 rounded-xl border border-amber-300 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onResume}
          className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition"
        >
          Resume Draft
        </button>
      </div>
    </div>
  );
}
