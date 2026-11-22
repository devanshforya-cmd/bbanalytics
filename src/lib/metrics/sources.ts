/**
 * The records every metric is counted from, and the ways each can be split ("dimensions").
 * One place decides what a sale is, who a new customer is, which store type a branch has, and so on,
 * so the same question gets the same answer on every page and dashboard.
 */
import type {
  Brand, CallLog, Cheque, Customer, CustomerCall, DeliveryFailure, Dispatch, FeedbackEntry, MarketingSend, Order, OrderItem, Product,
  ReturnEntry, SecondaryOrder, SecondaryOrderItem, StockCount, StockCountItem, Task, User, Visit, BeatItem, Distributor, Branch, Retailer,
} from '../types';
import { countsAsSale, ORDER_STATUS_LABEL } from '../order-status';
import { phoneDigits } from '../customer-lookup';
import { lineMoney } from '../monthly-sales-report';
import { channelLabel, channelOfDistributor, channelOfRetailer } from '../store-channels';
import { dispatchStatus, statusLabel } from '../dispatch-flow';
import { lineSubBrandId, subBrandName } from '../sub-brands';
import { buildFollowUps, outcomeInfo, type FollowUpItem } from '../follow-ups';
import type { FollowUpPlan } from '../types';
import { addDaysAd, daysBetweenAd } from './dates';

export interface Group { key: string; label: string }

/** Everything the metrics read, gathered once per screen. */
export interface MetricData {
  today: string;
  brands: Brand[]; users: User[]; products: Product[];
  orders: Order[]; deliveryFailures: DeliveryFailure[]; returns: ReturnEntry[]; feedback: FeedbackEntry[]; customers: Customer[];
  customerCalls: CustomerCall[]; followUpPlan: FollowUpPlan;
  storeOrders: SecondaryOrder[]; dispatches: Dispatch[]; cheques: Cheque[]; visits: Visit[]; beatItems: BeatItem[];
  stockCounts: StockCount[]; storeCalls: CallLog[]; tasks: Task[]; marketingSends: MarketingSend[];
  distributors: Distributor[]; branches: Branch[]; retailers: Retailer[];
}

interface StoreInfo { id: string; name: string; type: string; area: string; city: string; officerId?: string; distributorId?: string; distributorName?: string }

/** Lookups worked out once from MetricData. */
export interface Prepared {
  data: MetricData;
  userName: (id?: string) => string;
  brandName: (code?: string) => string;
  store: (id?: string) => StoreInfo | undefined;
  stores: StoreInfo[];
  /** Order id → whether it is the customer's first real purchase, and days since their previous one. */
  orderHistory: Map<string, { first: boolean; gapDays?: number }>;
  lastStoreOrder: Map<string, string>;
  followUps: FollowUpItem[];
  latestStock: { count: StockCount; item: StockCountItem }[];
}

/**
 * A customer's first real purchase makes them new; every later one is a repeat (matched by phone number).
 * The same rule is used on every page, instead of the NEW/REPEAT tag typed in at order entry.
 */
export function orderHistoryOf(list: Order[]): Map<string, { first: boolean; gapDays?: number }> {
  const history = new Map<string, { first: boolean; gapDays?: number }>();
  const byPhone = new Map<string, Order[]>();
  for (const order of list) {
    if (!countsAsSale(order)) continue;
    const phone = phoneDigits(order.customerPhone) || `name:${order.customerName}`;
    const group = byPhone.get(phone);
    if (group) group.push(order); else byPhone.set(phone, [order]);
  }
  for (const group of byPhone.values()) {
    group.sort((a, b) => (a.orderDateAd + (a.orderTime || '') + a.createdAt).localeCompare(b.orderDateAd + (b.orderTime || '') + b.createdAt));
    group.forEach((order, index) => history.set(order.id, { first: index === 0, gapDays: index ? daysBetweenAd(group[index - 1].orderDateAd, order.orderDateAd) : undefined }));
  }
  return history;
}

