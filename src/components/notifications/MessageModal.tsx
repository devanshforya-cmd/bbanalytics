'use client';

import { X } from 'lucide-react';
import type { Notification } from '@/lib/types';

/** A written message, shown in full. */
export default function MessageModal({ message, onClose }: { message: Notification; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="message-title" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Message from {message.senderName || 'the office'} · {new Date(message.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
            <h2 id="message-title" className="mt-1 text-lg font-bold text-slate-900">{message.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{message.message}</p>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Done</button>
        </div>
      </div>
    </div>
  );
}
