import type { Product, Promotion, SecondaryOrder, StockCount } from './types';

const DAY = 86_400_000;
const WINDOW_DAYS = 30;

export interface AreaSellingStore {
  id: string;
  name: string;
  city?: string;
  area?: string;
  entityType?: 'RETAILER' | 'BRANCH';
}

export interface AreaProductTrend {
  productId: string;
  productName: string;
  recentUnits: number;
  previousUnits: number;
  growthPct: number | null;
  purchasingStores: number;
  peerStores: number;
  storeRecentUnits: number;
}

export interface StoreOpportunity {
  productId: string;
  productName: string;
  kind: 'INTRODUCE' | 'REVIEW_REORDER';
  score: number;
  reason: string;
}

export interface AreaSellingAnalysis {
  storeId: string;
  areaLabel: string;
  status: 'READY' | 'INSUFFICIENT_DATA';
  message: string;
  recentOrderCount: number;
  recentStoreCount: number;
  peerStoreCount: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  opportunityScore: number | null;
  trends: AreaProductTrend[];
  opportunities: StoreOpportunity[];
}

export function normalizeArea(value: string): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/[\p{P}\p{Z}\s]+/gu, ' ').trim();
}

function areaKey(store: AreaSellingStore): string | null {
  const city = normalizeArea(store.city || '');
  const area = normalizeArea(store.area || '');
  return city && area ? `${city}\u0000${area}` : null;
}

function recordedDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const date = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : NaN;
}

export function applicableStorePromotions(promotions: Promotion[], storeId: string, trade: 'GT' | 'MT' | null, now = new Date()): Promotion[] {
  const today = Math.floor(now.getTime() / DAY) * DAY;
  return promotions.filter(promotion => promotion.active && recordedDay(promotion.validFromAd) <= today && recordedDay(promotion.validToAd) >= today && (
    promotion.applicableStoreTypes === 'ALL' || promotion.applicableStoreTypes === trade || promotion.applicableStoreTypes === 'SPECIFIC' && promotion.applicableStoreIds?.includes(storeId)
  ));
}

