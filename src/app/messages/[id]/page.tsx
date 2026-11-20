'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import type { Notification } from '@/lib/types';
import { isMessage, notificationTarget } from '@/lib/notification-open';

/** Opened from a phone notification: shows one message on its own. */
export default function MessagePage() {
  const { id } = useParams<{ id: string }>();
  const [message, setMessage] = useState<Notification | null | undefined>(undefined);

  useEffect(() => {
    const find = () => {
      const found = db.getNotifications().find((n) => n.id === id);
      if (found) { setMessage(found); if (!found.read) db.markNotificationRead(found.id); }
      else setMessage((current) => current ?? null);
    };
    find();
    window.addEventListener('bb-db-updated', find);
    return () => window.removeEventListener('bb-db-updated', find);
  }, [id]);

  if (message === undefined) return <p className="p-6 text-sm text-slate-500">Loading message…</p>;
  if (!message) return (
    <div className="mx-auto max-w-lg p-6 text-sm">
      <p className="font-semibold text-slate-900">This message is not here yet.</p>
      <p className="mt-1 text-slate-500">It may still be syncing. Wait a moment, or open the bell at the top to see all your notifications.</p>
      <Link href="/dashboard" className="mt-4 inline-block font-semibold text-blue-600 hover:underline">Go to the dashboard</Link>
    </div>
  );
  if (!isMessage(message)) return (
    <div className="mx-auto max-w-lg p-6 text-sm"><Link href={notificationTarget(message)} className="font-semibold text-blue-600 hover:underline">Open {message.title}</Link></div>
  );
  return (
    <article className="mx-auto max-w-lg p-4 sm:p-6">
      <p className="text-xs text-slate-500">Message from {message.senderName || 'the office'} · {new Date(message.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
      <h1 className="mt-1 text-xl font-bold text-slate-900">{message.title}</h1>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-800">{message.message}</p>
      <Link href="/dashboard" className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Done</Link>
    </article>
  );
}
