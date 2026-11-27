/**
 * A store's stock, kept like a running account per product.
 *
 *   + Received   stock delivered to the store (a delivered dispatch, or an older delivered store
 *                order that has no dispatch)
 *   − Sold       units the store reported selling ("Sold today" entries)
 *   = Balance
 *   Count        a shelf count ("Stock on shelf now") replaces the balance with what was counted.
 *                Fewer than the records = sold (worked out from the count); more = found.
 *
 * Closing = opening + received − sold + found, for any period. Pure functions, so the
 * entry forms, the store's balance sheet and the overview all agree.
 */
import type { Dispatch, SecondaryOrder, StockCount } from './types';

export type MovementKind = 'RECEIVED' | 'SOLD' | 'COUNT';

export interface StockMovement {
  productId: string;
  productName: string;
  brandCode: string;
  dateAd: string;
  kind: MovementKind;
  /** Units in (+) or out (−). For a count, the count difference. */
  change: number;
  /** For a count: what was counted. */
  counted?: number;
  balanceBefore: number;
  balanceAfter: number;
  /** DP-0045, SO-0108, or who made the entry. */
  ref: string;
  by?: string;
  /** True for the first record of a product at the store, when it was a count (its opening stock). */
  opening?: boolean;
}

export interface StockInput {
  storeId: string;
  dispatches: Dispatch[];
  secondaryOrders: SecondaryOrder[];
  stockCounts: StockCount[];
}

const day = (value?: string) => (value || '').slice(0, 10);
const RANK: Record<MovementKind, number> = { RECEIVED: 0, SOLD: 1, COUNT: 2 };
const OPEN_DISPATCH = new Set(['ORDER_RECEIVED', 'PACKED', 'DISPATCHED']);

const forStore = (storeId: string, record: { storeId?: string; branchId?: string; distributorId?: string; entityId?: string }) =>
  record.storeId ? record.storeId === storeId : record.branchId ? record.branchId === storeId : (record.entityId || record.distributorId) === storeId;

/** True when an entry is a "Sold today" entry rather than a shelf count. */
export const isSalesEntry = (count: Pick<StockCount, 'mode'>) => count.mode === 'SALES';

interface RawEvent { productId: string; productName: string; brandCode: string; dateAd: string; at: string; kind: MovementKind; qty: number; ref: string; by?: string }

function rawEvents(input: StockInput): RawEvent[] {
  const events: RawEvent[] = [];
  const dispatched = new Set<string>();
  for (const disp of input.dispatches) {
    if (!forStore(input.storeId, disp)) continue;
    if (disp.orderId) dispatched.add(disp.orderId);
    // Older dispatches have no status: they count as delivered on their dispatch date.
    const delivered = disp.status === 'DELIVERED' || (!disp.status && !!disp.dispatchDateAd);
    if (!delivered) continue;
    const dateAd = day(disp.deliveredDateAd || disp.dispatchDateAd || disp.createdAt);
    if (!dateAd) continue;
    for (const item of disp.items) {
      const qty = item.quantityPcs ?? item.quantity ?? 0;
      if (qty > 0) events.push({ productId: item.productId, productName: item.productName, brandCode: item.brandCode, dateAd, at: disp.createdAt || dateAd, kind: 'RECEIVED', qty, ref: disp.dispatchNumber || disp.orderNumber || 'Delivery' });
    }
  }
  // Older store orders delivered without a dispatch order.
  for (const order of input.secondaryOrders) {
    if (order.entityId !== input.storeId || order.status !== 'DELIVERED' || dispatched.has(order.id)) continue;
    for (const item of order.items) {
      const qty = (item.totalUnits || 0) + (item.freeUnits || 0);
      if (qty > 0) events.push({ productId: item.productId, productName: item.productName, brandCode: item.brandCode, dateAd: day(order.orderDateAd), at: order.createdAt, kind: 'RECEIVED', qty, ref: order.orderNumber || 'Store order' });
    }
  }
  for (const count of input.stockCounts) {
    if (count.entityId !== input.storeId) continue;
    const dateAd = day(count.dateAd) || day(count.createdAt);
    const sales = isSalesEntry(count);
    for (const item of count.items) {
      if (sales) { if ((item.soldQty || 0) > 0) events.push({ productId: item.productId, productName: item.productName, brandCode: item.brandCode, dateAd, at: count.createdAt, kind: 'SOLD', qty: item.soldQty || 0, ref: 'Sales entry', by: count.officerName }); }
      else events.push({ productId: item.productId, productName: item.productName, brandCode: item.brandCode, dateAd, at: count.createdAt, kind: 'COUNT', qty: Math.max(0, item.shelfQty || 0), ref: 'Shelf count', by: count.officerName });
    }
  }
  // Within a day: deliveries, then sales, then counts (a count is the day's end state).
  return events.sort((a, b) => a.dateAd.localeCompare(b.dateAd) || RANK[a.kind] - RANK[b.kind] || (a.at || '').localeCompare(b.at || ''));
}

