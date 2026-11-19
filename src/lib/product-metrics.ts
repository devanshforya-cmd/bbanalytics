/**
 * Everything a product page or table shows about one product, worked out in one place.
 *
 * Rules:
 * - A product counts where it was sold on its own and inside combos (combo quantity × its part).
 * - Online (D2C) units come from orders that count as sales: not cancelled, not exchanges, not
 *   marketing sends. Free gifts are counted apart, never as units sold.
 * - Store (B2B) units come from store orders that were not cancelled. Chain branches are
 *   Modern Trade, independent retailers General Trade, as recorded on the order.
 * - Returns, reviews and delivery failures belong to a product only when they name it, or name a
 *   combo it is part of, or (failures) come from an order that held it. Never by brand alone.
 */
import type { Combo, DeliveryFailure, FeedbackEntry, Order, ReturnEntry, SecondaryOrder } from './types';
import { countsAsSale } from './order-status';
import { adToBs, NEPALI_MONTHS } from './nepali-calendar';

export interface ProductMetricsInput {
  orders: Order[];
  secondaryOrders: SecondaryOrder[];
  combos: Combo[];
  returns: ReturnEntry[];
  feedback: FeedbackEntry[];
  deliveryFailures?: DeliveryFailure[];
}

type ComboParts = Map<string, { productId: string; quantity: number }[]>;

export function comboParts(combos: Combo[]): ComboParts {
  return new Map(combos.map((combo) => [combo.id, (combo.items || []).map((item) => ({ productId: item.productId, quantity: item.quantity || 1 }))]));
}

/** Units of a product in a list of order lines: on its own and inside combos. */
export function unitsInLines(lines: { productId: string; quantity: number; isGift?: boolean }[], productId: string, parts: ComboParts): { direct: number; viaCombo: number; gift: number } {
  let direct = 0, viaCombo = 0, gift = 0;
  for (const line of lines) {
    const quantity = Number(line.quantity) || 0;
    if (line.productId === productId) { if (line.isGift) gift += quantity; else direct += quantity; continue; }
    const inside = parts.get(line.productId)?.find((part) => part.productId === productId);
    if (inside) { if (line.isGift) gift += quantity * inside.quantity; else viaCombo += quantity * inside.quantity; }
  }
  return { direct, viaCombo, gift };
}

function storeUnits(order: SecondaryOrder, productId: string): number {
  return (order.items || []).filter((item) => item.productId === productId).reduce((sum, item) => sum + (Number(item.totalUnits) || 0), 0);
}

/** Does this return, review or complaint concern the product (directly or as part of a combo)? */
function concerns(entry: { productId?: string; comboId?: string }, productId: string, parts: ComboParts): boolean {
  if (entry.productId === productId) return true;
  return !!entry.productId && !entry.comboId && !!parts.get(entry.productId)?.some((part) => part.productId === productId);
}

/** Units of the product a return covers: a whole combo returned brings back each part. */
function returnUnits(entry: ReturnEntry, productId: string, parts: ComboParts): number {
  const quantity = Number(entry.quantity) || 1;
  if (entry.productId === productId) return quantity;
  const inside = parts.get(entry.productId)?.find((part) => part.productId === productId);
  return inside ? quantity * inside.quantity : 0;
}

export interface ProductMetrics {
  d2c: { units: number; directUnits: number; comboUnits: number; giftUnits: number; orders: number };
  b2b: { units: number; gtUnits: number; mtUnits: number; orders: number; storeIds: Set<string> };
  totalUnits: number;
  returns: { entries: ReturnEntry[]; units: number; returnedUnits: number; exchangedUnits: number; refundedUnits: number; pendingUnits: number; rejectedUnits: number; ratePct: number };
  /** Replacement units sent out on exchange orders. */
  exchangeUnitsSent: number;
  feedback: { entries: FeedbackEntry[]; reviews: number; complaints: number; positive: number; negative: number; topIssue: string | null };
  failures: { entries: DeliveryFailure[]; ratePct: number };
}

