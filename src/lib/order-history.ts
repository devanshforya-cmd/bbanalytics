import type { Order, OrderEditEntry, OrderItem } from './types';

/**
 * Field-level order history (November 2026 change 7).
 * The server calls diffOrder() with the stored record and the incoming one,
 * so who/when/old/new can never be supplied or rewritten by a browser.
 */

const FIELDS: { key: keyof Order; label: string }[] = [
  { key: 'customerName', label: 'Customer name' },
  { key: 'customerPhone', label: 'Phone' },
  { key: 'alternatePhone', label: 'Alternate phone' },
  { key: 'address', label: 'Address' },
  { key: 'province', label: 'Province' },
  { key: 'district', label: 'District' },
  { key: 'brandCode', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'orderDateAd', label: 'Order date' },
  { key: 'paymentTerms', label: 'Payment status' },
  { key: 'deliveryMethod', label: 'Delivery method' },
  { key: 'notes', label: 'Remarks' },
  { key: 'assignedToName', label: 'Responsible person' },
  { key: 'status', label: 'Status' },
  { key: 'totalAmount', label: 'Total' },
];

export function describeItems(items: Pick<OrderItem, 'productName' | 'quantity'>[] | undefined): string {
  if (!items?.length) return 'No products';
  return items.map((item) => `${item.quantity}× ${item.productName}`).join(', ');
}

const text = (value: unknown) => value === undefined || value === null ? '' : String(value).trim();

export function diffOrder(previous: Partial<Order>, next: Partial<Order>): { field: string; oldValue: string; newValue: string }[] {
  const changes: { field: string; oldValue: string; newValue: string }[] = [];
  for (const { key, label } of FIELDS) {
    const before = text(previous[key]);
    const after = text(next[key]);
    if (before !== after) changes.push({ field: label, oldValue: before || '—', newValue: after || '—' });
  }
  const itemsBefore = describeItems(previous.items);
  const itemsAfter = describeItems(next.items);
  if (itemsBefore !== itemsAfter) changes.push({ field: 'Products', oldValue: itemsBefore, newValue: itemsAfter });
  return changes;
}

/** A reason is required only when the phone number or the order date changes. */
export function editNeedsReason(previous: Partial<Order>, next: Partial<Order>): boolean {
  return text(previous.customerPhone).replace(/\D/g, '').slice(-10) !== text(next.customerPhone).replace(/\D/g, '').slice(-10)
    || text(previous.orderDateAd) !== text(next.orderDateAd);
}

export function historyEntries(previous: Partial<Order>, next: Partial<Order>, editor: { id: string; name: string }, options: { reason?: string; overwroteVersionBy?: string; timestamp?: string } = {}): OrderEditEntry[] {
  const timestamp = options.timestamp || new Date().toISOString();
  return diffOrder(previous, next).map((change) => ({
    timestamp, changedBy: editor.name, changedById: editor.id, ...change,
    ...(options.reason ? { reason: options.reason } : {}),
    ...(options.overwroteVersionBy ? { overwroteVersionBy: options.overwroteVersionBy } : {}),
  }));
}
