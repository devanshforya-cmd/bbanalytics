'use client';

import React, { useEffect, useState } from 'react';
import ConfirmModal from './ConfirmModal';

export interface ConfirmRequest { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; consequences?: string[] }

let open: ((request: ConfirmRequest, resolve: (answer: boolean) => void) => void) | null = null;

/**
 * Ask for confirmation with the app's own dialog instead of a browser alert.
 * Resolves true when confirmed, false when cancelled.
 */
export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => { if (open) open(request, resolve); else resolve(false); });
}

/** Mounted once in the app shell. */
export function ConfirmHost() {
  const [pending, setPending] = useState<{ request: ConfirmRequest; resolve: (answer: boolean) => void } | null>(null);
  useEffect(() => {
    open = (request, resolve) => setPending((current) => { current?.resolve(false); return { request, resolve }; });
    return () => { open = null; };
  }, []);
  const answer = (value: boolean) => { pending?.resolve(value); setPending(null); };
  return (
    <ConfirmModal isOpen={!!pending} title={pending?.request.title || ''} message={pending?.request.message} confirmLabel={pending?.request.confirmLabel}
      cancelLabel={pending?.request.cancelLabel} isDestructive={pending?.request.destructive} consequences={pending?.request.consequences}
      onConfirm={() => answer(true)} onCancel={() => answer(false)} />
  );
}
