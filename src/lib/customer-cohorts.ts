import type { Order } from './types';
import { phoneDigits } from './customer-lookup';
import { adToBs } from './nepali-calendar';

/** Orders per customer (by normalised phone), oldest first. Cancelled orders and replacements are not purchases. */
function purchasesByCustomer(orders: Order[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const order of orders) {
    if (order.status === 'CANCELLED' || order.exchangeReturnId || order.isMarketing) continue;
    const key = phoneDigits(order.customerPhone);
    if (!key || !order.orderDateAd) continue;
    const list = map.get(key) || [];
    list.push(order.orderDateAd);
    map.set(key, list);
  }
  for (const list of map.values()) list.sort();
  return map;
}

const monthKey = (dateAd: string) => dateAd.slice(0, 7);
const addMonths = (key: string, n: number) => { const [y, m] = key.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export interface CohortRow { month: string; size: number; m1: string; m2: string; m3: string; activePct: string; color: 'green' | 'amber' | 'rose' }

/**
 * Customers grouped by the month of their first order. m1–m3: share who ordered again in the
 * 1st, 2nd and 3rd month after. "Active": ordered in the last 60 days. Months not yet over show —.
 */
export function cohortRetention(orders: Order[], todayAd: string, months = 6): CohortRow[] {
  const purchases = purchasesByCustomer(orders);
  const current = monthKey(todayAd);
  const rows: CohortRow[] = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const cohort = addMonths(current, -back);
    const members = [...purchases.values()].filter((dates) => monthKey(dates[0]) === cohort);
    if (!members.length) continue;
    const share = (offset: number) => {
      const target = addMonths(cohort, offset);
      if (target > current) return '—';
      return `${Math.round((members.filter((dates) => dates.some((date) => monthKey(date) === target)).length / members.length) * 100)}%`;
    };
    const active = Math.round((members.filter((dates) => daysBetween(dates[dates.length - 1], todayAd) <= 60).length / members.length) * 100);
    const m1 = share(1);
    const firstRepeat = m1 === '—' ? active : Number(m1.replace('%', ''));
    let label = cohort;
    try { const bs = adToBs(new Date(`${cohort}-15T12:00:00`)); label = `${new Date(`${cohort}-15T12:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${cohort.slice(0, 4)} (${bs.monthName})`; } catch { /* AD label only */ }
    rows.push({ month: cohort === current ? `${label} · this month` : label, size: members.length, m1, m2: share(2), m3: share(3), activePct: `${active}%`, color: firstRepeat >= 40 ? 'green' : firstRepeat >= 20 ? 'amber' : 'rose' });
  }
  return rows;
}

export interface LifecycleMove { from: string; to: string; count: number; type: 'PROMOTED' | 'WARNING' | 'LOST' | 'RECOVERED'; desc: string }

/** Lifecycle changes in the last 30 days, worked out from order dates. */
export function lifecycleMovements(orders: Order[], todayAd: string): LifecycleMove[] {
  const purchases = [...purchasesByCustomer(orders).values()];
  const recent = (date?: string) => !!date && daysBetween(date, todayAd) >= 0 && daysBetween(date, todayAd) <= 30;
  const last = (dates: string[]) => dates[dates.length - 1];
  const reachedOrder = (n: number) => purchases.filter((dates) => dates.length >= n && recent(dates[n - 1])).length;
  const winBack = purchases.filter((dates) => dates.length >= 2 && recent(last(dates)) && dates.slice(1).some((date, i) => recent(date) && daysBetween(dates[i], date) > 90)).length;
  return [
    { from: 'First order', to: 'Repeat', count: reachedOrder(2), type: 'PROMOTED', desc: 'Placed their second order in the last 30 days' },
    { from: 'Repeat', to: 'Loyal', count: reachedOrder(5), type: 'PROMOTED', desc: 'Placed their fifth order in the last 30 days' },
    { from: 'Repeat', to: 'At risk', count: purchases.filter((dates) => dates.length >= 2 && daysBetween(last(dates), todayAd) > 45 && daysBetween(last(dates), todayAd) <= 90).length, type: 'WARNING', desc: 'Repeat buyers with no order for 46–90 days' },
    { from: 'Any', to: 'Lapsed', count: purchases.filter((dates) => daysBetween(last(dates), todayAd) > 90).length, type: 'LOST', desc: 'No order for more than 90 days' },
    { from: 'Lapsed', to: 'Won back', count: winBack, type: 'RECOVERED', desc: 'Ordered again in the last 30 days after a gap of more than 90 days' },
  ];
}