export function productMetrics(productId: string, input: ProductMetricsInput): ProductMetrics {
  const parts = comboParts(input.combos);

  let directUnits = 0, comboUnits = 0, giftUnits = 0, d2cOrders = 0, exchangeUnitsSent = 0;
  const orderIdsWithProduct = new Set<string>();
  for (const order of input.orders) {
    const units = unitsInLines(order.items || [], productId, parts);
    if (!units.direct && !units.viaCombo && !units.gift) continue;
    // A failed delivery belongs to the product whatever happened to the order afterwards.
    if (units.direct || units.viaCombo) orderIdsWithProduct.add(order.id);
    if (order.exchangeRequested || order.exchangeReturnId) { if (order.status !== 'CANCELLED') exchangeUnitsSent += units.direct + units.viaCombo; continue; }
    if (!countsAsSale(order)) continue;
    directUnits += units.direct; comboUnits += units.viaCombo; giftUnits += units.gift;
    if (units.direct || units.viaCombo) d2cOrders += 1;
  }

  let gtUnits = 0, mtUnits = 0, b2bOrders = 0;
  const storeIds = new Set<string>();
  for (const order of input.secondaryOrders) {
    if (order.status === 'CANCELLED') continue;
    const units = storeUnits(order, productId);
    if (!units) continue;
    b2bOrders += 1;
    storeIds.add(order.entityId || order.storeName);
    if (order.entityType === 'BRANCH') mtUnits += units; else gtUnits += units;
  }

  const d2cUnits = directUnits + comboUnits;
  const b2bUnits = gtUnits + mtUnits;
  const totalUnits = d2cUnits + b2bUnits;

  const returnEntries = input.returns.filter((entry) => concerns(entry, productId, parts));
  const byStatus = (status: ReturnEntry['orderStatus']) => returnEntries.filter((entry) => entry.orderStatus === status).reduce((sum, entry) => sum + returnUnits(entry, productId, parts), 0);
  const returned = byStatus('Returned'), exchanged = byStatus('Exchanged'), refunded = byStatus('Refunded'), pending = byStatus('Pending'), rejected = byStatus('Rejected');
  // Rejected claims were not taken back, so they do not count towards the return rate.
  const takenBack = returned + exchanged + refunded + pending;

  const feedbackEntries = input.feedback.filter((entry) => concerns(entry, productId, parts));
  const issues = new Map<string, number>();
  for (const entry of [...feedbackEntries, ...returnEntries]) for (const issue of entry.issueCategories || []) issues.set(issue, (issues.get(issue) || 0) + 1);
  const topIssue = [...issues.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const failureEntries = (input.deliveryFailures || []).filter((failure) => orderIdsWithProduct.has(failure.orderId));

  return {
    d2c: { units: d2cUnits, directUnits, comboUnits, giftUnits, orders: d2cOrders },
    b2b: { units: b2bUnits, gtUnits, mtUnits, orders: b2bOrders, storeIds },
    totalUnits,
    returns: { entries: returnEntries, units: takenBack, returnedUnits: returned, exchangedUnits: exchanged, refundedUnits: refunded, pendingUnits: pending, rejectedUnits: rejected,
      ratePct: d2cUnits > 0 ? Math.round((takenBack / d2cUnits) * 1000) / 10 : 0 },
    exchangeUnitsSent,
    feedback: { entries: feedbackEntries, reviews: feedbackEntries.filter((entry) => entry.type !== 'COMPLAINT').length, complaints: feedbackEntries.filter((entry) => entry.type === 'COMPLAINT').length,
      positive: feedbackEntries.filter((entry) => entry.sentiment === 'POSITIVE').length, negative: feedbackEntries.filter((entry) => entry.sentiment === 'NEGATIVE').length, topIssue },
    failures: { entries: failureEntries, ratePct: d2cOrders > 0 ? Math.round((failureEntries.length / d2cOrders) * 1000) / 10 : 0 },
  };
}

export type CalendarMode = 'BS' | 'AD';
export interface MonthPoint { key: string; label: string; longLabel: string; d2c: number; b2b: number; returned: number; current: boolean }

const AD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthKey(dateAd: string, mode: CalendarMode): { key: string; label: string; longLabel: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateAd || '')) return null;
  if (mode === 'AD') {
    const [year, month] = dateAd.slice(0, 7).split('-').map(Number);
    return { key: `${year}-${String(month).padStart(2, '0')}`, label: AD_MONTHS[month - 1], longLabel: `${AD_MONTHS[month - 1]} ${year}` };
  }
  try {
    const bs = adToBs(`${dateAd.slice(0, 10)}T12:00:00`);
    const name = NEPALI_MONTHS[bs.month - 1]?.en || String(bs.month);
    return { key: `${bs.year}-${String(bs.month).padStart(2, '0')}`, label: name.slice(0, 3), longLabel: `${name} ${bs.year}` };
  } catch { return null; }
}