/** Every stock movement at a store, oldest first, with the running balance per product. */
export function stockMovements(input: StockInput): StockMovement[] {
  const balance = new Map<string, number>();
  return rawEvents(input).map((event) => {
    const known = balance.has(event.productId);
    const before = balance.get(event.productId) || 0;
    const after = event.kind === 'RECEIVED' ? before + event.qty : event.kind === 'SOLD' ? before - event.qty : event.qty;
    balance.set(event.productId, after);
    return {
      productId: event.productId, productName: event.productName, brandCode: event.brandCode, dateAd: event.dateAd, kind: event.kind,
      change: after - before, ...(event.kind === 'COUNT' ? { counted: event.qty } : {}), balanceBefore: before, balanceAfter: after,
      ref: event.ref, ...(event.by ? { by: event.by } : {}), ...(event.kind === 'COUNT' && !known ? { opening: true } : {}),
    };
  });
}

/** Units on the way to the store: dispatch orders not delivered yet, and store orders without one. */
export function onOrder(input: Pick<StockInput, 'storeId' | 'dispatches' | 'secondaryOrders'>): Map<string, number> {
  const result = new Map<string, number>();
  const add = (id: string, qty: number) => result.set(id, (result.get(id) || 0) + qty);
  const dispatched = new Set<string>();
  for (const disp of input.dispatches) {
    if (!forStore(input.storeId, disp)) continue;
    if (disp.orderId) dispatched.add(disp.orderId);
    if (!disp.status || !OPEN_DISPATCH.has(disp.status)) continue;
    for (const item of disp.items) add(item.productId, item.quantityPcs ?? item.quantity ?? 0);
  }
  for (const order of input.secondaryOrders) {
    if (order.entityId !== input.storeId || dispatched.has(order.id) || !['PENDING_DISPATCH', 'DISPATCHED'].includes(order.status)) continue;
    for (const item of order.items) add(item.productId, (item.totalUnits || 0) + (item.freeUnits || 0));
  }
  return result;
}

/** What the records say is in the store now, per product. Products never received or counted are absent. */
export function currentStock(input: StockInput): Map<string, number> {
  const result = new Map<string, number>();
  for (const move of stockMovements(input)) result.set(move.productId, move.balanceAfter);
  return result;
}

export interface BalanceRow {
  productId: string;
  productName: string;
  brandCode: string;
  opening: number;
  received: number;
  /** Units sold: entered as sales, plus units gone as found by shelf counts. */
  sold: number;
  soldEntered: number;
  soldByCount: number;
  /** Units a count found above the records (opening stock, an unrecorded delivery, a miscount). */
  found: number;
  /** found − soldByCount: what counts changed in total. */
  countDifference: number;
  closing: number;
  onOrder: number;
  /** Units gone per day in the period: reported sales plus any unreported drop found by counts. */
  perDay: number | null;
  /** Days the closing stock lasts at that pace. */
  daysLeft: number | null;
  lastCountAd: string | null;
  status: 'OUT' | 'LOW' | 'OK' | 'NEGATIVE' | 'NO_SALES';
  movements: StockMovement[];
}

export interface BalanceSheet {
  rows: BalanceRow[];
  totals: { opening: number; received: number; sold: number; found: number; countDifference: number; closing: number; onOrder: number };
  from: string;
  to: string;
  days: number;
}

const DAY = 86400000;
function sumRows(rows: BalanceRow[]) {
  return rows.reduce((sum, row) => ({
    opening: sum.opening + row.opening, received: sum.received + row.received, sold: sum.sold + row.sold, found: sum.found + row.found,
    countDifference: sum.countDifference + row.countDifference, closing: sum.closing + row.closing, onOrder: sum.onOrder + row.onOrder,
  }), { opening: 0, received: 0, sold: 0, found: 0, countDifference: 0, closing: 0, onOrder: 0 });
}
export const daysBetween = (from: string, to: string) => Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1);

