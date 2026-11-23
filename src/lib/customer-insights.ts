/**
 * Customer insights worked out from the orders themselves, not from stored counters or fixed
 * guesses. A customer is a phone number; "bought" means an order that counts as a sale
 * (not cancelled, failed or returned). Nothing here fills a gap with a made-up figure:
 * where there is no data, the result says so (null).
 */
import { countsAsSale } from './order-status';
import { phoneDigits } from './customer-lookup';
import type { Customer, Order } from './types';

const DAY = 86400000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / DAY);

export interface History {
  phone: string;
  orders: Order[];     // every order, oldest first
  sales: Order[];      // orders that count as a sale, oldest first
  spend: number;       // value of the sales
  firstSale?: string;
  lastSale?: string;
  avgGap: number | null; // average days between sales, when there are two or more
  firstChannel: string;  // where they placed their first order
}

export const channelOf = (order: Order) => (order.platform || '').trim() || 'Not recorded';

/** One history per customer phone. */
export function customerHistories(orders: Order[]): Map<string, History> {
  const groups = new Map<string, Order[]>();
  for (const order of orders) {
    const phone = phoneDigits(order.customerPhone);
    if (!phone) continue;
    (groups.get(phone) || groups.set(phone, []).get(phone)!).push(order);
  }
  const out = new Map<string, History>();
  for (const [phone, list] of groups) {
    const sorted = [...list].sort((a, b) => `${a.orderDateAd}${a.orderTime || ''}`.localeCompare(`${b.orderDateAd}${b.orderTime || ''}`));
    const sales = sorted.filter(countsAsSale);
    const gaps = sales.slice(1).map((o, i) => days(sales[i].orderDateAd, o.orderDateAd));
    out.set(phone, {
      phone, orders: sorted, sales,
      spend: sales.reduce((s, o) => s + (Number(o.totalAmount) || 0), 0),
      firstSale: sales[0]?.orderDateAd, lastSale: sales[sales.length - 1]?.orderDateAd,
      avgGap: gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null,
      firstChannel: channelOf(sorted[0]),
    });
  }
  return out;
}

export interface ChannelRow {
  channel: string;
  customerCount: number;   // customers whose first order came through this channel
  orderCount: number;      // all their orders since, on any channel
  avgKarma: number | null; // from their customer records, when there are any
  repeatRate: number | null;  // % of those customers who bought again
  stayedPct: number | null;   // % of their repeat orders placed on the same channel
  ordersHere: number;      // every order placed on this channel, by anyone
}

/** Which channel brings customers in, and whether they come back (and through where). */
export function channelLoyalty(histories: Map<string, History>, customers: Customer[], orders: Order[]): ChannelRow[] {
  const karma = new Map(customers.map((c) => [phoneDigits(c.phone), c.karmaScore]));
  const rows = new Map<string, ChannelRow & { karmaSum: number; karmaN: number; repeaters: number; later: number; laterSame: number }>();
  const row = (channel: string) => rows.get(channel) || rows.set(channel, { channel, customerCount: 0, orderCount: 0, avgKarma: null, repeatRate: null, stayedPct: null, ordersHere: 0, karmaSum: 0, karmaN: 0, repeaters: 0, later: 0, laterSame: 0 }).get(channel)!;
  for (const order of orders) if (phoneDigits(order.customerPhone)) row(channelOf(order)).ordersHere += 1;
  for (const h of histories.values()) {
    const r = row(h.firstChannel);
    r.customerCount += 1;
    r.orderCount += h.orders.length;
    const k = karma.get(h.phone);
    if (typeof k === 'number') { r.karmaSum += k; r.karmaN += 1; }
    if (h.sales.length >= 2) r.repeaters += 1;
    for (const later of h.orders.slice(1)) { r.later += 1; if (channelOf(later) === h.firstChannel) r.laterSame += 1; }
  }
  return [...rows.values()]
    .map(({ karmaSum, karmaN, repeaters, later, laterSame, ...r }) => ({
      ...r,
      avgKarma: karmaN ? Math.round(karmaSum / karmaN) : null,
      repeatRate: r.customerCount ? Math.round((repeaters / r.customerCount) * 100) : null,
      stayedPct: later ? Math.round((laterSame / later) * 100) : null,
    }))
    .sort((a, b) => b.customerCount - a.customerCount || b.ordersHere - a.ordersHere);
}

/** How many customers reached their 1st, 2nd, ... 5th+ purchase. */
export function repeatSteps(histories: Map<string, History>) {
  const counts = [1, 2, 3, 4, 5].map((n) => [...histories.values()].filter((h) => h.sales.length >= n).length);
  return counts;
}

/** Real average days between purchases, per segment and overall. */
export function purchaseCycles(histories: Map<string, History>, customers: Customer[]) {
  const segmentOf = new Map(customers.map((c) => [phoneDigits(c.phone), c.segment]));
  const bySegment: Record<string, number[]> = {};
  const all: number[] = [];
  for (const h of histories.values()) {
    if (h.avgGap === null) continue;
    all.push(h.avgGap);
    const seg = segmentOf.get(h.phone) || 'NEW';
    (bySegment[seg] ||= []).push(h.avgGap);
  }
  const avg = (list?: number[]) => (list && list.length ? Math.round(list.reduce((s, v) => s + v, 0) / list.length) : null);
  return {
    VIP: avg(bySegment.VIP), LOYAL: avg(bySegment.LOYAL), REGULAR: avg(bySegment.REGULAR), AT_RISK: avg(bySegment.AT_RISK),
    overall: avg(all), samples: all.length,
  };
}

/** Days from a date to today (today in Kathmandu, as YYYY-MM-DD). */
export const daysSince = (date: string, today: string) => days(date, today);