export function prepare(data: MetricData): Prepared {
  const users = new Map(data.users.map((u) => [u.id, u.fullName]));
  const brands = new Map(data.brands.map((b) => [b.code.toUpperCase(), b.name]));
  const chains = new Map(data.distributors.map((d) => [d.id, d]));
  const stores: StoreInfo[] = [
    ...data.distributors.map((d) => ({ id: d.id, name: d.name, type: channelOfDistributor(d), area: d.province || d.city || '', city: d.city || '', distributorId: d.parentDistributorId, distributorName: d.parentDistributorName })),
    ...data.branches.map((b) => ({ id: b.id, name: b.name, type: chains.get(b.distributorId) ? channelOfDistributor(chains.get(b.distributorId)!) : 'CHAIN_STORE', area: b.area || b.city || '', city: b.city || '', officerId: b.assignedOfficerId, distributorId: b.distributorId, distributorName: b.distributorName })),
    ...data.retailers.map((r) => ({ id: r.id, name: r.name, type: channelOfRetailer(r), area: r.area || r.city || '', city: r.city || '', officerId: r.assignedOfficerId, distributorId: r.distributorId, distributorName: r.distributorName })),
  ];
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  const orderHistory = orderHistoryOf(data.orders);

  const lastStoreOrder = new Map<string, string>();
  for (const order of data.storeOrders) {
    if (order.status === 'CANCELLED') continue;
    if ((lastStoreOrder.get(order.entityId) || '') < order.orderDateAd) lastStoreOrder.set(order.entityId, order.orderDateAd);
  }

  const latest = new Map<string, { count: StockCount; item: StockCountItem }>();
  for (const count of data.stockCounts) for (const item of count.items || []) {
    const key = `${count.entityId}:${item.productId}`;
    const seen = latest.get(key);
    if (!seen || seen.count.dateAd < count.dateAd || (seen.count.dateAd === count.dateAd && seen.count.createdAt < count.createdAt)) latest.set(key, { count, item });
  }

  return {
    data,
    userName: (id) => (id && users.get(id)) || 'Not assigned',
    brandName: (code) => (code && brands.get(code.toUpperCase())) || code || 'No brand',
    store: (id) => (id ? storeMap.get(id) : undefined),
    stores,
    orderHistory,
    lastStoreOrder,
    followUps: buildFollowUps(data.orders, data.customerCalls, data.followUpPlan, data.today),
    latestStock: [...latest.values()],
  };
}

export type DimensionKey =
  | 'brand' | 'subBrand' | 'product' | 'channel' | 'province' | 'district' | 'city' | 'area' | 'staff' | 'payment' | 'status'
  | 'customerType' | 'courier' | 'orderSource' | 'weekday' | 'hour' | 'orderSize' | 'reason' | 'category' | 'sentiment' | 'rating'
  | 'outcome' | 'purpose' | 'step' | 'storeType' | 'store' | 'distributor' | 'skipReason' | 'priority' | 'segment' | 'influencer'
  | 'fulfiller' | 'aging' | 'bank' | 'type' | 'offer';

export const DIMENSIONS: Record<DimensionKey, string> = {
  brand: 'Brand', subBrand: 'Sub-brand', product: 'Product', channel: 'Channel', province: 'Province', district: 'District', city: 'City',
  area: 'Area', staff: 'Staff member', payment: 'Payment', status: 'Status', customerType: 'New or repeat customer', courier: 'Courier',
  orderSource: 'Entered through', weekday: 'Day of week', hour: 'Hour of day', orderSize: 'Order size', reason: 'Reason', category: 'Issue category',
  sentiment: 'Sentiment', rating: 'Rating', outcome: 'Outcome', purpose: 'Call about', step: 'Follow-up call', storeType: 'Store type',
  store: 'Store', distributor: 'Distributor / chain', skipReason: 'Skip reason', priority: 'Priority', segment: 'Customer segment',
  influencer: 'Influencer', fulfiller: 'Supplied by', aging: 'How late', bank: 'Bank', type: 'Type', offer: 'Offer used',
};

type Accessor<T> = (row: T, p: Prepared) => Group | Group[] | null;
export interface RecordLine { id: string; date: string; title: string; detail: string; amount?: number; href?: string }

export interface SourceDef<T = any> {
  key: string;
  /** What one row is, for "the records behind this number". */
  noun: string;
  rows: (p: Prepared) => T[];
  /** The AD date the row belongs to. Rows without one are left out of dated metrics. */
  date?: (row: T, p: Prepared) => string | undefined;
  dims: Partial<Record<DimensionKey, Accessor<T>>>;
  describe: (row: T, p: Prepared) => RecordLine;
  /** Money shown per row needs Money access. */
  money?: boolean;
}

