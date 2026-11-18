import type { Combo, Order, ReturnEntry } from './types';

/** One thing that can come back from an order: a product, a whole combo, or one product out of a combo. */
export interface ReturnableLine {
  key: string;
  productId: string;
  productName: string;
  brandCode: string;
  /** Set when this line is one product inside a combo. */
  comboId?: string;
  comboName?: string;
  /** True for the whole-combo line. */
  wholeCombo?: boolean;
  ordered: number;
  returned: number;
  remaining: number;
}

const counted = (entry: ReturnEntry) => entry.orderStatus !== 'Rejected';

/**
 * What can still be returned from an order. A combo offers the whole combo and each product inside it.
 * Returning the whole combo uses up its products; returning one product leaves the rest of the combo returnable
 * one by one (the whole-combo line then only counts complete sets).
 */
export function returnableLines(order: Pick<Order, 'id' | 'items' | 'brandCode'>, combos: Combo[], returns: ReturnEntry[]): ReturnableLine[] {
  const own = returns.filter((entry) => entry.orderId === order.id && counted(entry));
  const lines: ReturnableLine[] = [];
  for (const item of order.items) {
    // Free gifts are not returned for money; they stay out of the list.
    if (item.isGift) continue;
    const combo = combos.find((entry) => entry.id === item.productId);
    if (!combo || !combo.items?.length) {
      const returned = own.filter((entry) => entry.productId === item.productId && !entry.comboId).reduce((sum, entry) => sum + entry.quantity, 0);
      lines.push({ key: item.productId, productId: item.productId, productName: item.productName, brandCode: item.brandCode || order.brandCode, ordered: item.quantity, returned, remaining: Math.max(0, item.quantity - returned) });
      continue;
    }
    const per = new Map<string, { name: string; quantity: number }>();
    for (const part of combo.items) {
      const prior = per.get(part.productId);
      per.set(part.productId, { name: part.productName, quantity: (prior?.quantity || 0) + (part.quantity || 1) });
    }
    const wholeReturned = own.filter((entry) => entry.productId === combo.id && !entry.comboId).reduce((sum, entry) => sum + entry.quantity, 0);
    const parts = [...per.entries()].map(([productId, part]) => {
      const ordered = item.quantity * part.quantity;
      const loose = own.filter((entry) => entry.comboId === combo.id && entry.productId === productId).reduce((sum, entry) => sum + entry.quantity, 0);
      const returned = loose + wholeReturned * part.quantity;
      return { productId, name: part.name, per: part.quantity, ordered, returned, remaining: Math.max(0, ordered - returned) };
    });
    const wholeRemaining = Math.max(0, Math.min(item.quantity - wholeReturned, ...parts.map((part) => Math.floor(part.remaining / part.per))));
    lines.push({ key: combo.id, productId: combo.id, productName: item.productName, brandCode: item.brandCode || order.brandCode, wholeCombo: true, ordered: item.quantity, returned: item.quantity - wholeRemaining, remaining: wholeRemaining });
    for (const part of parts) lines.push({ key: `${combo.id}::${part.productId}`, productId: part.productId, productName: part.name, brandCode: item.brandCode || order.brandCode, comboId: combo.id, comboName: item.productName, ordered: part.ordered, returned: part.returned, remaining: part.remaining });
  }
  return lines;
}

/** How a return names what came back: "Rosemary Shampoo (from Hair Care Pair)". */
export function returnedProductLabel(entry: Pick<ReturnEntry, 'productName' | 'comboName'>): string {
  return entry.comboName ? `${entry.productName} (from ${entry.comboName})` : entry.productName;
}
