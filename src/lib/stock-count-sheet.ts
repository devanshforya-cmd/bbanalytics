/**
 * Shelf stock counts: what to count at a store, what to expect on the shelf, and how each store
 * stands. Pure functions so the form, the store page and the overview agree.
 *
 * What the store "carries" = products it has ordered (any order that was not cancelled) or that were
 * counted there before. Only active products are listed; anything else is behind "add another
 * product" on the form.
 */
import type { Product, SecondaryOrder, StockCount } from './types';
import { productLabel } from './sub-brands';
import { shelfForecast } from './store-records';

const DAY = 86400000;
const day = (value?: string) => (value || '').slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export interface SheetRow {
  productId: string;
  label: string;
  fullName: string;
  brandCode: string;
  subBrandId?: string;
  lastQty: number | null;
  lastDateAd: string | null;
  /** Units ordered for the store since the last count (not cancelled). */
  deliveredSince: number;
  /** Units sold per day, from the last two counts; null until there are two. */
  perDay: number | null;
  /** What should be on the shelf today; null when there is no earlier count. */
  expected: number | null;
}

export interface SheetInput {
  storeId: string;
  products: Product[];
  secondaryOrders: SecondaryOrder[];
  stockCounts: StockCount[];
  todayAd: string;
}

function storeCounts(input: SheetInput) {
  return input.stockCounts.filter((count) => count.entityId === input.storeId)
    .sort((a, b) => (day(a.dateAd) || day(a.createdAt)).localeCompare(day(b.dateAd) || day(b.createdAt)));
}

/** The rows to count at a store, most-ordered first. */
export function countSheet(input: SheetInput): { rows: SheetRow[]; others: Product[] } {
  const active = input.products.filter((product) => product.active !== false);
  const orders = input.secondaryOrders.filter((order) => order.entityId === input.storeId && order.status !== 'CANCELLED');
  const counts = storeCounts(input);
  const forecast = shelfForecast(counts, orders);
  const ordered = new Map<string, number>();
  for (const order of orders) for (const item of order.items) ordered.set(item.productId, (ordered.get(item.productId) || 0) + (item.totalUnits || 0));
  const counted = new Set(counts.flatMap((count) => count.items.map((item) => item.productId)));
  const carried = active.filter((product) => ordered.has(product.id) || counted.has(product.id));

  const rows = carried.map((product): SheetRow => {
    const last = [...counts].reverse().find((count) => count.items.some((item) => item.productId === product.id));
    const lastItem = last?.items.find((item) => item.productId === product.id);
    const lastDateAd = last ? day(last.dateAd) || day(last.createdAt) : null;
    const deliveredSince = orders.filter((order) => !lastDateAd || day(order.orderDateAd) > lastDateAd)
      .reduce((sum, order) => sum + order.items.filter((item) => item.productId === product.id).reduce((acc, item) => acc + (item.totalUnits || 0), 0), 0);
    const perDay = forecast.find((row) => row.productId === product.id)?.perDay ?? null;
    const expected = lastItem && lastDateAd
      ? Math.max(0, Math.round(lastItem.shelfQty + deliveredSince - (perDay || 0) * Math.max(0, daysBetween(lastDateAd, input.todayAd))))
      : null;
    return { productId: product.id, label: productLabel(product), fullName: product.name, brandCode: product.brandCode, subBrandId: product.subBrandId,
      lastQty: lastItem ? lastItem.shelfQty : null, lastDateAd, deliveredSince, perDay, expected };
  }).sort((a, b) => (ordered.get(b.productId) || 0) - (ordered.get(a.productId) || 0) || a.label.localeCompare(b.label));

  return { rows, others: active.filter((product) => !carried.some((row) => row.id === product.id)) };
}

export type RowCheck = 'OK' | 'MORE_THAN_POSSIBLE' | 'MUCH_LOWER' | 'OUT';

/**
 * Sense-check one count. More than last count + units delivered means a miscount or stock from
 * another supplier; much lower than expected is worth a second look.
 */
export function checkCount(row: Pick<SheetRow, 'lastQty' | 'deliveredSince' | 'expected'>, qty: number): RowCheck {
  if (qty === 0) return 'OUT';
  if (row.lastQty !== null && qty > row.lastQty + row.deliveredSince) return 'MORE_THAN_POSSIBLE';
  if (row.expected !== null && row.expected >= 6 && qty < row.expected * 0.5) return 'MUCH_LOWER';
  return 'OK';
}

/** The items to save: counted rows only, with the previous count and the drop flag set properly. */
export function buildCountItems(rows: SheetRow[], quantities: Record<string, number | null | undefined>) {
  return rows.filter((row) => typeof quantities[row.productId] === 'number').map((row) => {
    const shelfQty = Math.max(0, Math.round(quantities[row.productId] as number));
    const previousQty = row.lastQty ?? 0;
    return { productId: row.productId, productName: row.fullName, brandCode: row.brandCode, ...(row.subBrandId ? { subBrandId: row.subBrandId } : {}),
      shelfQty, previousQty, flaggedDrop: row.lastQty !== null && row.lastQty > 0 && shelfQty < row.lastQty * 0.5 };
  });
}

export interface StoreStockStatus {
  storeId: string;
  lastCountAd: string | null;
  daysSinceCount: number | null;
  outOfStock: number;
  runningLow: number;
  counted: number;
}

/** How a store stands: when it was last counted and how many products are out or running low (≤ 7 days left). */
export function storeStockStatus(storeId: string, stockCounts: StockCount[], secondaryOrders: SecondaryOrder[], todayAd: string): StoreStockStatus {
  const counts = stockCounts.filter((count) => count.entityId === storeId);
  const orders = secondaryOrders.filter((order) => order.entityId === storeId && order.status !== 'CANCELLED');
  const rows = shelfForecast(counts, orders);
  const lastCountAd = counts.map((count) => day(count.dateAd) || day(count.createdAt)).sort().pop() || null;
  return {
    storeId, lastCountAd, daysSinceCount: lastCountAd ? daysBetween(lastCountAd, todayAd) : null,
    outOfStock: rows.filter((row) => row.status === 'OUT').length,
    runningLow: rows.filter((row) => row.daysLeft !== null && row.daysLeft <= 7 && row.status !== 'OUT').length,
    counted: rows.length,
  };
}