const g = (key: string | undefined | null, label?: string): Group | null => (key ? { key, label: label || key } : null);
const text = (value: string | undefined | null, fallback = 'Not set') => g(value?.trim() || fallback);
const staff = (id: string | undefined, p: Prepared, name?: string) => g(id || 'none', id ? (p.data.users.length ? p.userName(id) : name || id) : 'Not assigned');
const brand = (code: string | undefined, p: Prepared) => g(code?.toUpperCase() || 'NONE', p.brandName(code));
const weekday = (ad: string) => { const d = new Date(`${ad}T12:00:00Z`).getUTCDay(); return g(String(d), ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]); };
const storeGroup = (id: string | undefined, p: Prepared, name?: string) => g(id || 'none', p.store(id)?.name || name || 'Unknown store');
const storeType = (id: string | undefined, p: Prepared) => { const type = p.store(id)?.type; return g(type || 'UNKNOWN', type ? channelLabel(type) : 'Unknown'); };
const area = (id: string | undefined, p: Prepared) => text(p.store(id)?.area, 'No area');
const distributor = (id: string | undefined, p: Prepared) => { const s = p.store(id); return g(s?.distributorId || 'none', s?.distributorName || 'No distributor'); };
const paymentGroup = (terms?: string) => { const t = (terms || '').toLowerCase(); return g(t.includes('cod') ? 'COD' : t.includes('prepaid') || t.includes('advance') ? 'Prepaid' : t.includes('credit') ? 'Credit' : 'Other', t.includes('cod') ? 'Cash on delivery' : t.includes('prepaid') || t.includes('advance') ? 'Prepaid' : t.includes('credit') ? 'Credit' : 'Other'); };
const sourceGroup = (source?: string) => { const s = (source || '').toLowerCase(); return g(s.includes('extract') || s.includes('whatsapp') ? 'EXTRACTOR' : s.includes('field') ? 'FIELD' : 'MANUAL', s.includes('extract') || s.includes('whatsapp') ? 'WhatsApp extractor' : s.includes('field') ? 'Field call' : 'Typed in'); };
const sizeGroup = (amount: number) => amount <= 0 ? g('hidden', 'Not known') : amount < 1000 ? g('a', 'Under NPR 1,000') : amount < 2000 ? g('b', 'NPR 1,000–1,999') : amount < 3000 ? g('c', 'NPR 2,000–2,999') : amount < 5000 ? g('d', 'NPR 3,000–4,999') : g('e', 'NPR 5,000 and over');
const hourGroup = (time?: string) => { const h = /^(\d{1,2}):/.exec(time || '')?.[1]; if (h === undefined) return g('none', 'Time not recorded'); const n = Number(h); return g(String(n).padStart(2, '0'), `${n % 12 || 12} ${n < 12 ? 'am' : 'pm'}`); };
const customerType = (order: Order, p: Prepared) => { const h = p.orderHistory.get(order.id); return h ? (h.first ? g('NEW', 'New customer') : g('REPEAT', 'Repeat customer')) : g('NONE', 'Not a sale'); };
const orderLine = (order: Order) => `${order.items.filter((i) => !i.isGift).slice(0, 2).map((i) => `${i.quantity}× ${i.productName}`).join(', ')}${order.items.length > 2 ? ' and more' : ''}`;

export type OrderLineRow = { order: Order; item: OrderItem; index: number };
export type StoreLineRow = { order: SecondaryOrder; item: SecondaryOrderItem; index: number };
export type StockLineRow = { count: StockCount; item: StockCountItem; index: number };

const orders: SourceDef<Order> = {
  key: 'orders', noun: 'orders', money: true,
  rows: (p) => p.data.orders.filter((o) => !o.isMarketing),
  date: (o) => o.orderDateAd,
  dims: {
    brand: (o, p) => brand(o.brandCode, p), channel: (o) => text(o.platform), province: (o) => text(o.province), district: (o) => text(o.district),
    staff: (o, p) => staff(o.assignedToId, p, o.assignedToName), payment: (o) => paymentGroup(o.paymentTerms), status: (o) => g(o.status, ORDER_STATUS_LABEL[o.status]),
    customerType, courier: (o) => text(o.deliveryMethod), orderSource: (o) => sourceGroup(o.source), weekday: (o) => weekday(o.orderDateAd),
    hour: (o) => hourGroup(o.orderTime), orderSize: (o) => sizeGroup(o.totalAmount), offer: (o) => (o.appliedOffers?.length ? g('yes', 'With an offer') : g('no', 'No offer')),
  },
  describe: (o) => ({ id: o.id, date: o.orderDateAd, title: `${o.orderNumber} · ${o.customerName}`, detail: `${orderLine(o)} · ${ORDER_STATUS_LABEL[o.status]}`, amount: o.totalAmount, href: `/orderflow/orders/${encodeURIComponent(o.id)}` }),
};

