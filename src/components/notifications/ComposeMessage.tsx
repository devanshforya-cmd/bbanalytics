'use client';

import { useMemo, useState } from 'react';
import { Send, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';

/**
 * Write a message to chosen people or everyone. It lands in their bell, pops up in the app
 * and goes to their phone; clicking it shows the message.
 */
export default function ComposeMessage({ onClose, inline = false }: { onClose?: () => void; inline?: boolean }) {
  const me = db.getCurrentUser();
  const people = useMemo(() => [...new Map(db.getUsers().map((u) => [u.id, u])).values()].filter((u) => u.active !== false && u.id !== me.id).sort((a, b) => a.fullName.localeCompare(b.fullName)), [me.id]);
  const [everyone, setEveryone] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [sending, setSending] = useState(false);
  const shown = people.filter((p) => `${p.fullName} ${p.role}`.toLowerCase().includes(filter.trim().toLowerCase()));

  const send = async () => {
    if (!everyone && !chosen.length) { toast.error('Choose who gets the message.'); return; }
    if (!title.trim() || !message.trim()) { toast.error('Write a subject and a message.'); return; }
    setSending(true);
    try {
      const response = await fetch('/api/notifications/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, message, priority, everyone, userIds: chosen }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The message was not sent.');
      toast.success(`Message sent to ${data.sent} ${data.sent === 1 ? 'person' : 'people'}.`);
      setTitle(''); setMessage(''); setChosen([]); setEveryone(false);
      onClose?.();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'The message was not sent.'); }
    finally { setSending(false); }
  };

  const body = (
    <div className="space-y-3 text-sm">
      <fieldset>
        <legend className="mb-1 text-xs font-bold text-slate-700">To</legend>
        <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-800"><input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> Everyone ({people.length} people)</label>
        {!everyone && (
          <div className="rounded-xl border border-slate-200">
            <label htmlFor="compose-filter" className="sr-only">Find people</label>
            <input id="compose-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find people by name or role" className="w-full rounded-t-xl border-b border-slate-200 px-3 py-2 text-xs" />
            <ul className="max-h-40 overflow-y-auto p-1">
              {shown.map((p) => (
                <li key={p.id}><label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50">
                  <input type="checkbox" checked={chosen.includes(p.id)} onChange={() => setChosen((list) => list.includes(p.id) ? list.filter((id) => id !== p.id) : [...list, p.id])} />
                  <span className="font-medium text-slate-900">{p.fullName}</span><span className="text-slate-500">{String(p.role || '').replace(/_/g, ' ').toLowerCase()}</span>
                </label></li>
              ))}
            </ul>
            <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">{chosen.length} chosen</p>
          </div>
        )}
      </fieldset>
      <label className="block text-xs font-bold text-slate-700">Subject
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Stock count this Friday" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
      </label>
      <label className="block text-xs font-bold text-slate-700">Message
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
      </label>
      <label className="block text-xs font-bold text-slate-700">How important
        <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
          <option value="MEDIUM">Normal</option><option value="HIGH">Important</option><option value="URGENT">Urgent</option>
        </select>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        {onClose && <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>}
        <button type="button" onClick={() => void send()} disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-3.5 w-3.5" /> {sending ? 'Sending…' : 'Send message'}</button>
      </div>
    </div>
  );

  if (inline) return body;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="compose-title">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="compose-title" className="text-base font-bold text-slate-900">Send a message</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        {body}
      </div>
    </div>
  );
}
