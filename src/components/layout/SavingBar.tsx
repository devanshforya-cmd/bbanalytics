'use client';

import React, { useEffect, useState } from 'react';
import { syncManager } from '@/lib/offline-sync';

/**
 * A thin line under the top bar while changes are being saved, so every action visibly
 * "takes" even when the button itself finishes instantly. Appears only after 150 ms to
 * avoid flicker on fast saves.
 */
export default function SavingBar() {
  const [sending, setSending] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => syncManager.subscribe(() => setSending(syncManager.isSending())), []);
  useEffect(() => {
    if (!sending) { setVisible(false); return; }
    const timer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(timer);
  }, [sending]);
  return (
    <div role="status" aria-live="polite" className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <span className="sr-only">{visible ? 'Saving changes' : ''}</span>
      <div className="bb-progress-bar h-full w-2/5 rounded-full bg-blue-600" />
    </div>
  );
}
