/**
 * Store stock ledger: a running account of each product at a store, like a balance sheet.
 *
 *   In  (debit)  = units delivered to the store (dispatch orders marked Delivered;
 *                  older dispatches without a status count from their dispatch date)
 *   Out (credit) = units sold, worked out at each shelf count:
 *                  balance before the count − units counted − units damaged
 *   Balance      = what should be on the shelf; reset to the counted number at every count
 *
 * Units dispatched but not yet delivered are shown as "In transit", outside the balance.
 * Nothing is estimated before the first count: deliveries before it simply build the balance.
 */
import type { Dispatch, StockCount } from './types';
import { dispatchStatus } from './dispatch-flow';

export interface LedgerStore { id: string; name: string; kind: 'RETAILER' | 'BRANCH' | 'DISTRIBUTOR' }

export interface LedgerEntry {
  date: string;
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  kind: 'DELIVERY' | 'COUNT' | 'OPENING' | 'SALE';
  particulars: string;
  /** Units received. */
  in: number;
  /** Units sold since the previous count (never negative; a surplus shows as `adjustment`). */
  out: number;
  damaged: number;
  /** Units found above what the ledger expected (unrecorded delivery, counting error). */
  adjustment: number;
  balance: number;
  /** Price per unit when known, for values. */
  unitPrice?: number;
}

export interface LedgerSummary {
  productId: string;
  productName: string;
  received: number;
  sold: number;
  damaged: number;
  adjustments: number;
  onShelf: number;
  inTransit: number;
  lastCountedOn: string | null;
  receivedValue: number;
  soldValue: number;
}

/** Does a dispatch go to this store? */
export function dispatchGoesTo(dispatch: Dispatch, store: LedgerStore): boolean {
  if (dispatch.storeId) return dispatch.storeId === store.id;
  if (store.kind === 'BRANCH') return dispatch.branchId === store.id;
  return dispatch.distributorId === store.id && !dispatch.branchId;
}

const dayOf = (value?: string | null) => (value || '').slice(0, 10);

/** When the goods reached the store, or null if they have not (yet). */
function deliveredOn(dispatch: Dispatch): string | null {
  const status = dispatchStatus(dispatch);
  if (status === 'DELIVERED') return dayOf(dispatch.deliveredDateAd || dispatch.dispatchDateAd || dispatch.createdAt);
  if (!dispatch.status) return dayOf(dispatch.dispatchDateAd || dispatch.createdAt); // older dispatches
  return null;
}

export function buildStoreLedger(stores: LedgerStore[], dispatches: Dispatch[], counts: StockCount[], names: Map<string, string> = new Map()): { entries: LedgerEntry[]; summary: LedgerSummary[] } {
  const entries: LedgerEntry[] = [];
  const totals = new Map<string, LedgerSummary>();
  const total = (productId: string, productName: string) => {
    let row = totals.get(productId);
    if (!row) { row = { productId, productName: names.get(productId) || productName, received: 0, sold: 0, damaged: 0, adjustments: 0, onShelf: 0, inTransit: 0, lastCountedOn: null, receivedValue: 0, soldValue: 0 }; totals.set(productId, row); }
    return row;
  };

  for (const store of stores) {
    const storeDispatches = dispatches.filter((d) => dispatchGoesTo(d, store) && dispatchStatus(d) !== 'CANCELLED');
    const storeCounts = counts.filter((c) => c.entityId === store.id);
    type Event = { date: string; order: number; productId: string; productName: string; apply: () => void };
    const events: Event[] = [];
    const balance = new Map<string, number>();
    const lastPrice = new Map<string, number>();

    for (const dispatch of storeDispatches) {
      const day = deliveredOn(dispatch);
      for (const item of dispatch.items) {
        if (!day) {
          if (dispatchStatus(dispatch) === 'DISPATCHED') total(item.productId, item.productName).inTransit += item.quantity;
          continue;
        }
        events.push({ date: day, order: 0, productId: item.productId, productName: item.productName, apply: () => {
          const next = (balance.get(item.productId) || 0) + item.quantity;
          balance.set(item.productId, next);
          if (item.unitPrice) lastPrice.set(item.productId, item.unitPrice);
          const sum = total(item.productId, item.productName);
          sum.received += item.quantity;
          sum.receivedValue += item.quantity * (item.unitPrice || 0);
          entries.push({ date: day, storeId: store.id, storeName: store.name, productId: item.productId, productName: sum.productName, kind: 'DELIVERY',
            particulars: `Delivered ${dispatch.dispatchNumber || ''}${dispatch.orderNumber ? ` (${dispatch.orderNumber})` : ''}`.trim(), in: item.quantity, out: 0, damaged: 0, adjustment: 0, balance: next, unitPrice: item.unitPrice });
        } });
      }
    }
    for (const count of storeCounts) {
      const day = dayOf(count.dateAd || count.createdAt);
      for (const item of count.items) {
        if (count.mode === 'SALES') {
          // A "Sold today" entry: units sold come off the balance; it is not a count.
          events.push({ date: day, order: 0.5, productId: item.productId, productName: item.productName, apply: () => {
            const sum = total(item.productId, item.productName);
            const sold = Math.max(0, item.soldQty || 0);
            const next = (balance.get(item.productId) || 0) - sold;
            balance.set(item.productId, next);
            sum.sold += sold; sum.soldValue += sold * (lastPrice.get(item.productId) || 0);
            entries.push({ date: day, storeId: store.id, storeName: store.name, productId: item.productId, productName: sum.productName, kind: 'SALE',
              particulars: `Sold, entered by ${count.officerName || 'staff'}`, in: 0, out: sold, damaged: 0, adjustment: 0, balance: next, unitPrice: lastPrice.get(item.productId) });
          } });
          continue;
        }
        events.push({ date: day, order: 1, productId: item.productId, productName: item.productName, apply: () => {
          const sum = total(item.productId, item.productName);
          const counted = item.shelfQty || 0;
          const damaged = item.damagedQty || 0;
          const first = sum.lastCountedOn === null && !balance.has(item.productId);
          const expected = balance.get(item.productId) || 0;
          const diff = expected - counted - damaged;
          const out = first ? 0 : Math.max(0, diff);
          const adjustment = first ? 0 : Math.max(0, -diff);
          balance.set(item.productId, counted);
          sum.sold += out; sum.damaged += damaged; sum.adjustments += adjustment;
          sum.soldValue += out * (lastPrice.get(item.productId) || 0);
          if (!sum.lastCountedOn || day > sum.lastCountedOn) sum.lastCountedOn = day;
          entries.push({ date: day, storeId: store.id, storeName: store.name, productId: item.productId, productName: sum.productName, kind: first ? 'OPENING' : 'COUNT',
            particulars: first ? 'Opening count' : `Shelf count by ${count.officerName || 'staff'}`, in: 0, out, damaged, adjustment, balance: counted, unitPrice: lastPrice.get(item.productId) });
        } });
      }
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order).forEach((event) => event.apply());
    for (const [productId, qty] of balance) total(productId, '').onShelf += qty;
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.productName.localeCompare(b.productName));
  const summary = [...totals.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  return { entries, summary };
}
