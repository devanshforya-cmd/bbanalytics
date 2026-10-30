import webpush from 'web-push';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { hasAccess, isSuperAdmin, type FeatureKey } from '@/lib/permissions';
import type { Notification, User } from '@/lib/types';
import { safeNotificationPath, validatePushSubscription } from './push-validation';

export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export function pushSubscriptionId(endpoint: string) { return createHash('sha256').update(endpoint).digest('hex'); }

function allowedNotification(user: User, notification: Pick<Notification, 'entityType'>) {
  if (notification.entityType === 'pushTest') return true;
  if (isSuperAdmin(user)) return true;
  const feature: Record<string, FeatureKey> = { tasks: 'tasks', cheques: 'cheque_tracker', documents: 'document_handover', secondaryOrders: 'beat_plans', feedbackEntries: 'reviews', returns: 'reviews', beatItems: 'beat_plans' };
  return !!notification.entityType && !!feature[notification.entityType] && hasAccess(user, feature[notification.entityType]);
}

export async function deliverPushNotification(user: User, notification: Notification) {
  const config = pushConfig();
  if (!config || notification.userId !== user.id || user.active === false || user.is_active === false || !allowedNotification(user, notification)) return { sent: 0, failed: 0 };
  const { data: subscriptions, error } = await supabaseAdmin.from('push_subscriptions').select('id,subscription,created_at').eq('user_id', user.id);
  if (error) { console.error('[Push] Subscription lookup failed:', error.code); return { sent: 0, failed: 1 }; }
  let sent = 0, failed = 0;
  for (const row of subscriptions || []) {
    // New devices receive future alerts, not an old lock-screen backlog.
    if (Date.parse(row.created_at) > Date.parse(notification.createdAt)) continue;
    const claim = { notification_id: notification.id, subscription_id: row.id, state: 'sending', updated_at: new Date().toISOString() };
    const { error: insertError } = await supabaseAdmin.from('push_deliveries').insert(claim);
    if (insertError?.code === '23505') {
      const { data: retry } = await supabaseAdmin.from('push_deliveries').update({ state: 'sending', updated_at: claim.updated_at }).eq('notification_id', notification.id).eq('subscription_id', row.id).eq('state', 'failed').lt('updated_at', new Date(Date.now() - 60000).toISOString()).select('notification_id');
      if (!retry?.length) continue;
    } else if (insertError) { failed++; continue; }
    try {
      const subscription = validatePushSubscription(row.subscription);
      await webpush.sendNotification(subscription, JSON.stringify({ title: 'BB Analytics', body: 'You have a new work alert. Open the app to review it.', tag: notification.id, url: safeNotificationPath('/') }), { vapidDetails: config, TTL: 3600, urgency: notification.priority === 'URGENT' || notification.priority === 'HIGH' ? 'high' : 'normal', timeout: 5000 });
      await supabaseAdmin.from('push_deliveries').update({ state: 'sent', updated_at: new Date().toISOString() }).eq('notification_id', notification.id).eq('subscription_id', row.id);
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await supabaseAdmin.from('push_subscriptions').delete().eq('id', row.id);
      else await supabaseAdmin.from('push_deliveries').update({ state: 'failed', updated_at: new Date().toISOString() }).eq('notification_id', notification.id).eq('subscription_id', row.id);
      failed++;
      console.warn('[Push] Delivery failed:', code || 'transport');
    }
  }
  return { sent, failed };
}

export async function flushUserPush(user: User) {
  // Recover an interrupted send. A provider-accepted message can be retried after a crash;
  // the notification tag collapses that duplicate on the device.
  await supabaseAdmin.from('push_deliveries').update({ state: 'failed' }).eq('state', 'sending').lt('updated_at', new Date(Date.now() - 120000).toISOString());
  const { data, error } = await supabaseAdmin.from('workspace_records').select('data').eq('collection', 'notifications').eq('data->>userId', user.id).gte('updated_at', new Date(Date.now() - 86400000).toISOString()).order('updated_at', { ascending: false }).limit(20);
  if (error) return { sent: 0, failed: 1 };
  const result = { sent: 0, failed: 0 };
  for (const row of data || []) {
    if (row.data.read) continue;
    const delivery = await deliverPushNotification(user, row.data as Notification);
    result.sent += delivery.sent; result.failed += delivery.failed;
  }
  return result;
}
