'use client';
import React from 'react';
import { Loader2 } from 'lucide-react';
import { usePhotoUploads } from '@/hooks/usePhotoUploads';

/** A small pill above the bottom bar while photos are going to Google Drive. */
export default function UploadIndicator() {
  const count = usePhotoUploads();
  if (!count) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[60] flex justify-center lg:bottom-6">
      <span className="flex items-center gap-2 rounded-full bg-slate-900/90 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Uploading {count === 1 ? 'photo' : `${count} photos`} to Drive…
      </span>
    </div>
  );
}