const orderLines: SourceDef<OrderLineRow> = {
  key: 'orderLines', noun: 'order lines', money: true,
  rows: (p) => p.data.orders.filter(countsAsSale).flatMap((order) => order.items.map((item, index) => ({ order, item, index }))).filter((r) => !r.item.isGift),
  date: (r) => r.order.orderDateAd,
  dims: {
    brand: (r, p) => brand(r.item.brandCode || r.order.brandCode, p),
    subBrand: (r, p) => { const id = lineSubBrandId(r.item, p.data.products); return g(id || 'none', id ? subBrandName(p.data.brands, id) : 'No sub-brand'); },
    product: (r) => g(r.item.productId || r.item.productName, r.item.productName), channel: (r) => text(r.order.platform), province: (r) => text(r.order.province),
    district: (r) => text(r.order.district), staff: (r, p) => staff(r.order.assignedToId, p, r.order.assignedToName), customerType: (r, p) => customerType(r.order, p),
    payment: (r) => paymentGroup(r.order.paymentTerms),
  },
  describe: (r) => ({ id: `${r.order.id}:${r.index}`, date: r.order.orderDateAd, title: `${r.order.orderNumber} · ${r.item.productName}`, detail: `${r.item.quantity} units · ${r.order.customerName}`, amount: r.item.totalPrice, href: `/orderflow/orders/${encodeURIComponent(r.order.id)}` }),
};

const deliveryFailures: SourceDef<DeliveryFailure> = {
  key: 'deliveryFailures', noun: 'failed deliveries',
  rows: (p) => p.data.deliveryFailures, date: (f) => f.dateAd,
  dims: { brand: (f, p) => brand(f.brandCode, p), reason: (f) => text(f.reason), courier: (f) => text(f.deliveryMethod), district: (f) => text(f.district), channel: (f) => text(f.platform), status: (f) => text(f.status, 'Failed') },
  describe: (f) => ({ id: f.id, date: f.dateAd, title: `${f.orderNumber} · ${f.customerName}`, detail: `${f.reason}${f.reasonDetail ? `: ${f.reasonDetail}` : ''}`, href: '/orderflow/delivery-failures' }),
};

const returns: SourceDef<ReturnEntry> = {
  key: 'returns', noun: 'returns',
  rows: (p) => p.data.returns, date: (r) => r.dateAd,
  dims: { brand: (r, p) => brand(r.brandCode, p), product: (r) => g(r.productId || r.productName, r.productName), reason: (r) => text(r.reasonCategory), outcome: (r) => text(r.orderStatus), channel: (r) => text(r.platform), category: (r) => (r.issueCategories?.length ? r.issueCategories.map((c) => g(c)!) : g('none', 'No category')) },
  describe: (r) => ({ id: r.id, date: r.dateAd, title: `${r.productName} · ${r.customerName}`, detail: `${r.quantity} units · ${r.reasonCategory} · ${r.orderStatus}`, href: '/reviews/returns' }),
};

const feedback: SourceDef<FeedbackEntry> = {
  key: 'feedback', noun: 'feedback entries',
  rows: (p) => p.data.feedback, date: (f) => f.dateReceivedAd,
  dims: {
    brand: (f, p) => brand(f.brandCode, p), product: (f) => g(f.productId || f.productName || 'none', f.productName || 'No product'), type: (f) => g(f.type, f.type === 'COMPLAINT' ? 'Complaint' : f.type === 'REVIEW' ? 'Review' : 'Feedback'),
    sentiment: (f) => g(f.sentiment, f.sentiment === 'POSITIVE' ? 'Positive' : f.sentiment === 'NEGATIVE' ? 'Negative' : 'Neutral'), category: (f) => (f.issueCategories?.length ? f.issueCategories.map((c) => g(c)!) : g('none', 'No category')),
    channel: (f) => text(f.channel), status: (f) => text(f.complaintStatus, f.type === 'COMPLAINT' ? 'Open' : 'Not a complaint'), staff: (f, p) => staff(f.assignedTo, p, f.assignedToName),
    rating: (f) => (f.rating ? g(String(f.rating), `${f.rating} star${f.rating === 1 ? '' : 's'}`) : g('none', 'No rating')),
  },
  describe: (f) => ({ id: f.id, date: f.dateReceivedAd, title: `${f.customerName || 'Customer'} · ${f.productName || f.brandCode}`, detail: f.fullText.slice(0, 120), href: '/reviews/feedback' }),
};

