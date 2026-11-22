/**
 * Follow-up calls to online customers after they order.
 *
 * Nothing is stored per follow-up: the due list is worked out from the orders, the calls already
 * logged and the plan in Settings. Changing the plan (days, number of calls, tries) therefore
 * applies straight away to every order still in its follow-up window.
 */
import type { CustomerCall, CustomerCallOutcome, FollowUpPlan, FollowUpStep, Order } from './types';

// Until someone saves the plan, orders from the week before launch are followed up too.
export const FOLLOW_UP_DEFAULT_START = '2026-11-15';

export const DEFAULT_FOLLOW_UP_PLAN: FollowUpPlan = {
  enabled: true,
  maxTries: 3,
  startFromAd: FOLLOW_UP_DEFAULT_START,
  brandCodes: [],
  steps: [
    { id: 'fu_check', label: 'Delivery check', daysAfter: 3, from: 'ORDER', script: 'Did the order arrive? Was everything right?' },
    { id: 'fu_feedback', label: 'Product feedback', daysAfter: 10, from: 'ORDER', script: 'How are they finding the product? Any problem?' },
    { id: 'fu_reorder', label: 'Reorder reminder', daysAfter: 25, from: 'ORDER', script: 'Running low? Offer to place the next order.' },
  ],
};

export interface OutcomeInfo {
  key: CustomerCallOutcome;
  label: string;
  /** Spoke to the customer. */
  reached: boolean;
  /** STEP: this call is done. ORDER: no more calls for this order. CUSTOMER: never call this number again for follow-ups. */
  closes: 'STEP' | 'ORDER' | 'CUSTOMER' | null;
  /** Counts as one unanswered try. */
  isTry: boolean;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}

export const CALL_OUTCOMES: OutcomeInfo[] = [
  { key: 'HAPPY', label: 'Spoke: happy', reached: true, closes: 'STEP', isTry: false, tone: 'good' },
  { key: 'REORDER', label: 'Spoke: ordered again', reached: true, closes: 'STEP', isTry: false, tone: 'good' },
  { key: 'ISSUE', label: 'Spoke: has a problem', reached: true, closes: 'STEP', isTry: false, tone: 'warn' },
  { key: 'SPOKE', label: 'Spoke: other', reached: true, closes: 'STEP', isTry: false, tone: 'neutral' },
  { key: 'CALL_BACK', label: 'Asked to call back', reached: true, closes: null, isTry: false, tone: 'neutral' },
  { key: 'NO_ANSWER', label: 'No answer', reached: false, closes: null, isTry: true, tone: 'neutral' },
  { key: 'SWITCHED_OFF', label: 'Switched off / unreachable', reached: false, closes: null, isTry: true, tone: 'neutral' },
  { key: 'WRONG_NUMBER', label: 'Wrong number', reached: false, closes: 'ORDER', isTry: false, tone: 'bad' },
  { key: 'DO_NOT_CALL', label: 'Doesn’t want calls', reached: true, closes: 'CUSTOMER', isTry: false, tone: 'bad' },
];

export const CALL_PURPOSES = ['Follow-up', 'Order confirmation', 'Delivery update', 'Complaint', 'Return or exchange', 'Reorder', 'Other'] as const;

export function outcomeInfo(key: string | undefined): OutcomeInfo | undefined {
  return CALL_OUTCOMES.find((entry) => entry.key === key);
}

