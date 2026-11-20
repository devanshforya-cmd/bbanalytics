/**
 * Everything that can send a notification, when it is sent, and who gets it by default.
 * Super Admins can switch each one off, add people, or stop it for particular people
 * (Settings → Alerts & notifications). Nobody is ever sent a record they cannot open.
 */
import type { FeatureKey } from './permissions';

export type NotificationEventKey =
  | 'store_order_new' | 'dispatch_step' | 'online_order_new' | 'return_new' | 'complaint_new'
  | 'cheque_new' | 'cheque_problem' | 'document_new' | 'task_assigned' | 'visit_assigned'
  | 'marketing_send_assigned' | 'content_overdue' | 'daily_alerts' | 'order_overwrite';

export type Audience =
  /** Everyone who can open the related page, plus Super Admins. */
  | 'PAGE'
  /** Super Admins only. */
  | 'SUPER_ADMINS'
  /** The person it is about (the assignee, the officer who took the order). */
  | 'PERSON';

export interface NotificationEvent {
  key: NotificationEventKey;
  label: string;
  /** When it is sent, in plain words. */
  when: string;
  group: 'Store sales' | 'Online sales' | 'Money' | 'Work' | 'Daily';
  audience: Audience;
  /** Who gets it by default, in plain words. */
  defaultWho: string;
  /** Page a recipient must be able to open; checked even for people added by hand. */
  feature?: FeatureKey;
  enabledByDefault: boolean;
}

export const NOTIFICATION_EVENTS: NotificationEvent[] = [
  { key: 'store_order_new', label: 'New store order', when: 'A store order is taken on a visit or entered in the office', group: 'Store sales', audience: 'PAGE', defaultWho: 'Everyone with Orders & dispatch, and Super Admins', feature: 'dispatches', enabledByDefault: true },
  { key: 'dispatch_step', label: 'Dispatch order moved', when: 'A dispatch order is packed, dispatched, delivered or cancelled', group: 'Store sales', audience: 'PERSON', defaultWho: 'The officer who took the store order', feature: 'beat_plans', enabledByDefault: true },
  { key: 'online_order_new', label: 'New online order', when: 'An online order is saved (extractor, manual entry or import)', group: 'Online sales', audience: 'PAGE', defaultWho: 'Everyone with the order desk, and Super Admins', feature: 'order_desk', enabledByDefault: false },
  { key: 'return_new', label: 'Return or exchange logged', when: 'A return or exchange is logged', group: 'Online sales', audience: 'PAGE', defaultWho: 'Everyone with Reviews & returns, and Super Admins', feature: 'reviews', enabledByDefault: true },
  { key: 'complaint_new', label: 'New complaint', when: 'A customer complaint is logged', group: 'Online sales', audience: 'PAGE', defaultWho: 'Everyone with Feedback & complaints, and Super Admins', feature: 'reviews', enabledByDefault: true },
  { key: 'cheque_new', label: 'Cheque collected', when: 'A cheque is collected from a store', group: 'Money', audience: 'PAGE', defaultWho: 'Everyone with the cheque tracker, and Super Admins', feature: 'cheque_tracker', enabledByDefault: true },
  { key: 'cheque_problem', label: 'Cheque bounced or delayed', when: 'A cheque is marked bounced or delayed', group: 'Money', audience: 'PAGE', defaultWho: 'Everyone with the cheque tracker, and Super Admins', feature: 'cheque_tracker', enabledByDefault: true },
  { key: 'document_new', label: 'Store document added', when: 'A bill, challan or other store document is logged', group: 'Money', audience: 'SUPER_ADMINS', defaultWho: 'Super Admins', feature: 'document_handover', enabledByDefault: true },
  { key: 'task_assigned', label: 'Task assigned', when: 'Someone gives you a task', group: 'Work', audience: 'PERSON', defaultWho: 'The person the task is for', feature: 'tasks', enabledByDefault: true },
  { key: 'visit_assigned', label: 'Store visit planned', when: 'Someone else puts a store visit on your beat', group: 'Work', audience: 'PERSON', defaultWho: 'The officer whose beat it is', feature: 'beat_plans', enabledByDefault: true },
  { key: 'marketing_send_assigned', label: 'Marketing send assigned', when: 'You are made responsible for an influencer send', group: 'Work', audience: 'PERSON', defaultWho: 'The responsible person', feature: 'marketing', enabledByDefault: true },
  { key: 'content_overdue', label: 'Influencer content overdue', when: 'Every morning, for sends past their expected content date', group: 'Daily', audience: 'PERSON', defaultWho: 'The responsible person (Super Admins if none)', feature: 'marketing', enabledByDefault: true },
  { key: 'daily_alerts', label: 'Daily operations alerts', when: 'Every morning at about 8:00: bounced cheques, urgent complaints, stores not visited and other thresholds', group: 'Daily', audience: 'SUPER_ADMINS', defaultWho: 'Super Admins', enabledByDefault: true },
  { key: 'order_overwrite', label: 'Your order edit was overwritten', when: 'Someone saves an online order after you edited it', group: 'Work', audience: 'PERSON', defaultWho: 'The person whose edit was replaced', feature: 'order_desk', enabledByDefault: true },
];

export const eventByKey = (key: string) => NOTIFICATION_EVENTS.find((event) => event.key === key);

/** Super Admin choices for one event. Missing means the defaults above. */
export interface EventRouting { enabled?: boolean; addUserIds?: string[]; muteUserIds?: string[] }
export type NotificationRouting = Partial<Record<NotificationEventKey, EventRouting>>;

export function cleanRouting(input: unknown): NotificationRouting {
  const out: NotificationRouting = {};
  if (!input || typeof input !== 'object') return out;
  for (const event of NOTIFICATION_EVENTS) {
    const raw = (input as Record<string, any>)[event.key];
    if (!raw || typeof raw !== 'object') continue;
    const ids = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && /^[\w:.@-]{1,120}$/.test(id)))].slice(0, 500) : [];
    out[event.key] = { ...(typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : {}), addUserIds: ids(raw.addUserIds), muteUserIds: ids(raw.muteUserIds) };
  }
  return out;
}

export interface RecipientUser { id: string; active?: boolean; is_active?: boolean }

/**
 * Who gets an event: the default audience, plus people added, minus people stopped and the
 * person who did it. `canOpen` checks each person can open the related page.
 */
export function eventRecipients<U extends RecipientUser>(key: NotificationEventKey, users: U[], routing: NotificationRouting, options: {
  actorId?: string; personIds?: string[]; isSuperAdmin: (user: U) => boolean; canOpen: (user: U, feature: FeatureKey) => boolean;
}): U[] {
  const event = eventByKey(key)!;
  const rules = routing[key] || {};
  if (!(rules.enabled ?? event.enabledByDefault)) return [];
  const active = users.filter((user) => user.active !== false && user.is_active !== false);
  const chosen = new Set<string>();
  if (event.audience === 'PERSON') for (const id of options.personIds || []) chosen.add(id);
  if (event.audience === 'SUPER_ADMINS' || event.audience === 'PAGE') for (const user of active) if (options.isSuperAdmin(user)) chosen.add(user.id);
  if (event.audience === 'PAGE' && event.feature) for (const user of active) if (options.canOpen(user, event.feature)) chosen.add(user.id);
  for (const id of rules.addUserIds || []) chosen.add(id);
  for (const id of rules.muteUserIds || []) chosen.delete(id);
  if (options.actorId) chosen.delete(options.actorId);
  return active.filter((user) => chosen.has(user.id) && (!event.feature || options.isSuperAdmin(user) || options.canOpen(user, event.feature)));
}