const customers: SourceDef<Customer> = {
  key: 'customers', noun: 'customers',
  rows: (p) => p.data.customers, date: (c) => c.firstOrderDate?.slice(0, 10),
  dims: { segment: (c) => text(c.segment), province: (c) => text(c.province), city: (c) => text(c.city), brand: (c, p) => (c.brandsPurchased?.length ? c.brandsPurchased.map((b) => brand(b, p)!) : g('NONE', 'No brand')) },
  describe: (c) => ({ id: c.id, date: c.lastOrderDate?.slice(0, 10) || '', title: `${c.name} · ${c.phone}`, detail: `${c.totalOrders} orders · ${c.segment}`, href: `/customers/${encodeURIComponent(c.phone)}` }),
};

const customerCalls: SourceDef<CustomerCall> = {
  key: 'customerCalls', noun: 'customer calls',
  rows: (p) => p.data.customerCalls, date: (c) => c.dateAd,
  dims: { outcome: (c) => g(c.outcome, outcomeInfo(c.outcome)?.label), purpose: (c) => text(c.purpose), staff: (c, p) => staff(c.officerId, p, c.officerName), brand: (c, p) => brand(c.brandCode, p), step: (c) => text(c.followUpStepLabel, 'Not a follow-up') },
  describe: (c) => ({ id: c.id, date: c.dateAd, title: `${c.customerName} · ${c.purpose}`, detail: `${outcomeInfo(c.outcome)?.label || c.outcome} · ${c.officerName}${c.notes ? ` · ${c.notes}` : ''}`, href: '/orderflow/customer-calls' }),
};

const FOLLOW_UP_STATUS: Record<string, string> = { DUE: 'Due', UPCOMING: 'Coming up', QUEUED: 'Waiting for an earlier call', WAITING_DELIVERY: 'Waiting for delivery', DONE: 'Done', NOT_REACHED: 'Not reached', STOPPED: 'Stopped' };
const followUps: SourceDef<FollowUpItem> = {
  key: 'followUps', noun: 'follow-up calls',
  rows: (p) => p.followUps, date: (f) => (f.status === 'DONE' ? f.lastCall?.dateAd : f.dueAd || undefined) || undefined,
  dims: { status: (f) => g(f.status, FOLLOW_UP_STATUS[f.status]), step: (f) => g(f.step.id, f.step.label), brand: (f, p) => brand(f.order.brandCode, p), staff: (f, p) => staff(f.lastCall?.officerId, p, f.lastCall?.officerName) },
  describe: (f) => ({ id: f.key, date: f.dueAd || f.plannedAd || '', title: `${f.order.customerName} · ${f.step.label}`, detail: `${f.order.orderNumber} · ${FOLLOW_UP_STATUS[f.status]}${f.tries ? ` · tried ${f.tries}×` : ''}`, href: '/orderflow/follow-ups' }),
};

const storeOrderDims: SourceDef<SecondaryOrder>['dims'] = {
  store: (o, p) => storeGroup(o.entityId, p, o.storeName), storeType: (o, p) => storeType(o.entityId, p), area: (o, p) => area(o.entityId, p),
  distributor: (o, p) => distributor(o.entityId, p), staff: (o, p) => staff(o.officerId, p, o.officerName),
  status: (o) => g(o.status, o.status === 'PENDING_DISPATCH' ? 'Order received' : o.status === 'DISPATCHED' ? 'Dispatched' : o.status === 'DELIVERED' ? 'Delivered' : 'Cancelled'),
  brand: (o, p) => { const codes = [...new Set(o.items.map((i) => i.brandCode).filter(Boolean))]; return codes.length ? codes.map((c) => brand(c, p)!) : g('NONE', 'No brand'); },
  payment: (o) => text(o.paymentTerms, 'No terms'),
};
const storeOrders: SourceDef<SecondaryOrder> = {
  key: 'storeOrders', noun: 'store orders', money: true,
  rows: (p) => p.data.storeOrders, date: (o) => o.orderDateAd, dims: storeOrderDims,
  describe: (o) => ({ id: o.id, date: o.orderDateAd, title: `${o.orderNumber} · ${o.storeName}`, detail: `${o.totalUnits} units · ${o.officerName}`, amount: o.totalAmount, href: `/offline-sales/dispatch?q=${encodeURIComponent(o.orderNumber)}` }),
};