/** The balance sheet of one store for a period (dates inclusive, AD). */
export function balanceSheet(input: StockInput, from: string, to: string, lowDays = 7): BalanceSheet {
  const moves = stockMovements(input);
  const pending = onOrder(input);
  const ids = [...new Set([...moves.map((move) => move.productId), ...pending.keys()])];
  const days = daysBetween(from, to);
  const rows = ids.map((productId): BalanceRow => {
    const own = moves.filter((move) => move.productId === productId);
    const before = own.filter((move) => move.dateAd < from);
    const inside = own.filter((move) => move.dateAd >= from && move.dateAd <= to);
    const opening = before.length ? before[before.length - 1].balanceAfter : 0;
    const received = inside.filter((move) => move.kind === 'RECEIVED').reduce((sum, move) => sum + move.change, 0);
    const soldEntered = inside.filter((move) => move.kind === 'SOLD').reduce((sum, move) => sum - move.change, 0);
    const counts = inside.filter((move) => move.kind === 'COUNT');
    // A count below the records means those units sold (or went missing); above means they were found.
    const soldByCount = counts.reduce((sum, move) => sum + Math.max(0, -move.change), 0);
    const found = counts.reduce((sum, move) => sum + Math.max(0, move.change), 0);
    const sold = soldEntered + soldByCount;
    const countDifference = found - soldByCount;
    const closing = opening + received - sold + found;
    const perDay = inside.length || opening ? Math.round((sold / days) * 10) / 10 : null;
    const daysLeft = perDay && perDay > 0 ? Math.round((Math.max(0, closing) / perDay) * 10) / 10 : null;
    const lastCount = [...own].reverse().find((move) => move.kind === 'COUNT');
    const name = own[own.length - 1] || null;
    const status: BalanceRow['status'] = closing < 0 ? 'NEGATIVE' : closing === 0 ? 'OUT' : daysLeft !== null && daysLeft <= lowDays ? 'LOW' : perDay === 0 ? 'NO_SALES' : 'OK';
    return {
      productId, productName: name?.productName || '', brandCode: name?.brandCode || '', opening, received, sold, soldEntered, soldByCount, found, countDifference, closing,
      onOrder: pending.get(productId) || 0, perDay, daysLeft, lastCountAd: lastCount?.dateAd || null, status, movements: inside,
    };
  });
  const totals = sumRows(rows);
  const rank = { NEGATIVE: 0, OUT: 1, LOW: 2, OK: 3, NO_SALES: 4 } as const;
  rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999) || a.productName.localeCompare(b.productName));
  return { rows, totals, from, to, days };
}

/** One "Sold today" entry: units sold per product, with the balance before and after. */
export function buildSalesItems(rows: { productId: string; productName: string; brandCode: string; subBrandId?: string }[], sold: Record<string, number | null | undefined>, stock: Map<string, number>) {
  return rows.filter((row) => typeof sold[row.productId] === 'number' && (sold[row.productId] as number) > 0).map((row) => {
    const soldQty = Math.max(0, Math.round(sold[row.productId] as number));
    const before = stock.get(row.productId) || 0;
    return { productId: row.productId, productName: row.productName, brandCode: row.brandCode, ...(row.subBrandId ? { subBrandId: row.subBrandId } : {}),
      soldQty, previousQty: before, shelfQty: Math.max(0, before - soldQty), flaggedDrop: false };
  });
}

/** Several stores' sheets as one (an MT chain with its outlets). */
export function mergeSheets(sheets: BalanceSheet[]): BalanceSheet {
  if (sheets.length === 1) return sheets[0];
  const byId = new Map<string, BalanceRow>();
  for (const sheet of sheets) for (const row of sheet.rows) {
    const prev = byId.get(row.productId);
    if (!prev) { byId.set(row.productId, { ...row, movements: [...row.movements] }); continue; }
    const closing = prev.closing + row.closing;
    const perDay = prev.perDay === null && row.perDay === null ? null : Math.round(((prev.perDay || 0) + (row.perDay || 0)) * 10) / 10;
    const daysLeft = perDay && perDay > 0 ? Math.round((Math.max(0, closing) / perDay) * 10) / 10 : null;
    byId.set(row.productId, {
      ...prev, opening: prev.opening + row.opening, received: prev.received + row.received, sold: prev.sold + row.sold,
      soldEntered: prev.soldEntered + row.soldEntered, soldByCount: prev.soldByCount + row.soldByCount, found: prev.found + row.found,
      countDifference: prev.countDifference + row.countDifference, closing, onOrder: prev.onOrder + row.onOrder, perDay, daysLeft,
      lastCountAd: [prev.lastCountAd, row.lastCountAd].filter(Boolean).sort().pop() || null,
      status: closing < 0 ? 'NEGATIVE' : closing === 0 ? 'OUT' : daysLeft !== null && daysLeft <= 7 ? 'LOW' : perDay === 0 ? 'NO_SALES' : 'OK',
      movements: [...prev.movements, ...row.movements].sort((a, b) => a.dateAd.localeCompare(b.dateAd)),
    });
  }
  const rows = [...byId.values()];
  const totals = sumRows(rows);
  return { rows, totals, from: sheets[0]?.from || '', to: sheets[0]?.to || '', days: sheets[0]?.days || 1 };
}