/** Inputs must come from the current user's permitted workspace snapshot. No cross-user/global lookup occurs here. */
export function analyzeStoreArea(
  storeId: string,
  stores: AreaSellingStore[],
  orders: SecondaryOrder[],
  products: Product[],
  stockCounts: StockCount[],
  now = new Date(),
  entityType: 'RETAILER' | 'BRANCH' = 'RETAILER',
): AreaSellingAnalysis {
  const store = stores.find(row => row.id === storeId && (row.entityType || 'RETAILER') === entityType);
  const key = store && areaKey(store);
  const result: AreaSellingAnalysis = {
    storeId, areaLabel: store ? [store.area, store.city].filter(Boolean).join(', ') : 'Area not recorded',
    status: 'INSUFFICIENT_DATA', message: 'Record both a city and area for this store to compare local demand.',
    recentOrderCount: 0, recentStoreCount: 0, peerStoreCount: 0, confidence: 'LOW', opportunityScore: null,
    trends: [], opportunities: [],
  };
  if (!store || !key || !Number.isFinite(now.getTime())) return result;

  const nearbyIds = new Set(stores.filter(row => (row.entityType || 'RETAILER') === entityType && areaKey(row) === key).map(row => row.id));
  result.peerStoreCount = nearbyIds.size - 1;
  const catalog = new Map(products.filter(product => product.active !== false).map(product => [product.id, product]));
  const end = Math.floor(now.getTime() / DAY) * DAY + DAY;
  const start = end - WINDOW_DAYS * DAY;
  const previousStart = start - WINDOW_DAYS * DAY;
  const recentBuyers = new Set<string>();
  const seenOrders = new Set<string>();
  const totals = new Map<string, {
    recent: number; previous: number; buyers: Set<string>; peers: Set<string>;
    peerUnits: number; peerOrders: Set<string>; storeRecent: number; storePrevious: number;
  }>();

  // Only delivered secondary orders have an exact store ID. Dispatches and online addresses cannot be safely joined or added again.
  for (const order of orders) {
    if (!order.id || seenOrders.has(order.id) || order.status !== 'DELIVERED' || order.entityType !== entityType || !nearbyIds.has(order.entityId)) continue;
    seenOrders.add(order.id);
    const date = recordedDay(order.orderDateAd);
    if (!Number.isFinite(date) || date < previousStart || date >= end) continue;
    const recent = date >= start;
    const lines = Array.isArray(order.items) ? order.items.filter(item => item && catalog.has(item.productId) && Number.isFinite(item.totalUnits) && item.totalUnits > 0) : [];
    if (!lines.length) continue;
    if (recent) { result.recentOrderCount++; recentBuyers.add(order.entityId); }
    for (const item of lines) {
      const total = totals.get(item.productId) || { recent: 0, previous: 0, buyers: new Set<string>(), peers: new Set<string>(), peerUnits: 0, peerOrders: new Set<string>(), storeRecent: 0, storePrevious: 0 };
      if (recent) {
        total.recent += item.totalUnits;
        total.buyers.add(order.entityId);
        if (order.entityId === storeId) total.storeRecent += item.totalUnits;
        else { total.peers.add(order.entityId); total.peerUnits += item.totalUnits; total.peerOrders.add(order.id); }
      } else {
        total.previous += item.totalUnits;
        if (order.entityId === storeId) total.storePrevious += item.totalUnits;
      }
      totals.set(item.productId, total);
    }
  }
  result.recentStoreCount = recentBuyers.size;
  result.message = 'At least three delivered orders across two stores in the last 30 days are needed. Only your permitted records are compared.';
  if (result.recentOrderCount < 3 || recentBuyers.size < 2) return result;
  result.status = 'READY';
  result.confidence = result.recentOrderCount >= 10 && recentBuyers.size >= 5 ? 'HIGH' : result.recentOrderCount >= 5 && recentBuyers.size >= 3 ? 'MEDIUM' : 'LOW';
  result.trends = [...totals].filter(([, total]) => total.recent > 0).map(([productId, total]) => ({
    productId, productName: catalog.get(productId)!.name, recentUnits: total.recent, previousUnits: total.previous,
    growthPct: total.previous > 0 ? Math.round((total.recent - total.previous) / total.previous * 100) : null,
    purchasingStores: total.buyers.size, peerStores: total.peers.size, storeRecentUnits: total.storeRecent,
  })).sort((a, b) => b.recentUnits - a.recentUnits || a.productId.localeCompare(b.productId)).slice(0, 10);

  const latestStock = new Map<string, { quantity: number; date: number; saved: number }>();
  for (const count of stockCounts) {
    if (count.entityId !== storeId || count.entityType !== entityType) continue;
    const date = recordedDay(count.dateAd);
    if (!Number.isFinite(date) || date < end - 7 * DAY || date >= end) continue;
    const savedAt = Date.parse(count.createdAt);
    const saved = Number.isFinite(savedAt) ? savedAt : date;
    for (const item of Array.isArray(count.items) ? count.items : []) {
      if (!item) continue;
      const previous = latestStock.get(item.productId);
      if (!Number.isFinite(item.shelfQty) || item.shelfQty < 0 || previous && (previous.date > date || previous.date === date && previous.saved >= saved)) continue;
      latestStock.set(item.productId, { quantity: item.shelfQty, date, saved });
    }
  }

  const maxPeerUnits = Math.max(1, ...[...totals.values()].map(total => total.peerUnits));
  for (const [productId, total] of totals) {
    if (total.peers.size < 2 || total.peerOrders.size < 3) continue;
    const stock = latestStock.get(productId);
    const gap = total.storeRecent === 0 && total.storePrevious === 0 && !(stock && stock.quantity > 0);
    const zeroCount = stock?.quantity === 0;
    const lapsed = total.storeRecent === 0 && total.storePrevious > 0 && !(stock && stock.quantity > 0);
    if (!gap && !zeroCount && !lapsed) continue;
    const reach = total.peers.size / Math.max(1, result.peerStoreCount);
    const volume = total.peerUnits / maxPeerUnits;
    const momentum = total.previous > 0 ? Math.max(0, Math.min(1, (total.recent - total.previous) / total.previous)) : 0;
    const fit = gap || zeroCount ? 1 : 0.5;
    const score = Math.round(40 * reach + 25 * volume + 20 * momentum + 15 * fit);
    const evidence = `${total.peerUnits} delivered units across ${total.peers.size} other stores in this area in 30 days.`;
    result.opportunities.push({ productId, productName: catalog.get(productId)!.name, kind: gap && !zeroCount ? 'INTRODUCE' : 'REVIEW_REORDER', score,
      reason: `${evidence} ${zeroCount ? 'A shelf count in the last seven days recorded zero units here; check stock before reordering.' : gap ? 'No delivered purchase is recorded here in 60 days. Confirm the shelf and pitch a trial.' : 'This store bought it in the previous 30 days, but has no delivered purchase in the latest 30 days. Review replenishment.'}`,
    });
  }
  result.opportunities.sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));
  const best = result.opportunities.slice(0, 3);
  result.opportunityScore = best.length ? Math.round(best.reduce((sum, item) => sum + item.score, 0) / best.length) : 0;
  result.message = best.length ? 'Ranked sales prompts from recorded local demand. Confirm current shelf stock and price with the store before booking.' : 'No product gap or replenishment prompt meets the evidence rules for this store.';
  return result;
}