const storeOrderLines: SourceDef<StoreLineRow> = {
  key: 'storeOrderLines', noun: 'store order lines', money: true,
  rows: (p) => p.data.storeOrders.filter((o) => o.status !== 'CANCELLED').flatMap((order) => order.items.map((item, index) => ({ order, item, index }))),
  date: (r) => r.order.orderDateAd,
  dims: {
    product: (r) => g(r.item.productId, r.item.productName), brand: (r, p) => brand(r.item.brandCode, p),
    subBrand: (r, p) => { const id = lineSubBrandId(r.item, p.data.products); return g(id || 'none', id ? subBrandName(p.data.brands, id) : 'No sub-brand'); },
    store: (r, p) => storeGroup(r.order.entityId, p, r.order.storeName), storeType: (r, p) => storeType(r.order.entityId, p), area: (r, p) => area(r.order.entityId, p),
    distributor: (r, p) => distributor(r.order.entityId, p), staff: (r, p) => staff(r.order.officerId, p, r.order.officerName),
  },
  describe: (r) => ({ id: `${r.order.id}:${r.index}`, date: r.order.orderDateAd, title: `${r.order.orderNumber} · ${r.item.productName}`, detail: `${r.item.totalUnits} units · ${r.order.storeName}`, amount: r.item.totalAmount, href: `/offline-sales/dispatch?q=${encodeURIComponent(r.order.orderNumber)}` }),
};

const dispatchStore = (d: Dispatch) => d.storeId || d.branchId || d.distributorId;
const dispatches: SourceDef<Dispatch> = {
  key: 'dispatches', noun: 'dispatch orders', money: true,
  rows: (p) => p.data.dispatches, date: (d) => d.orderDateAd || d.dispatchDateAd,
  dims: {
    status: (d) => g(dispatchStatus(d), statusLabel(dispatchStatus(d))), store: (d, p) => storeGroup(dispatchStore(d), p, d.storeName || d.branchName || d.distributorName),
    storeType: (d, p) => storeType(dispatchStore(d), p), area: (d, p) => area(dispatchStore(d), p),
    fulfiller: (d) => g(d.fulfilledBy || 'WAREHOUSE', d.fulfilledBy === 'DISTRIBUTOR' ? d.fulfillerName || 'Distributor' : 'Our warehouse'),
    payment: (d) => text(d.paymentStatus, 'No payment due'), distributor: (d) => g(d.distributorId || 'none', d.distributorName || 'No distributor'),
    aging: (d, p) => agingGroup(d.paymentDueDateAd, p.data.today),
  },
  describe: (d) => ({ id: d.id, date: d.orderDateAd || d.dispatchDateAd, title: `${d.dispatchNumber || d.orderNumber || 'Dispatch'} · ${d.storeName || d.branchName || d.distributorName}`, detail: `${statusLabel(dispatchStatus(d))}${d.paymentDueDateAd ? ` · payment due ${d.paymentDueDateAd}` : ''}`, amount: d.amountDue ?? d.totalAmount, href: `/offline-sales/dispatch?q=${encodeURIComponent(d.orderNumber || d.dispatchNumber || '')}` }),
};

export function agingGroup(dueAd: string | undefined, today: string): Group {
  if (!dueAd || dueAd >= today) return { key: '0', label: 'Not due yet' };
  const late = daysBetweenAd(dueAd, today);
  return late <= 30 ? { key: '1', label: '1–30 days late' } : late <= 60 ? { key: '2', label: '31–60 days late' } : { key: '3', label: 'Over 60 days late' };
}

/** A cheque is overdue when it is not cashed (or written off) and its cash date, or new expected date, has passed. */
export function chequeIsOverdue(c: Cheque, today: string): boolean {
  if (['CASHED', 'BOUNCED', 'LOST'].includes(c.status)) return false;
  return c.status === 'DELAYED' || (c.newExpectedDate || c.cashDateAd || '9999') < today;
}