/** The last `count` months (BS or AD), oldest first, ending with the current month. */
function lastMonths(todayAd: string, mode: CalendarMode, count: number): { key: string; label: string; longLabel: string }[] {
  const result: { key: string; label: string; longLabel: string }[] = [];
  const seen = new Set<string>();
  const day = new Date(`${todayAd}T12:00:00Z`);
  // Step back a week at a time and collect distinct months; BS months do not line up with AD ones.
  for (let back = 0; result.length < count && back < count * 6 + 6; back += 1) {
    const date = new Date(day.getTime() - back * 7 * 86400000).toISOString().slice(0, 10);
    const month = monthKey(date, mode);
    if (month && !seen.has(month.key)) { seen.add(month.key); result.unshift(month); }
  }
  return result.slice(-count);
}

/** Units sold per month, online and in stores, plus units returned, in BS or AD months. */
export function productMonthlyTrend(productId: string, input: ProductMetricsInput, options: { mode: CalendarMode; todayAd: string; months?: number }): MonthPoint[] {
  const parts = comboParts(input.combos);
  const months = lastMonths(options.todayAd, options.mode, options.months ?? 12);
  const current = monthKey(options.todayAd, options.mode)?.key;
  const points = new Map(months.map((month) => [month.key, { ...month, d2c: 0, b2b: 0, returned: 0, current: month.key === current }]));
  for (const order of input.orders) {
    if (!countsAsSale(order)) continue;
    const point = points.get(monthKey(order.orderDateAd, options.mode)?.key || '');
    if (!point) continue;
    const units = unitsInLines(order.items || [], productId, parts);
    point.d2c += units.direct + units.viaCombo;
  }
  for (const order of input.secondaryOrders) {
    if (order.status === 'CANCELLED') continue;
    const point = points.get(monthKey(order.orderDateAd, options.mode)?.key || '');
    if (point) point.b2b += storeUnits(order, productId);
  }
  for (const entry of input.returns) {
    if (!concerns(entry, productId, parts) || entry.orderStatus === 'Rejected') continue;
    const point = points.get(monthKey(entry.dateAd, options.mode)?.key || '');
    if (point) point.returned += returnUnits(entry, productId, parts);
  }
  return [...points.values()];
}

// ---------------------------------------------------------------------------------------------
// Combos. A combo is sold online only. A return, review or failure belongs to a combo when it
// names the combo, names one of its products with the combo recorded (comboId), or comes from an
// order that held the combo and names one of its products.
// ---------------------------------------------------------------------------------------------

