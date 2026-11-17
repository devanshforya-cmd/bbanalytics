import type { Order, ReturnEntry } from './types';

export const RETURN_RESOLUTIONS: ReturnEntry['orderStatus'][] = ['Pending', 'Exchanged', 'Refunded', 'Returned', 'Rejected'];

/** An exchange is only complete when it points at the replacement order. */
export function exchangeNeedsLink(entry: ReturnEntry): boolean {
  return entry.orderStatus === 'Exchanged' && !entry.exchangeOrderId;
}

/** A replacement order is logistics work, not a new sale. */
export function isExchangeOrder(order: Pick<Order, 'exchangeReturnId' | 'exchangeOfOrderId'>): boolean {
  return !!(order.exchangeReturnId || order.exchangeOfOrderId);
}

const days = (from?: string, to?: string) => from && to ? Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86400000)) : null;
const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 1000) / 10 : 0;
const median = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };

export interface ExchangeAnalysis {
  returns: number; units: number;
  byResolution: Record<ReturnEntry['orderStatus'], number>;
  exchangeRate: number; refundRate: number; pendingCount: number;
  linked: number; unlinked: number;
  replacementsDelivered: number; replacementsInTransit: number; replacementsFailed: number;
  /** Price difference collected on replacement orders (NPR). */
  differenceCollected: number;
  medianDaysOrderToReturn: number | null; medianDaysReturnToReplacementDelivered: number | null;
  /** Reason → how it was resolved. */
  reasonMatrix: { reason: string; total: number; exchanged: number; refunded: number; other: number }[];
  /** What came back and what was sent instead. */
  swaps: { from: string; to: string; count: number }[];
  topReturnedProducts: { product: string; units: number; exchangeShare: number }[];
}

export function exchangeAnalysis(returns: ReturnEntry[], orders: Order[]): ExchangeAnalysis {
  const byId = new Map(orders.map((order) => [order.id, order]));
  const byResolution = { Pending: 0, Exchanged: 0, Refunded: 0, Returned: 0, Rejected: 0 } as ExchangeAnalysis['byResolution'];
  for (const entry of returns) byResolution[entry.orderStatus] = (byResolution[entry.orderStatus] || 0) + 1;
  const exchanged = returns.filter((entry) => entry.orderStatus === 'Exchanged');
  const replacements = exchanged.map((entry) => entry.exchangeOrderId ? byId.get(entry.exchangeOrderId) : undefined);
  const decided = returns.length - byResolution.Pending;

  const reasons = new Map<string, { total: number; exchanged: number; refunded: number }>();
  for (const entry of returns) {
    const row = reasons.get(entry.reasonCategory) || { total: 0, exchanged: 0, refunded: 0 };
    row.total += 1; if (entry.orderStatus === 'Exchanged') row.exchanged += 1; if (entry.orderStatus === 'Refunded') row.refunded += 1;
    reasons.set(entry.reasonCategory, row);
  }
  const swaps = new Map<string, number>();
  exchanged.forEach((entry, index) => {
    const replacement = replacements[index];
    if (!replacement) return;
    const sent = replacement.items.map((item) => item.productName).join(' + ') || '—';
    const key = `${entry.productName}→${sent}`;
    swaps.set(key, (swaps.get(key) || 0) + 1);
  });
  const products = new Map<string, { units: number; exchanged: number }>();
  for (const entry of returns) {
    const row = products.get(entry.productName) || { units: 0, exchanged: 0 };
    row.units += entry.quantity || 1; if (entry.orderStatus === 'Exchanged') row.exchanged += entry.quantity || 1;
    products.set(entry.productName, row);
  }

  return {
    returns: returns.length, units: returns.reduce((sum, entry) => sum + (entry.quantity || 1), 0), byResolution,
    exchangeRate: pct(byResolution.Exchanged, decided), refundRate: pct(byResolution.Refunded, decided), pendingCount: byResolution.Pending,
    linked: exchanged.filter((entry) => entry.exchangeOrderId).length, unlinked: exchanged.filter(exchangeNeedsLink).length,
    replacementsDelivered: replacements.filter((order) => order?.status === 'DELIVERED').length,
    replacementsInTransit: replacements.filter((order) => order && ['PENDING', 'DISPATCHED'].includes(order.status)).length,
    replacementsFailed: replacements.filter((order) => order?.status === 'FAILED').length,
    differenceCollected: replacements.reduce((sum, order) => sum + (order?.totalAmount || 0), 0),
    medianDaysOrderToReturn: median(returns.map((entry) => days(entry.orderProcessedDateAd, entry.dateAd)).filter((value): value is number => value !== null)),
    medianDaysReturnToReplacementDelivered: median(exchanged.map((entry, index) => days(entry.dateAd, replacements[index]?.deliveredDateAd)).filter((value): value is number => value !== null)),
    reasonMatrix: [...reasons.entries()].map(([reason, row]) => ({ reason, ...row, other: row.total - row.exchanged - row.refunded })).sort((a, b) => b.total - a.total),
    swaps: [...swaps.entries()].map(([key, count]) => { const [from, to] = key.split('→'); return { from, to, count }; }).sort((a, b) => b.count - a.count).slice(0, 8),
    topReturnedProducts: [...products.entries()].map(([product, row]) => ({ product, units: row.units, exchangeShare: pct(row.exchanged, row.units) })).sort((a, b) => b.units - a.units).slice(0, 8),
  };
}