const cheques: SourceDef<Cheque> = {
  key: 'cheques', noun: 'cheques', money: true,
  rows: (p) => p.data.cheques, date: (c) => c.receivedDateAd,
  dims: {
    status: (c) => text(c.status.replace(/_/g, ' ').toLowerCase().replace(/^./, (s) => s.toUpperCase())), staff: (c, p) => staff(c.officerId, p, c.officerName),
    store: (c, p) => storeGroup(c.entityId, p, c.storeName), storeType: (c, p) => storeType(c.entityId, p), area: (c, p) => area(c.entityId, p), bank: (c) => text(c.bankName),
    aging: (c, p) => (chequeIsOverdue(c, p.data.today) ? agingGroup(c.newExpectedDate || c.cashDateAd, p.data.today) : { key: 'ok', label: 'Not overdue' }),
    brand: (c, p) => (c.brandCodes?.length ? c.brandCodes.map((b) => brand(b, p)!) : g('NONE', 'No brand')),
  },
  describe: (c) => ({ id: c.id, date: c.receivedDateAd, title: `${c.storeName} · cheque ${c.chequeNumber}`, detail: `${c.bankName} · cash on ${c.newExpectedDate || c.cashDateAd} · ${c.status.replace(/_/g, ' ').toLowerCase()}`, amount: c.amount, href: '/offline-sales/cheques' }),
};

const visits: SourceDef<Visit> = {
  key: 'visits', noun: 'store visits',
  rows: (p) => p.data.visits, date: (v) => v.dateAd,
  dims: { staff: (v, p) => staff(v.officerId, p, v.officerName), store: (v, p) => storeGroup(v.entityId, p, v.storeName), storeType: (v, p) => storeType(v.entityId, p), area: (v, p) => area(v.entityId, p), weekday: (v) => weekday(v.dateAd) },
  describe: (v) => ({ id: v.id, date: v.dateAd, title: `${v.storeName} · ${v.officerName}`, detail: v.durationMinutes ? `${v.durationMinutes} minutes` : 'Visit', href: `/offline-sales/stores/${encodeURIComponent(v.entityId)}` }),
};

const beatItems: SourceDef<BeatItem> = {
  key: 'beatItems', noun: 'planned visits',
  rows: (p) => p.data.beatItems, date: (b) => b.dateAd,
  dims: { staff: (b, p) => staff(b.officerId, p), status: (b) => g(b.status, b.status === 'VISITED' ? 'Visited' : b.status === 'SKIPPED' ? 'Skipped' : 'Not visited yet'), skipReason: (b) => (b.status === 'SKIPPED' ? text(b.skipReason, 'No reason') : g('none', 'Not skipped')), store: (b, p) => storeGroup(b.entityId, p, b.storeName), storeType: (b, p) => storeType(b.entityId, p), area: (b, p) => area(b.entityId, p) },
  describe: (b, p) => ({ id: b.id, date: b.dateAd, title: `${b.storeName} · ${p.userName(b.officerId)}`, detail: b.status === 'SKIPPED' ? `Skipped: ${b.skipReason || 'no reason'}` : b.status === 'VISITED' ? 'Visited' : 'Not visited', href: '/offline-sales/beat-plan' }),
};

const stockDims: SourceDef<StockLineRow>['dims'] = {
  product: (r) => g(r.item.productId, r.item.productName), brand: (r, p) => brand(r.item.brandCode, p), store: (r, p) => storeGroup(r.count.entityId, p, r.count.storeName),
  storeType: (r, p) => storeType(r.count.entityId, p), area: (r, p) => area(r.count.entityId, p), staff: (r, p) => staff(r.count.officerId, p, r.count.officerName),
};
const stockLines: SourceDef<StockLineRow> = {
  key: 'stockLines', noun: 'shelf counts',
  rows: (p) => p.data.stockCounts.flatMap((count) => (count.items || []).map((item, index) => ({ count, item, index }))), date: (r) => r.count.dateAd, dims: stockDims,
  describe: (r) => ({ id: `${r.count.id}:${r.index}`, date: r.count.dateAd, title: `${r.count.storeName} · ${r.item.productName}`, detail: `${r.item.shelfQty} on shelf (was ${r.item.previousQty})`, href: `/offline-sales/stores/${encodeURIComponent(r.count.entityId)}` }),
};
const latestStock: SourceDef<StockLineRow> = {
  key: 'latestStock', noun: 'products on store shelves',
  rows: (p) => p.latestStock.map((entry, index) => ({ ...entry, index })), dims: stockDims,
  describe: (r) => ({ id: `${r.count.id}:${r.item.productId}`, date: r.count.dateAd, title: `${r.count.storeName} · ${r.item.productName}`, detail: `${r.item.shelfQty} on shelf at the last count (${r.count.dateAd})`, href: `/offline-sales/stores/${encodeURIComponent(r.count.entityId)}` }),
};

