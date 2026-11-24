import type { BeatItem, Cheque, Dispatch, HandoverDocument, Priority, RecurringScheduleEntry, Task, Weekday } from './types';

/**
 * The weekly beat: each rider's standing stops by weekday, kept until a manager changes them,
 * plus the day's other jobs (cash to clear, documents to deposit, orders to deliver, tasks),
 * all sorted by the priority they were given.
 */
export const WEEKDAYS: Weekday[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const WEEKDAY_LABEL: Record<Weekday, string> = { SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };
export const WEEKDAY_SHORT: Record<Weekday, string> = { SUN: 'Sun', MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat' };

export type StopPriority = 'HIGH' | 'MEDIUM' | 'ROUTINE';
export const PRIORITY_RANK: Record<StopPriority, number> = { HIGH: 0, MEDIUM: 1, ROUTINE: 2 };
export const PRIORITY_LABEL: Record<StopPriority, string> = { HIGH: 'High', MEDIUM: 'Medium', ROUTINE: 'Routine' };

/** Day of week of an AD date (YYYY-MM-DD), the same everywhere. */
export function weekdayOf(dateAd: string): Weekday {
  const [y, m, d] = dateAd.slice(0, 10).split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function addDaysAd(dateAd: string, days: number): string {
  const [y, m, d] = dateAd.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Standing stops that apply on a date: active, the weekday matches, and inside the optional start/end. */
export function schedulesOn(schedules: RecurringScheduleEntry[], dateAd: string, officerId?: string): RecurringScheduleEntry[] {
  const day = weekdayOf(dateAd);
  return schedules.filter((entry) => entry.active !== false && (!officerId || entry.officerId === officerId)
    && (entry.daysOfWeek || []).includes(day)
    && (!entry.startDateAd || entry.startDateAd <= dateAd) && (!entry.endDateAd || entry.endDateAd >= dateAd))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.storeName.localeCompare(b.storeName));
}

/** One id per standing stop per day, so generating twice (or on two phones) never adds a second stop. */
export function weeklyBeatId(scheduleId: string, dateAd: string): string {
  return `beat_wk_${scheduleId}_${dateAd}`;
}

export interface StoreForBeat {
  id: string; name: string; type: 'BRANCH' | 'RETAILER' | 'DISTRIBUTOR'; subType?: string; address?: string;
  coordinates?: { lat: number; lng: number }; primaryContactName?: string; primaryContactPhone?: string; contacts?: BeatItem['contacts'];
}

/** The beat stop for a standing stop on a date. A store with no pinned location still gets its stop; check-in just skips the distance check. */
export function beatItemFromSchedule(entry: RecurringScheduleEntry, store: StoreForBeat | undefined, dateAd: string, dateBs: string, sequence: number): BeatItem {
  return {
    id: weeklyBeatId(entry.id, dateAd), officerId: entry.officerId, dateAd, dateBs, sequence,
    entityType: store?.type === 'BRANCH' ? 'BRANCH' : entry.entityType === 'BRANCH' ? 'BRANCH' : 'RETAILER',
    entityId: store?.id || entry.storeId, storeName: store?.name || entry.storeName, storeType: store?.subType || 'Store',
    address: store?.address || '', ...(store?.coordinates ? { lat: store.coordinates.lat, lng: store.coordinates.lng } : {}),
    contactName: store?.primaryContactName || '', contactPhone: store?.primaryContactPhone || '', contacts: store?.contacts || [],
    lastVisitDaysAgo: 0, pendingTasks: [], status: 'PENDING', priority: entry.priority,
    ...(entry.managerNote ? { managerNotes: entry.managerNote } : {}), scheduleId: entry.id,
  };
}

/** Stops for the day in working order: priority first, then the order they were planned in. */
export function sortDay<T extends Pick<BeatItem, 'priority' | 'sequence'>>(items: T[]): T[] {
  return [...items].sort((a, b) => PRIORITY_RANK[a.priority || 'ROUTINE'] - PRIORITY_RANK[b.priority || 'ROUTINE'] || (a.sequence || 0) - (b.sequence || 0));
}

// ---------- The day's jobs ----------

export type JobKind = 'COLLECT_PAYMENT' | 'DELIVER_ORDER' | 'CASH_CLEARING' | 'DOCUMENT_DEPOSIT' | 'TASK';
export const JOB_LABEL: Record<JobKind, string> = {
  COLLECT_PAYMENT: 'Collect payment', DELIVER_ORDER: 'Deliver order', CASH_CLEARING: 'Clear cash / cheque', DOCUMENT_DEPOSIT: 'Deposit document', TASK: 'Task',
};
/** Kinds a manager can assign as a task. */
export const TASK_KINDS: NonNullable<Task['kind']>[] = ['CASH_CLEARING', 'DOCUMENT_DEPOSIT', 'ORDER_DISPATCH', 'COLLECT_PAYMENT', 'VISIT', 'OTHER'];
export const TASK_KIND_LABEL: Record<NonNullable<Task['kind']>, string> = {
  CASH_CLEARING: 'Cash clearing', DOCUMENT_DEPOSIT: 'Document deposit', ORDER_DISPATCH: 'Order dispatch', COLLECT_PAYMENT: 'Payment collection', VISIT: 'Store visit', OTHER: 'Other',
};

export interface DayJob {
  id: string; kind: JobKind; label: string; detail?: string; priority: StopPriority;
  storeId?: string; storeName?: string; href?: string; amount?: number; taskId?: string; done?: boolean;
}

export function taskPriority(priority: Priority): StopPriority {
  return priority === 'URGENT' || priority === 'HIGH' ? 'HIGH' : priority === 'MEDIUM' ? 'MEDIUM' : 'ROUTINE';
}

const open = (status: Task['status']) => status !== 'COMPLETED';

export interface DayPlanInput {
  officerId: string; officerName?: string; dateAd: string; beats: BeatItem[]; tasks: Task[]; cheques: Cheque[]; documents: HandoverDocument[]; dispatches: Dispatch[];
  /** Stores this rider looks after, for deliveries and collections that are not on today's route. */
  ownStoreIds?: Set<string>;
}

export interface DayPlan {
  stops: { beat: BeatItem; jobs: DayJob[] }[];
  /** Jobs that are not at one of today's stops: the bank, the office, other stores. */
  errands: DayJob[];
}

/**
 * Everything a rider has to do on a day. Jobs at a store on today's route are attached to that stop;
 * the rest are errands. Overdue work stays on the list until it is done.
 */
export function dayPlan(input: DayPlanInput): DayPlan {
  const { officerId, dateAd } = input;
  const beats = sortDay(input.beats.filter((beat) => beat.officerId === officerId && beat.dateAd === dateAd));
  const onRoute = new Set(beats.map((beat) => beat.entityId));
  const jobs: DayJob[] = [];

  for (const task of input.tasks) {
    if (task.assignedTo !== officerId || !open(task.status) || !task.dueDateAd || task.dueDateAd > dateAd) continue;
    const overdue = task.dueDateAd < dateAd;
    jobs.push({ id: `task:${task.id}`, kind: 'TASK', label: task.kind ? `${TASK_KIND_LABEL[task.kind]}: ${task.title}` : task.title,
      detail: [task.description, overdue ? `due ${task.dueDateAd}` : ''].filter(Boolean).join(' · ') || undefined,
      priority: overdue && taskPriority(task.priority) !== 'HIGH' ? 'HIGH' : taskPriority(task.priority), storeId: task.storeId || (task.relatedEntityType === 'STORE' ? task.relatedId : undefined),
      storeName: task.storeName || (task.relatedEntityType === 'STORE' ? task.relatedTo : undefined), taskId: task.id });
  }
  // Cheques the rider is holding go to the office or bank.
  for (const cheque of input.cheques) {
    if (cheque.officerId !== officerId || cheque.status !== 'COLLECTED_IN_FIELD') continue;
    jobs.push({ id: `cheque:${cheque.id}`, kind: 'CASH_CLEARING', label: `Hand over cheque ${cheque.chequeNumber}`, detail: `${cheque.storeName} · ${cheque.bankName}`, amount: cheque.amount,
      priority: cheque.cashDateAd && cheque.cashDateAd <= dateAd ? 'HIGH' : 'MEDIUM', href: '/offline-sales/cheques' });
  }
  for (const doc of input.documents) {
    if (doc.officerId !== officerId || doc.status !== 'COLLECTED') continue;
    jobs.push({ id: `doc:${doc.id}`, kind: 'DOCUMENT_DEPOSIT', label: `Deposit ${doc.documentType}${doc.referenceNumber ? ` ${doc.referenceNumber}` : ''}`, detail: doc.storeName, priority: 'MEDIUM', href: '/offline-sales/documents' });
  }
  for (const dispatch of input.dispatches) {
    const storeId = dispatch.storeId || dispatch.branchId;
    if (!storeId || !(onRoute.has(storeId) || input.ownStoreIds?.has(storeId))) continue;
    if (dispatch.status === 'DISPATCHED' && dispatch.fulfilledBy !== 'DISTRIBUTOR') {
      jobs.push({ id: `dispatch:${dispatch.id}`, kind: 'DELIVER_ORDER', label: `Deliver ${dispatch.dispatchNumber || dispatch.orderNumber || 'dispatch'}`, detail: `${dispatch.items.length} product${dispatch.items.length === 1 ? '' : 's'}`,
        priority: 'HIGH', storeId, storeName: dispatch.storeName || dispatch.branchName || dispatch.distributorName, href: '/offline-sales/dispatch', amount: dispatch.totalAmount });
    }
    const due = dispatch.paymentDueDateAd;
    if (dispatch.status === 'DELIVERED' && (dispatch.paymentStatus === 'PENDING' || dispatch.paymentStatus === 'PARTIAL' || dispatch.paymentStatus === 'OVERDUE') && due && due <= dateAd) {
      jobs.push({ id: `pay:${dispatch.id}`, kind: 'COLLECT_PAYMENT', label: `Collect payment for ${dispatch.dispatchNumber || dispatch.orderNumber || 'dispatch'}`, detail: due < dateAd ? `overdue since ${due}` : 'due today',
        priority: due < dateAd ? 'HIGH' : 'MEDIUM', storeId, storeName: dispatch.storeName || dispatch.branchName || dispatch.distributorName, href: '/offline-sales/dispatch', amount: dispatch.amountDue ?? dispatch.totalAmount });
    }
  }

  const byPriority = (a: DayJob, b: DayJob) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.label.localeCompare(b.label);
  const stops = beats.map((beat) => ({ beat, jobs: jobs.filter((job) => job.storeId === beat.entityId).sort(byPriority) }));
  const errands = jobs.filter((job) => !job.storeId || !onRoute.has(job.storeId)).sort(byPriority);
  return { stops, errands };
}

/** Change which days a rider visits a store. Returns the schedules to save and the ids to delete. */
export function setStoreDays(schedules: RecurringScheduleEntry[], input: { officerId: string; storeId: string; storeName: string; entityType: 'BRANCH' | 'RETAILER'; day: Weekday; on: boolean; priority?: StopPriority; managerNote?: string; newId: () => string }):
  { save?: RecurringScheduleEntry; remove?: string } {
  const existing = schedules.find((entry) => entry.officerId === input.officerId && entry.storeId === input.storeId);
  if (!existing) {
    if (!input.on) return {};
    return { save: { id: input.newId(), officerId: input.officerId, storeId: input.storeId, storeName: input.storeName, entityType: input.entityType, daysOfWeek: [input.day], priority: input.priority || 'ROUTINE', ...(input.managerNote ? { managerNote: input.managerNote } : {}), active: true } };
  }
  const days = new Set(existing.daysOfWeek || []);
  if (input.on) days.add(input.day); else days.delete(input.day);
  if (!days.size) return { remove: existing.id };
  return { save: { ...existing, daysOfWeek: WEEKDAYS.filter((day) => days.has(day)), ...(input.on && input.priority ? { priority: input.priority } : {}), ...(input.on && input.managerNote !== undefined ? { managerNote: input.managerNote || undefined } : {}) } };
}