export interface ComboMetrics {
  kits: number;
  giftKits: number;
  orders: Order[];
  revenue: number;
  buyers: number;
  repeatBuyers: number;
  exchangeKitsSent: number;
  returns: {
    entries: ReturnEntry[];
    /** Whole kits taken back (returned, exchanged, refunded or pending). */
    wholeKits: number;
    /** Single products from a kit taken back, by product. */
    partUnits: { productId: string; productName: string; units: number }[];
    returned: number; exchanged: number; refunded: number; pending: number; rejected: number;
    ratePct: number;
  };
  feedback: { entries: FeedbackEntry[]; reviews: number; complaints: number; positive: number; negative: number; topIssue: string | null };
  failures: { entries: DeliveryFailure[]; ratePct: number };
  platforms: { name: string; kits: number }[];
  provinces: { name: string; kits: number }[];
  boughtWith: { productId: string; name: string; orders: number }[];
  components: { productId: string; productName: string; perKit: number; unitsViaCombo: number; productUnitsOnline: number; sharePct: number }[];
  avgKitPrice: number;
}

export function comboMetrics(comboId: string, input: ProductMetricsInput & { names?: Map<string, string> }): ComboMetrics {
  const combo = input.combos.find((entry) => entry.id === comboId);
  const parts = combo?.items || [];
  const partIds = new Set(parts.map((part) => part.productId));

  let kits = 0, giftKits = 0, revenue = 0, exchangeKitsSent = 0;
  const saleOrders: Order[] = [];
  const allOrderIds = new Set<string>();
  const buyerCounts = new Map<string, number>();
  const platforms = new Map<string, number>(), provinces = new Map<string, number>();
  const withCounts = new Map<string, number>();
  for (const order of input.orders) {
    const lines = (order.items || []).filter((line) => line.productId === comboId);
    if (!lines.length) continue;
    allOrderIds.add(order.id);
    const paid = lines.filter((line) => !line.isGift).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    if (order.exchangeRequested || order.exchangeReturnId) { if (order.status !== 'CANCELLED') exchangeKitsSent += paid; continue; }
    if (!countsAsSale(order)) continue;
    giftKits += lines.filter((line) => line.isGift).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    if (!paid) continue;
    kits += paid;
    revenue += lines.filter((line) => !line.isGift).reduce((sum, line) => sum + (Number(line.totalPrice) || (Number(line.unitPrice) || 0) * (Number(line.quantity) || 0)), 0);
    saleOrders.push(order);
    if (order.customerPhone) buyerCounts.set(order.customerPhone, (buyerCounts.get(order.customerPhone) || 0) + 1);
    platforms.set(order.platform || 'Not recorded', (platforms.get(order.platform || 'Not recorded') || 0) + paid);
    provinces.set(order.province || 'Not recorded', (provinces.get(order.province || 'Not recorded') || 0) + paid);
    for (const id of new Set((order.items || []).filter((line) => line.productId !== comboId && !line.isGift).map((line) => line.productId))) withCounts.set(id, (withCounts.get(id) || 0) + 1);
  }

  const fromComboOrder = (entry: { orderId?: string; productId?: string }) => !!entry.orderId && allOrderIds.has(entry.orderId) && (!entry.productId || partIds.has(entry.productId));
  const returnEntries = input.returns.filter((entry) => entry.productId === comboId || entry.comboId === comboId || (!entry.comboId && fromComboOrder(entry)));
  let wholeKits = 0;
  const partMap = new Map<string, { productId: string; productName: string; units: number }>();
  const counts = { returned: 0, exchanged: 0, refunded: 0, pending: 0, rejected: 0 };
  for (const entry of returnEntries) {
    const quantity = Number(entry.quantity) || 1;
    const key = ({ Returned: 'returned', Exchanged: 'exchanged', Refunded: 'refunded', Pending: 'pending', Rejected: 'rejected' } as const)[entry.orderStatus];
    if (key) counts[key] += quantity;
    if (entry.orderStatus === 'Rejected') continue;
    if (entry.productId === comboId) wholeKits += quantity;
    else {
      const part = partMap.get(entry.productId) || { productId: entry.productId, productName: entry.productName, units: 0 };
      part.units += quantity;
      partMap.set(entry.productId, part);
    }
  }

  const feedbackEntries = input.feedback.filter((entry) => entry.productId === comboId || fromComboOrder(entry));
  const issues = new Map<string, number>();
  for (const entry of [...feedbackEntries, ...returnEntries]) for (const issue of entry.issueCategories || []) issues.set(issue, (issues.get(issue) || 0) + 1);

  const saleIds = new Set(saleOrders.map((order) => order.id));
  const failureEntries = (input.deliveryFailures || []).filter((failure) => allOrderIds.has(failure.orderId));
  const failedSales = failureEntries.filter((failure) => saleIds.has(failure.orderId)).length;

  const sorted = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, kits: value }));
  const components = parts.map((part) => {
    const product = productMetrics(part.productId, input);
    const unitsViaCombo = kits * (part.quantity || 1);
    return { productId: part.productId, productName: part.productName, perKit: part.quantity || 1, unitsViaCombo, productUnitsOnline: product.d2c.units,
      sharePct: product.d2c.units > 0 ? Math.round((unitsViaCombo / product.d2c.units) * 100) : 0 };
  });
  const takenBack = wholeKits;

  return {
    kits, giftKits, orders: saleOrders, revenue,
    buyers: buyerCounts.size, repeatBuyers: [...buyerCounts.values()].filter((count) => count > 1).length,
    exchangeKitsSent,
    returns: { entries: returnEntries, wholeKits, partUnits: [...partMap.values()].sort((a, b) => b.units - a.units), ...counts,
      ratePct: kits > 0 ? Math.round((takenBack / kits) * 1000) / 10 : 0 },
    feedback: { entries: feedbackEntries, reviews: feedbackEntries.filter((entry) => entry.type !== 'COMPLAINT').length, complaints: feedbackEntries.filter((entry) => entry.type === 'COMPLAINT').length,
      positive: feedbackEntries.filter((entry) => entry.sentiment === 'POSITIVE').length, negative: feedbackEntries.filter((entry) => entry.sentiment === 'NEGATIVE').length,
      topIssue: [...issues.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null },
    failures: { entries: failureEntries, ratePct: saleOrders.length ? Math.round((failedSales / saleOrders.length) * 1000) / 10 : 0 },
    platforms: sorted(platforms), provinces: sorted(provinces),
    boughtWith: [...withCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([productId, orders]) => ({ productId, name: input.names?.get(productId) || productId, orders })),
    components,
    avgKitPrice: kits > 0 ? Math.round(revenue / kits) : 0,
  };
}