const storeCalls: SourceDef<CallLog> = {
  key: 'storeCalls', noun: 'store calls',
  rows: (p) => p.data.storeCalls, date: (c) => c.dateAd,
  dims: { staff: (c, p) => staff(c.officerId, p, c.officerName), outcome: (c) => text(c.outcome), purpose: (c) => text(c.label), store: (c, p) => storeGroup(c.entityId, p, c.storeName) },
  describe: (c) => ({ id: c.id, date: c.dateAd, title: `${c.storeName} · ${c.officerName}`, detail: `${c.label} · ${c.outcome}`, href: '/offline-sales/calls' }),
};

const tasks: SourceDef<Task> = {
  key: 'tasks', noun: 'tasks',
  rows: (p) => p.data.tasks, date: (t) => t.dueDateAd,
  dims: { staff: (t, p) => staff(t.assignedTo, p, t.assignedToName), status: (t, p) => (t.status !== 'COMPLETED' && t.dueDateAd < p.data.today ? g('OVERDUE', 'Overdue') : g(t.status, t.status === 'COMPLETED' ? 'Done' : t.status === 'IN_PROGRESS' ? 'In progress' : 'Not started')), priority: (t) => text(t.priority), type: (t) => text(t.relatedTo, 'General') },
  describe: (t) => ({ id: t.id, date: t.dueDateAd, title: t.title, detail: `${t.assignedToName} · ${t.status.toLowerCase().replace('_', ' ')}`, href: '/opscore/tasks' }),
};

const marketingSends: SourceDef<MarketingSend> = {
  key: 'marketingSends', noun: 'marketing sends',
  rows: (p) => p.data.marketingSends, date: (s) => s.sentDateAd,
  dims: {
    influencer: (s) => g(s.influencerId, s.influencerName), brand: (s, p) => (s.brandCodes?.length ? s.brandCodes.map((b) => brand(b, p)!) : g('NONE', 'No brand')),
    status: (s, p) => (s.status === 'SENT' && s.expectedContentDateAd && s.expectedContentDateAd < p.data.today ? g('LATE', 'Content late') : g(s.status, s.status === 'SENT' ? 'Waiting for content' : s.status === 'CONTENT_RECEIVED' ? 'Content received' : 'Cancelled')),
    staff: (s, p) => staff(s.responsibleId, p, s.responsibleName), channel: (s) => text(s.reachOutPlatform),
  },
  describe: (s) => ({ id: s.id, date: s.sentDateAd, title: `${s.sendNumber} · ${s.influencerName}`, detail: s.items.map((i) => `${i.quantity}× ${i.productName}`).join(', '), href: '/marketing/sends' }),
};

const stores: SourceDef<StoreInfo> = {
  key: 'stores', noun: 'stores',
  rows: (p) => p.stores.filter((s) => s.type !== 'DISTRIBUTOR' || !p.data.branches.some((b) => b.distributorId === s.id)),
  dims: { storeType: (s) => g(s.type, channelLabel(s.type)), area: (s) => text(s.area, 'No area'), city: (s) => text(s.city), staff: (s, p) => staff(s.officerId, p), distributor: (s) => g(s.distributorId || 'none', s.distributorName || 'No distributor'), store: (s) => g(s.id, s.name) },
  describe: (s, p) => ({ id: s.id, date: p.lastStoreOrder.get(s.id) || '', title: s.name, detail: `${channelLabel(s.type)} · ${s.area || 'no area'} · last order ${p.lastStoreOrder.get(s.id) || 'never'}`, href: `/offline-sales/stores/${encodeURIComponent(s.id)}` }),
};

export const SOURCES = {
  orders, orderLines, deliveryFailures, returns, feedback, customers, customerCalls, followUps, storeOrders, storeOrderLines,
  dispatches, cheques, visits, beatItems, stockLines, latestStock, storeCalls, tasks, marketingSends, stores,
} satisfies Record<string, SourceDef<any>>;
export type SourceKey = keyof typeof SOURCES;

/** Helpers the catalogue uses. */
export const helpers = { lineMoney, addDaysAd, daysBetweenAd, chequeIsOverdue, countsAsSale };
