/**
 * Where clicking a notification goes. Messages open in place; everything else opens the
 * record it is about. Older notifications without a link fall back to their page.
 */
import type { Notification } from './types';

export const isMessage = (n: Pick<Notification, 'kind'>) => n.kind === 'MESSAGE';

export function notificationTarget(n: Notification): string {
  if (n.link && n.link.startsWith('/') && !n.link.startsWith('//')) return n.link;
  const byType: Record<string, string> = {
    tasks: '/opscore/tasks', beatItems: '/offline-sales/beat-plan', cheques: '/offline-sales/cheques', documents: '/offline-sales/documents',
    secondaryOrders: '/offline-sales/dispatch', returns: '/reviews/returns', feedbackEntries: '/reviews/feedback', marketingSends: '/marketing/sends', systemAlerts: '/dashboard',
  };
  if (n.entityType === 'orders' && n.entityId) return `/orderflow/orders/${encodeURIComponent(n.entityId)}`;
  if (n.entityType && byType[n.entityType]) return byType[n.entityType];
  const text = `${n.title} ${n.message}`.toLowerCase();
  if (text.includes('cheque')) return '/offline-sales/cheques';
  if (text.includes('delivery') || text.includes('failed')) return '/orderflow/delivery-failures';
  if (text.includes('task')) return '/opscore/tasks';
  return '/dashboard';
}
