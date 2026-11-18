import type { Order, OrderItem } from './types';

const digits = (phone: string) => String(phone || '').replace(/\D/g, '').replace(/^977(?=9)/, '');
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** What kind of message the team wrote. Only the first line decides it. */
export type ExtractedEntryKind = 'ORDER' | 'ADD_ON' | 'EXCHANGE';

const ADD_ON_MARKER = /^\s*(?:order\s*add(?:ed)?|add(?:ed)?\s*(?:to\s*)?order|add[\s-]?on)\b\s*[:\-–—]?\s*/i;
const EXCHANGE_MARKER = /^\s*exchange\b\s*[:\-–—]?\s*/i;

/**
 * Read the marker on the first line ("order added:" or "exchange:") and return the message without it.
 * Text after the marker on the same line (for example "exchange: Prashna") is kept.
 */
export function readEntryMarker(body: string): { kind: ExtractedEntryKind; body: string } {
  const lines = body.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim());
  if (first < 0) return { kind: 'ORDER', body };
  for (const [kind, marker] of [['ADD_ON', ADD_ON_MARKER], ['EXCHANGE', EXCHANGE_MARKER]] as const) {
    const match = marker.exec(lines[first]);
    if (!match) continue;
    const rest = lines[first].slice(match[0].length).trim();
    // "Exchange Road" or "Order added by Sita" are not markers: a marker is followed by a colon or nothing.
    if (rest && !/[:\-–—]\s*$/.test(match[0])) continue;
    const next = [...lines]; if (rest) next[first] = rest; else next.splice(first, 1);
    return { kind, body: next.join('\n').trim() };
  }
  return { kind: 'ORDER', body };
}

export interface AddOnTarget { order?: Order; problem?: string; others?: number }

/**
 * The order an "order added" message belongs to: same customer phone, same order date, same brand,
 * not yet dispatched. When there are several, the latest one is used.
 */
export function findAddOnTarget(orders: Order[], input: { phone: string; dateAd: string; brandCode: string }): AddOnTarget {
  const phone = digits(input.phone);
  if (!/^9[678]\d{8}$/.test(phone)) return { problem: 'Enter the customer phone so the order to add to can be found.' };
  const sameDay = orders.filter((order) => !order.isMarketing && !order.exchangeRequested && !order.exchangeReturnId
    && digits(order.customerPhone) === phone && order.orderDateAd === input.dateAd);
  if (!sameDay.length) return { problem: `No order for ${phone} on ${input.dateAd} to add to. Check the phone and date, or remove “order added” to save it as a new order.` };
  const sameBrand = sameDay.filter((order) => !input.brandCode || input.brandCode === 'ALL' || order.brandCode === input.brandCode);
  if (!sameBrand.length) return { problem: `The order for ${phone} on ${input.dateAd} is for another brand. Save this as a separate order instead.` };
  const open = sameBrand.filter((order) => order.status === 'PENDING');
  if (!open.length) {
    const latest = sameBrand[0];
    return { problem: `Order ${latest.orderNumber} is already ${latest.status.toLowerCase()}, so items can no longer be added. Remove “order added” to save this as a new order.` };
  }
  const sorted = [...open].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { order: sorted[0], others: sorted.length - 1 };
}

/** Add lines to an order: the same product at a new quantity becomes one line, priced as the sum of both. */
export function mergeOrderItems(existing: OrderItem[], added: OrderItem[]): OrderItem[] {
  const result = existing.map((item) => ({ ...item }));
  for (const item of added) {
    const same = result.find((line) => line.productId === item.productId);
    if (!same) { result.push({ ...item }); continue; }
    const quantity = same.quantity + item.quantity;
    const totalPrice = money(same.totalPrice + item.totalPrice);
    same.quantity = quantity; same.totalPrice = totalPrice; same.unitPrice = money(totalPrice / quantity);
    if (same.discountAmount !== undefined || item.discountAmount !== undefined) same.discountAmount = money((same.discountAmount || 0) + (item.discountAmount || 0));
    if (same.catalogUnitPrice === undefined && item.catalogUnitPrice !== undefined) same.catalogUnitPrice = item.catalogUnitPrice;
  }
  return result;
}

/** The order after an add-on: items merged, total increased, the written price and discount kept consistent. */
export function applyAddOn(order: Pick<Order, 'items' | 'totalAmount' | 'statedPrice' | 'discountPercent'>, added: { items: OrderItem[]; total: number; discountPercent?: number | null }): Pick<Order, 'items' | 'totalAmount' | 'statedPrice' | 'discountPercent'> {
  const totalAmount = money(order.totalAmount + added.total);
  const discountPercent = order.discountPercent !== undefined && added.discountPercent === order.discountPercent ? order.discountPercent : undefined;
  return {
    items: mergeOrderItems(order.items, added.items), totalAmount,
    statedPrice: order.statedPrice !== undefined ? totalAmount : undefined,
    discountPercent,
  };
}

export function itemSummary(items: { productName?: string; name?: string; quantity: number }[]): string {
  return items.map((item) => `${item.quantity}× ${item.productName || item.name}`).join(', ');
}
