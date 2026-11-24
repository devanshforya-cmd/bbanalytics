'use client';

import React, { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { driveFileId, isInlineFile } from '@/lib/photo-links';

/**
 * A saved photo (Drive link, image data waiting to upload, or a plain URL).
 * Shows a loading state while it downloads, retries once, and if it still cannot load
 * shows a clear tile with a link to the file in Drive instead of a broken-image icon.
 */
export default function StoredPhoto({ src, alt, className = 'h-full w-full', imgClassName = 'h-full w-full object-cover' }: { src: string; alt: string; className?: string; imgClassName?: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'retrying' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setState('loading'); setAttempt(0); }, [src]);
  const id = driveFileId(src);
  const url = attempt && !isInlineFile(src) ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src;

  if (state === 'failed') return (
    <div className={`flex flex-col items-center justify-center gap-1 bg-slate-100 p-2 text-center text-[11px] text-slate-500 ${className}`} role="img" aria-label={`${alt}: could not load`}>
      <ImageOff className="h-5 w-5 text-slate-400" aria-hidden="true" />
      <span className="font-semibold text-slate-600">Photo could not load</span>
      {id && <a href={`https://drive.google.com/file/d/${id}/view`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="font-semibold text-blue-700 underline">Open in Drive</a>}
      <button type="button" onClick={(event) => { event.stopPropagation(); setAttempt((n) => n + 1); setState('retrying'); }} className="font-semibold text-blue-700 underline">Try again</button>
    </div>
  );
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {state !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100" aria-hidden="true">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={url} src={url} alt={alt} loading="lazy" decoding="async" className={imgClassName}
        onLoad={() => setState('ready')}
        onError={() => { if (attempt === 0 && !isInlineFile(src)) { setAttempt(1); setState('retrying'); } else setState('failed'); }} />
    </div>
  );
}
