'use client';

import { useEffect, useMemo, useState } from 'react';
import { BellRing, Plus, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { hasAccess, isSuperAdmin } from '@/lib/permissions';
import { NOTIFICATION_EVENTS, eventRecipients, type NotificationEventKey, type NotificationRouting } from '@/lib/notification-events';
import ComposeMessage from '@/components/notifications/ComposeMessage';
import { toast } from '@/components/common/Toast';

const GROUPS = ['Store sales', 'Online sales', 'Money', 'Work', 'Daily'] as const;

/**
 * Super Admins choose which automatic notifications go out and to whom, and send messages.
 * Nobody is sent something they cannot open, even if added here.
 */
export default function NotificationSettings() {
  const me = db.getCurrentUser();
  const users = useMemo(() => [...new Map(db.getUsers().map((u) => [u.id, u])).values()].filter((u) => u.active !== false).sort((a, b) => a.fullName.localeCompare(b.fullName)), []);
  const nameOf = (id: string) => users.find((u) => u.id === id)?.fullName || 'Removed user';
  const [routing, setRouting] = useState<NotificationRouting | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState<{ key: NotificationEventKey; mode: 'add' | 'mute' } | null>(null);

  useEffect(() => {
    fetch('/api/notifications/routing', { cache: 'no-store' }).then((r) => r.json()).then((data) => setRouting(data.routing || {})).catch(() => setRouting({}));
  }, []);

  if (!isSuperAdmin(me)) return null;

  const change = (key: NotificationEventKey, patch: (rules: { enabled?: boolean; addUserIds: string[]; muteUserIds: string[] }) => void) => {
    setRouting((current) => {
      const next = { ...(current || {}) };
      const rules = { addUserIds: [], muteUserIds: [], ...(next[key] || {}) } as { enabled?: boolean; addUserIds: string[]; muteUserIds: string[] };
      patch(rules);
      next[key] = { ...rules, addUserIds: [...rules.addUserIds], muteUserIds: [...rules.muteUserIds] };
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/notifications/routing', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routing }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Not saved.');
      setRouting(data.routing); setDirty(false);
      toast.success('Notification settings saved.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Not saved.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold text-slate-900">Send a message</h3>
        <p className="mb-4 mt-1 text-xs text-slate-500">It appears in their bell, pops up while they use the app, and reaches their phone if they turned notifications on. Clicking it shows just the message.</p>
        <ComposeMessage inline />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><BellRing className="h-4 w-4 text-blue-600" /> Who gets which notification</h3>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">Turn a notification off for everyone, add people who should also get it, or stop it for people who don&apos;t need it. People only get notifications for pages they can open, and never for something they did themselves.</p>
          </div>
          <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40">{saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}</button>
        </div>

        {!routing ? <p className="mt-4 text-sm text-slate-500">Loading…</p> : GROUPS.map((group) => (
          <div key={group} className="mt-5">
            <h4 className="mb-2 text-xs font-bold text-slate-600">{group}</h4>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {NOTIFICATION_EVENTS.filter((event) => event.group === group).map((event) => {
                const rules = routing[event.key] || {};
                const on = rules.enabled ?? event.enabledByDefault;
                const preview = event.audience === 'PERSON' ? null : eventRecipients(event.key, users, routing, { isSuperAdmin: (u) => isSuperAdmin(u), canOpen: (u, feature) => hasAccess(u, feature) });
                return (
                  <li key={event.key} className="p-3 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{event.label}</p>
                        <p className="mt-0.5 text-slate-600">{event.when}</p>
                        <p className="mt-0.5 text-slate-500">Goes to: {event.defaultWho}{preview ? ` — now ${preview.length} ${preview.length === 1 ? 'person' : 'people'}${preview.length ? ` (${preview.slice(0, 6).map((u) => u.fullName.split(' ')[0]).join(', ')}${preview.length > 6 ? ` and ${preview.length - 6} more` : ''})` : ''}` : ''}</p>
                      </div>
                      <label className="flex shrink-0 cursor-pointer items-center gap-2 font-semibold text-slate-700">
                        <input type="checkbox" role="switch" checked={on} onChange={(e) => change(event.key, (r) => { r.enabled = e.target.checked; })} aria-label={`${event.label}: ${on ? 'on' : 'off'}`} className="h-4 w-4" />
                        {on ? 'On' : 'Off'}
                      </label>
                    </div>
                    {on && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {(rules.addUserIds || []).map((id) => (
                          <span key={`a${id}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800">Also {nameOf(id)}<button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => change(event.key, (r) => { r.addUserIds = r.addUserIds.filter((x) => x !== id); })}><X className="h-3 w-3" /></button></span>
                        ))}
                        {(rules.muteUserIds || []).map((id) => (
                          <span key={`m${id}`} className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-rose-800">Not {nameOf(id)}<button type="button" aria-label={`Send to ${nameOf(id)} again`} onClick={() => change(event.key, (r) => { r.muteUserIds = r.muteUserIds.filter((x) => x !== id); })}><X className="h-3 w-3" /></button></span>
                        ))}
                        {adding?.key === event.key ? (
                          <select autoFocus aria-label={adding.mode === 'add' ? 'Also send to' : 'Stop sending to'} defaultValue="" onBlur={() => setAdding(null)} onChange={(e) => {
                            const id = e.target.value; const mode = adding.mode;
                            if (id) change(event.key, (r) => { if (mode === 'add') { r.addUserIds = [...new Set([...r.addUserIds, id])]; r.muteUserIds = r.muteUserIds.filter((x) => x !== id); } else { r.muteUserIds = [...new Set([...r.muteUserIds, id])]; r.addUserIds = r.addUserIds.filter((x) => x !== id); } });
                            setAdding(null);
                          }} className="rounded-lg border border-slate-300 px-2 py-1">
                            <option value="">{adding.mode === 'add' ? 'Also send to…' : 'Stop sending to…'}</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                          </select>
                        ) : (
                          <>
                            <button type="button" onClick={() => setAdding({ key: event.key, mode: 'add' })} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-50"><Plus className="h-3 w-3" /> Add someone</button>
                            <button type="button" onClick={() => setAdding({ key: event.key, mode: 'mute' })} className="rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-50">Stop for someone</button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