/** Kits sold per month (BS or AD) and kits or parts taken back, oldest first. */
export function comboMonthlyTrend(comboId: string, input: ProductMetricsInput, options: { mode: CalendarMode; todayAd: string; months?: number }): MonthPoint[] {
  const months = lastMonths(options.todayAd, options.mode, options.months ?? 12);
  const current = monthKey(options.todayAd, options.mode)?.key;
  const points = new Map(months.map((month) => [month.key, { ...month, d2c: 0, b2b: 0, returned: 0, current: month.key === current }]));
  const comboOrderIds = new Set<string>();
  for (const order of input.orders) {
    const lines = (order.items || []).filter((line) => line.productId === comboId);
    if (!lines.length) continue;
    comboOrderIds.add(order.id);
    if (!countsAsSale(order)) continue;
    const point = points.get(monthKey(order.orderDateAd, options.mode)?.key || '');
    if (point) point.d2c += lines.filter((line) => !line.isGift).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  }
  const partIds = new Set(input.combos.find((entry) => entry.id === comboId)?.items.map((item) => item.productId) || []);
  for (const entry of input.returns) {
    const mine = entry.productId === comboId || entry.comboId === comboId || (!entry.comboId && !!entry.orderId && comboOrderIds.has(entry.orderId) && partIds.has(entry.productId));
    if (!mine || entry.orderStatus === 'Rejected') continue;
    const point = points.get(monthKey(entry.dateAd, options.mode)?.key || '');
    if (point) point.returned += Number(entry.quantity) || 1;
  }
  return [...points.values()];
}
