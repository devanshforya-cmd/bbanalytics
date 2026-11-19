/**
 * Which field records belong to a store. A record saved with a store id belongs only to that
 * store; matching by name is kept for older records saved without one, since two stores can
 * share a name (chain branches, same-named shops in different areas).
 */
export function belongsToStore(record: { entityId?: string; storeName?: string }, store: { id: string; name: string }): boolean {
  if (record.entityId) return record.entityId === store.id;
  return !!record.storeName && record.storeName.trim().toLowerCase() === store.name.trim().toLowerCase();
}

/** Typical days between a store's orders (median gap), or null with fewer than two order days. */
export function orderCadenceDays(dates: string[]): number | null {
  const days = [...new Set(dates.map((date) => (date || '').slice(0, 10)).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  if (days.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i += 1) gaps.push(Math.round((Date.parse(`${days[i]}T00:00:00Z`) - Date.parse(`${days[i - 1]}T00:00:00Z`)) / 86400000));
  gaps.sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2;
  return Math.max(1, Math.round(median));
}

export interface ShelfForecastRow {
  productId: string;
  productName: string;
  brandCode: string;
  shelfQty: number;
  countedOn: string;
  /** Units a day, from the last two counts and what the store ordered between them; null until there are two counts. */
  perDay: number | null;
  daysLeft: number | null;
  status: 'OUT' | 'CRITICAL' | 'LOW' | 'OK' | 'UNKNOWN';
}

/**
 * How fast each product leaves this store's shelf: between the last two counts that include it,
 * units sold = earlier count + units ordered in between − later count.
 */
export function shelfForecast(
  counts: { dateAd: string; createdAt: string; items: { productId: string; productName: string; brandCode: string; shelfQty: number; restockedQty?: number; damagedQty?: number }[] }[],
  orders: { status: string; orderDateAd: string; items: { productId: string; totalUnits: number }[] }[],
): ShelfForecastRow[] {
  const sorted = [...counts].sort((a, b) => (a.dateAd || a.createdAt).localeCompare(b.dateAd || b.createdAt));
  const productIds = new Set(sorted.flatMap((count) => count.items.map((item) => item.productId)));
  const rows: ShelfForecastRow[] = [];
  for (const productId of productIds) {
    const seen = sorted.filter((count) => count.items.some((item) => item.productId === productId));
    const last = seen[seen.length - 1];
    const lastItem = last.items.find((item) => item.productId === productId)!;
    const prev = seen.length > 1 ? seen[seen.length - 2] : null;
    let perDay: number | null = null;
    if (prev) {
      const prevItem = prev.items.find((item) => item.productId === productId)!;
      const from = (prev.dateAd || prev.createdAt).slice(0, 10), to = (last.dateAd || last.createdAt).slice(0, 10);
      const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
      if (days > 0) {
        const ordered = orders
          .filter((order) => order.status !== 'CANCELLED' && order.orderDateAd > from && order.orderDateAd <= to)
          .reduce((sum, order) => sum + order.items.filter((item) => item.productId === productId).reduce((acc, item) => acc + (item.totalUnits || 0), 0), 0);
        const sold = (prevItem.shelfQty || 0) + ordered - (lastItem.shelfQty || 0) - (lastItem.damagedQty || 0);
        perDay = Math.max(0, Math.round((sold / days) * 10) / 10);
      }
    }
    const shelfQty = lastItem.shelfQty || 0;
    const daysLeft = perDay && perDay > 0 ? Math.round((shelfQty / perDay) * 10) / 10 : null;
    const status: ShelfForecastRow['status'] = shelfQty === 0 ? 'OUT' : daysLeft === null ? 'UNKNOWN' : daysLeft <= 3 ? 'CRITICAL' : daysLeft <= 10 ? 'LOW' : 'OK';
    rows.push({ productId, productName: lastItem.productName, brandCode: lastItem.brandCode, shelfQty, countedOn: (last.dateAd || last.createdAt).slice(0, 10), perDay, daysLeft, status });
  }
  const rank = { OUT: 0, CRITICAL: 1, LOW: 2, UNKNOWN: 3, OK: 4 } as const;
  return rows.sort((a, b) => rank[a.status] - rank[b.status] || (a.daysLeft ?? 999) - (b.daysLeft ?? 999));
}