export function addDays(dateAd: string, days: number): string {
  const date = new Date(`${dateAd.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(fromAd: string, toAd: string): number {
  return Math.round((Date.parse(`${toAd.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromAd.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

export const phoneKey = (phone?: string) => (phone || '').replace(/\D/g, '').slice(-10);

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Check a plan from the browser or the server. Throws a message a person can act on. */
export function validateFollowUpPlan(input: unknown): FollowUpPlan {
  if (!input || typeof input !== 'object') throw new Error('Follow-up settings are missing.');
  const raw = input as Record<string, unknown>;
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  if (steps.length > 12) throw new Error('Use at most 12 follow-up calls.');
  const seen = new Set<string>();
  const clean: FollowUpStep[] = steps.map((value, index) => {
    const step = (value || {}) as Record<string, unknown>;
    const id = typeof step.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(step.id) ? step.id : '';
    if (!id || seen.has(id)) throw new Error(`Follow-up call ${index + 1} has no valid id.`);
    seen.add(id);
    const label = String(step.label || '').trim().replace(/\s+/g, ' ');
    if (!label || label.length > 60) throw new Error(`Give follow-up call ${index + 1} a name of up to 60 characters.`);
    const daysAfter = Number(step.daysAfter);
    if (!Number.isInteger(daysAfter) || daysAfter < 0 || daysAfter > 365) throw new Error(`“${label}”: days must be a whole number from 0 to 365.`);
    const from = step.from === 'DELIVERY' ? 'DELIVERY' : 'ORDER';
    const script = String(step.script || '').trim().slice(0, 300);
    return { id, label, daysAfter, from, ...(script ? { script } : {}) };
  });
  const maxTries = Number(raw.maxTries);
  if (!Number.isInteger(maxTries) || maxTries < 1 || maxTries > 10) throw new Error('Tries before giving up must be from 1 to 10.');
  const startFromAd = String(raw.startFromAd || '');
  if (!ISO_DAY.test(startFromAd)) throw new Error('Choose the date follow-ups start from.');
  const brandCodes = Array.isArray(raw.brandCodes) ? [...new Set(raw.brandCodes.filter((code): code is string => typeof code === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(code)).map((code) => code.toUpperCase()))] : [];
  return { enabled: raw.enabled !== false, steps: clean, maxTries, startFromAd, brandCodes };
}

export type FollowUpStatus = 'DUE' | 'UPCOMING' | 'QUEUED' | 'WAITING_DELIVERY' | 'DONE' | 'NOT_REACHED' | 'STOPPED';

export interface FollowUpItem {
  key: string;
  order: Order;
  step: FollowUpStep;
  stepNumber: number;
  stepCount: number;
  /** The day the plan puts this call on; null while it waits for delivery. */
  plannedAd: string | null;
  /** When to call next (after a call-back request or an unanswered try). */
  dueAd: string | null;
  status: FollowUpStatus;
  tries: number;
  calls: CustomerCall[];
  lastCall?: CustomerCall;
  /** Days past due (0 when due today); negative when not yet due. */
  overdueDays: number;
}

/** Orders that never get follow-ups: cancelled, returned, gifts to influencers, exchange stand-ins. */
export function orderNeedsFollowUp(order: Order, plan: FollowUpPlan): boolean {
  if (!plan.enabled || !plan.steps.length) return false;
  if (['CANCELLED', 'RETURNED', 'EXCHANGED', 'FAILED'].includes(order.status)) return false;
  if (order.isMarketing || order.exchangeReturnId || order.exchangeRequested) return false;
  if (!order.customerPhone || (order.orderDateAd || '').slice(0, 10) < plan.startFromAd) return false;
  if (plan.brandCodes.length && !plan.brandCodes.includes(String(order.brandCode).toUpperCase())) return false;
  return true;
}

const byTime = (a: CustomerCall, b: CustomerCall) => (a.createdAt || a.dateAd).localeCompare(b.createdAt || b.dateAd);

/** Every follow-up for every order in the plan, with where each one stands today. */
export function buildFollowUps(orders: Order[], calls: CustomerCall[], plan: FollowUpPlan, todayAd: string): FollowUpItem[] {
  const steps = [...plan.steps].sort((a, b) => (a.from === b.from ? 0 : a.from === 'ORDER' ? -1 : 1) || a.daysAfter - b.daysAfter);
  const callsByOrder = new Map<string, CustomerCall[]>();
  const doNotCall = new Map<string, string>();
  for (const call of [...calls].sort(byTime)) {
    if (call.orderId) callsByOrder.set(call.orderId, [...(callsByOrder.get(call.orderId) || []), call]);
    if (call.outcome === 'DO_NOT_CALL' && !doNotCall.has(phoneKey(call.customerPhone))) doNotCall.set(phoneKey(call.customerPhone), call.dateAd);
  }
  const items: FollowUpItem[] = [];
  for (const order of orders) {
    if (!orderNeedsFollowUp(order, plan)) continue;
    const orderCalls = callsByOrder.get(order.id) || [];
    const stopOrder = orderCalls.find((call) => outcomeInfo(call.outcome)?.closes === 'ORDER');
    const stopCustomer = doNotCall.get(phoneKey(order.customerPhone));
    let openSeen = false;
    steps.forEach((step, index) => {
      const base = step.from === 'DELIVERY' ? order.deliveredDateAd : order.orderDateAd;
      const plannedAd = base ? addDays(base, step.daysAfter) : null;
      const stepCalls = orderCalls.filter((call) => call.followUpStepId === step.id);
      const last = stepCalls[stepCalls.length - 1];
      const tries = stepCalls.filter((call) => outcomeInfo(call.outcome)?.isTry).length;
      let status: FollowUpStatus;
      let dueAd = plannedAd;
      if (stepCalls.some((call) => outcomeInfo(call.outcome)?.closes === 'STEP')) status = 'DONE';
      else if (stopOrder || stopCustomer) status = 'STOPPED';
      else if (tries >= plan.maxTries) status = 'NOT_REACHED';
      else if (!plannedAd) status = 'WAITING_DELIVERY';
      else {
        if (last?.outcome === 'CALL_BACK' && last.callbackDateAd) dueAd = last.callbackDateAd;
        else if (last && outcomeInfo(last.outcome)?.isTry) dueAd = [plannedAd, addDays(last.dateAd, 1)].sort().pop()!;
        // One call per customer at a time: a later call waits until the earlier one is done.
        status = openSeen ? 'QUEUED' : dueAd! <= todayAd ? 'DUE' : 'UPCOMING';
        openSeen = true;
      }
      if (status === 'WAITING_DELIVERY') openSeen = true;
      items.push({
        key: `${order.id}:${step.id}`, order, step, stepNumber: index + 1, stepCount: steps.length, plannedAd, dueAd,
        status, tries, calls: stepCalls, lastCall: last, overdueDays: dueAd ? daysBetween(dueAd, todayAd) : 0,
      });
    });
  }
  return items;
}

/** A short line for how a call went, for lists. */
export function callSummary(call: CustomerCall): string {
  const info = outcomeInfo(call.outcome);
  return `${info?.label || call.outcome}${call.outcome === 'CALL_BACK' && call.callbackDateAd ? ` on ${call.callbackDateAd}` : ''}`;
}
