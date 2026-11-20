/**
 * Sending notifications from the server: in the app (the bell) and to registered phones.
 * Every automatic notification goes through `notifyEvent`, so the Super Admin's choices in
 * Settings → Alerts & notifications decide who gets it.
 */
import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { supabaseAdmin } from './db/supabase-server';
import { deliverPushNotification } from './push-server';
import { hasAccess, isSuperAdmin } from './permissions';
import { cleanRouting, eventRecipients, type NotificationEventKey, type NotificationRouting } from './notification-events';
import type { Notification, Priority, User } from './types';

const ROUTING_KEY = 'notification_routing_v1';
let cache: { at: number; routing: NotificationRouting } | null = null;

export async function readRouting(fresh = false): Promise<NotificationRouting> {
  if (!fresh && cache && Date.now() - cache.at < 30000) return cache.routing;
  const { data, error } = await supabaseAdmin.from('system_settings').select('value').eq('key', ROUTING_KEY).maybeSingle();
  const routing = error ? (cache?.routing || {}) : cleanRouting(data?.value);
  cache = { at: Date.now(), routing };
  return routing;
}

export async function saveRouting(routing: NotificationRouting) {
  const clean = cleanRouting(routing);
  const { error } = await supabaseAdmin.from('system_settings').upsert({ key: ROUTING_KEY, value: clean, updated_at: new Date().toISOString() });
  if (error) throw new Error('Notification settings could not be saved.');
  cache = { at: Date.now(), routing: clean };
  return clean;
}

/** Save notifications for these people and send them to their phones. */
export async function deliverNotifications(actorId: string, recipients: User[], dedupeKey: string, payload: Omit<Notification, 'id' | 'userId' | 'read' | 'createdAt'>) {
  if (!recipients.length) return 0;
  const createdAt = new Date().toISOString();
  const rows = recipients.map((recipient) => {
    const id = `notification_${createHash('sha256').update(`${dedupeKey}:${recipient.id}`).digest('hex')}`;
    const data: Notification = { ...payload, id, userId: recipient.id, read: false, createdAt };
    return { recipient, row: { collection: 'notifications', id, data, created_by: actorId, version: 1, last_mutation_id: `${dedupeKey}`.slice(0, 170) } };
  });
  const { error } = await supabaseAdmin.from('workspace_records').upsert(rows.map((r) => r.row), { onConflict: 'collection,id', ignoreDuplicates: true });
  if (error) { console.error('[Notify] Notifications could not be saved:', error.code); return 0; }
  const push = async () => { for (const { recipient, row } of rows) await deliverPushNotification(recipient, row.data); };
  try { after(push); } catch { /* Outside a request (scheduled job, tests): saved in the app; push goes out on the next flush. */ }
  return rows.length;
}

/** An automatic notification, routed by the Super Admin's settings. */
export async function notifyEvent(actor: Pick<User, 'id' | 'fullName'>, key: NotificationEventKey, users: User[], payload: {
  dedupeKey: string; title: string; message: string; link?: string; entityType?: string; entityId?: string; priority?: Priority; personIds?: string[];
}) {
  const routing = await readRouting();
  const recipients = eventRecipients(key, users, routing, {
    actorId: actor.id, personIds: payload.personIds, isSuperAdmin: (user) => isSuperAdmin(user), canOpen: (user, feature) => hasAccess(user, feature),
  });
  return deliverNotifications(actor.id, recipients, `${key}:${payload.dedupeKey}`, {
    title: payload.title, message: payload.message, priority: payload.priority || 'MEDIUM', kind: 'EVENT', event: key,
    link: payload.link, entityType: payload.entityType, entityId: payload.entityId, senderId: actor.id, senderName: actor.fullName,
  });
}
