import type { DeliveryFailure, Order, ReturnEntry } from './types';

/**
 * Order issues as tickets. Every row in the `returns` collection is a ticket:
 * a customer return or exchange, a packing error (short shipped or wrong item sent),
 * or a parcel that came back to origin (RTO). Rows saved before tickets existed
 * have none of the ticket fields; the helpers here read them the same way.
 */
export type TicketType = 'RETURN' | 'EXCHANGE' | 'SHORT_SHIPPED' | 'WRONG_ITEM' | 'RTO';
export type TicketStage = 'OPEN' | 'PICKUP_ARRANGED' | 'IN_TRANSIT' | 'RECEIVED' | 'RESOLVED' | 'CLOSED' | 'REJECTED';
/** BACK: coming back to us. MISSING: ordered but not packed. SENT_WRONG: packed by mistake. SHOULD_HAVE_SENT: what the customer should have got. */
export type TicketLineKind = 'BACK' | 'MISSING' | 'SENT_WRONG' | 'SHOULD_HAVE_SENT';
export type GoodsCondition = 'GOOD' | 'DAMAGED' | 'UNSELLABLE';
export type TicketFault = 'CUSTOMER' | 'PACKING' | 'COURIER' | 'PRODUCT' | 'UNKNOWN';
export type TicketResolutionType = 'REFUND' | 'EXCHANGE' | 'RESEND' | 'STORE_CREDIT' | 'NO_ACTION' | 'WRITE_OFF';

export interface TicketLine {
  productId: string;
  productName: string;
  brandCode: string;
  kind: TicketLineKind;
  quantity: number;
  /** Set when the goods are checked in. */
  receivedQty?: number;
  condition?: GoodsCondition;
  comboId?: string;
  comboName?: string;
}

export interface TicketEvent { at: string; by: string; stage?: TicketStage; note: string }

export interface TicketResolution { type: TicketResolutionType; amount?: number; note?: string; dateAd: string; by: string }

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  RETURN: 'Return', EXCHANGE: 'Exchange', SHORT_SHIPPED: 'Short shipped', WRONG_ITEM: 'Wrong item sent', RTO: 'Returned to origin',
};
export const TICKET_TYPE_HINT: Record<TicketType, string> = {
  RETURN: 'Customer sends back some or all of an order',
  EXCHANGE: 'Customer sends a product back and gets another',
  SHORT_SHIPPED: 'We packed fewer units than ordered',
  WRONG_ITEM: 'We packed a different product than ordered',
  RTO: 'Parcel was not delivered and is coming back',
};
export const TICKET_STAGE_LABEL: Record<TicketStage, string> = {
  OPEN: 'Open', PICKUP_ARRANGED: 'Pickup arranged', IN_TRANSIT: 'On the way back', RECEIVED: 'Received in-house',
  RESOLVED: 'Resolved', CLOSED: 'Closed', REJECTED: 'Rejected',
};
export const TICKET_STAGE_STYLE: Record<TicketStage, string> = {
  OPEN: 'border-amber-200 bg-amber-50 text-amber-800',
  PICKUP_ARRANGED: 'border-sky-200 bg-sky-50 text-sky-800',
  IN_TRANSIT: 'border-blue-200 bg-blue-50 text-blue-800',
  RECEIVED: 'border-teal-200 bg-teal-50 text-teal-800',
  RESOLVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  CLOSED: 'border-slate-200 bg-slate-100 text-slate-600',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-700',
};
export const RESOLUTION_LABEL: Record<TicketResolutionType, string> = {
  REFUND: 'Refund', EXCHANGE: 'Exchange sent', RESEND: 'Resend the right product', STORE_CREDIT: 'Store credit', NO_ACTION: 'No action needed', WRITE_OFF: 'Write off (not coming back)',
};
export const FAULT_LABEL: Record<TicketFault, string> = {
  CUSTOMER: 'Customer', PACKING: 'Packing', COURIER: 'Courier', PRODUCT: 'Product quality', UNKNOWN: 'Not known yet',
};
export const CONDITION_LABEL: Record<GoodsCondition, string> = { GOOD: 'Good, back to stock', DAMAGED: 'Damaged', UNSELLABLE: 'Cannot be sold' };
export const LINE_KIND_LABEL: Record<TicketLineKind, string> = {
  BACK: 'Coming back', MISSING: 'Missing from parcel', SENT_WRONG: 'Sent by mistake', SHOULD_HAVE_SENT: 'Should have been sent',
};

/** Stages still needing work. */
export const OPEN_STAGES: TicketStage[] = ['OPEN', 'PICKUP_ARRANGED', 'IN_TRANSIT', 'RECEIVED'];

type TicketRow = Pick<ReturnEntry, 'orderStatus' | 'productId' | 'productName' | 'brandCode' | 'quantity'> & Partial<ReturnEntry>;

export function ticketTypeOf(entry: Pick<ReturnEntry, 'orderStatus'> & { ticketType?: TicketType }): TicketType {
  return entry.ticketType || (entry.orderStatus === 'Exchanged' ? 'EXCHANGE' : 'RETURN');
}

/** A return or exchange the customer chose. Packing errors and RTO are our side, so they stay out of return rates and karma. */
export function isCustomerReturn(entry: Pick<ReturnEntry, 'orderStatus'> & { ticketType?: TicketType }): boolean {
  const type = ticketTypeOf(entry);
  return type === 'RETURN' || type === 'EXCHANGE';
}

/** Rows saved before tickets were added: their stage follows the resolution. */
export function ticketStageOf(entry: Pick<ReturnEntry, 'orderStatus'> & { stage?: TicketStage }): TicketStage {
  if (entry.stage) return entry.stage;
  if (entry.orderStatus === 'Pending') return 'OPEN';
  if (entry.orderStatus === 'Rejected') return 'REJECTED';
  return 'RESOLVED';
}

/** Whether a ticket was created with tracking (stage, goods back). Older rows were not tracked. */
export function isTracked(entry: { stage?: TicketStage }): boolean {
  return !!entry.stage;
}

export function ticketLinesOf(entry: TicketRow): TicketLine[] {
  if (entry.lines?.length) return entry.lines;
  return [{ productId: entry.productId, productName: entry.productName, brandCode: entry.brandCode, kind: 'BACK', quantity: entry.quantity || 1,
    ...(entry.comboId ? { comboId: entry.comboId, comboName: entry.comboName } : {}) }];
}

/** Lines whose goods come back to us. */
export function linesComingBack(entry: TicketRow): TicketLine[] {
  return ticketLinesOf(entry).filter((line) => line.kind === 'BACK' || line.kind === 'SENT_WRONG');
}

export function expectsGoodsBack(entry: TicketRow): boolean {
  if (typeof entry.expectGoodsBack === 'boolean') return entry.expectGoodsBack && linesComingBack(entry).length > 0;
  const type = ticketTypeOf(entry);
  return type !== 'SHORT_SHIPPED' && linesComingBack(entry).length > 0;
}

/** Goods we expect but have not checked in. Only tracked tickets: an old row has no record of arrival either way. */
export function awaitingGoods(entry: TicketRow): boolean {
  if (!isTracked(entry) || !expectsGoodsBack(entry) || entry.receivedDateAd) return false;
  const stage = ticketStageOf(entry);
  if (stage === 'REJECTED') return false;
  return !(entry.resolution?.type === 'WRITE_OFF');
}

/** Where a ticket can move next. Receiving goods is its own action: it can happen before or after the resolution. */
export function nextStages(entry: TicketRow): TicketStage[] {
  const stage = ticketStageOf(entry);
  const back = expectsGoodsBack(entry) && !entry.receivedDateAd;
  switch (stage) {
    case 'OPEN': return back ? ['PICKUP_ARRANGED', 'IN_TRANSIT', 'REJECTED'] : ['REJECTED'];
    case 'PICKUP_ARRANGED': return ['IN_TRANSIT', 'REJECTED'];
    case 'IN_TRANSIT': return [];
    case 'RECEIVED': return ['REJECTED'];
    case 'RESOLVED': return canClose(entry).ok ? ['CLOSED', 'OPEN'] : ['OPEN'];
    case 'CLOSED': case 'REJECTED': return ['OPEN'];
  }
}

/** A ticket closes once it is resolved and nothing is still expected back (or it was written off). */
export function canClose(entry: TicketRow): { ok: boolean; reason?: string } {
  if (ticketStageOf(entry) !== 'RESOLVED') return { ok: false, reason: 'Resolve the ticket first.' };
  if (awaitingGoods(entry)) return { ok: false, reason: 'The goods are not back yet. Mark them received, or resolve as a write-off.' };
  return { ok: true };
}

/** The resolution saved on old rows, which the rest of the app still reads. */
export function legacyStatusFor(stage: TicketStage, resolution?: TicketResolutionType): ReturnEntry['orderStatus'] {
  if (stage === 'REJECTED') return 'Rejected';
  if (resolution === 'EXCHANGE') return 'Exchanged';
  if (resolution === 'REFUND') return 'Refunded';
  if (resolution && (stage === 'RESOLVED' || stage === 'CLOSED')) return 'Returned';
  return 'Pending';
}

export function resolutionFromLegacy(status: ReturnEntry['orderStatus']): TicketResolutionType | undefined {
  if (status === 'Exchanged') return 'EXCHANGE';
  if (status === 'Refunded') return 'REFUND';
  if (status === 'Returned') return 'STORE_CREDIT';
  return undefined;
}

export function resolutionsFor(type: TicketType): TicketResolutionType[] {
  if (type === 'SHORT_SHIPPED') return ['RESEND', 'REFUND', 'STORE_CREDIT', 'NO_ACTION'];
  if (type === 'WRONG_ITEM') return ['RESEND', 'REFUND', 'STORE_CREDIT', 'NO_ACTION', 'WRITE_OFF'];
  if (type === 'RTO') return ['NO_ACTION', 'RESEND', 'REFUND', 'WRITE_OFF'];
  return ['REFUND', 'EXCHANGE', 'STORE_CREDIT', 'NO_ACTION', 'WRITE_OFF'];
}

/** Short, stable ticket number from the record id. */
export function ticketRef(entry: { id: string; ticketNo?: string }): string {
  if (entry.ticketNo) return entry.ticketNo;
  const tail = entry.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  return `TK-${tail}`;
}

export const dayDiff = (from?: string, to?: string): number | null => {
  if (!from || !to) return null;
  const a = Date.parse(from.slice(0, 10)), b = Date.parse(to.slice(0, 10));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 86400000)) : null;
};

export function ticketAgeDays(entry: { dateAd: string; createdAt?: string }, todayAd: string): number {
  return dayDiff(entry.dateAd || entry.createdAt, todayAd) ?? 0;
}

/** Line checks for a new ticket. Returns the first problem, or null. */
export function validateTicketLines(type: TicketType, lines: TicketLine[], order?: Pick<Order, 'items'>): string | null {
  if (!lines.length) return 'Add at least one product.';
  if (lines.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity < 1)) return 'Every product needs a quantity of 1 or more.';
  if (type === 'SHORT_SHIPPED') {
    if (!lines.every((line) => line.kind === 'MISSING')) return 'A short shipment lists only the missing units.';
    if (order) for (const line of lines) {
      const ordered = order.items.filter((item) => item.productId === line.productId).reduce((sum, item) => sum + item.quantity, 0);
      if (!ordered) return `${line.productName} is not on this order.`;
      if (line.quantity > ordered) return `Only ${ordered} of ${line.productName} were ordered.`;
    }
  }
  if (type === 'WRONG_ITEM') {
    const wrong = lines.filter((line) => line.kind === 'SENT_WRONG'), right = lines.filter((line) => line.kind === 'SHOULD_HAVE_SENT');
    if (!wrong.length) return 'Add the product that was sent by mistake.';
    if (!right.length) return 'Add the product the customer should have received.';
    if (wrong.some((line) => right.some((other) => other.productId === line.productId))) return 'The wrong product and the right product cannot be the same.';
    if (order) for (const line of right) {
      if (!order.items.some((item) => item.productId === line.productId)) return `${line.productName} is not on this order.`;
    }
  }
  if ((type === 'RETURN' || type === 'EXCHANGE' || type === 'RTO') && !lines.every((line) => line.kind === 'BACK')) return 'Returned products are listed as coming back.';
  return null;
}

/** Received quantities: never more than what was expected back. */
export function validateReceipt(entry: TicketRow, received: { index: number; receivedQty: number; condition: GoodsCondition }[]): string | null {
  const lines = ticketLinesOf(entry);
  if (!received.length) return 'Enter what arrived.';
  for (const row of received) {
    const line = lines[row.index];
    if (!line || (line.kind !== 'BACK' && line.kind !== 'SENT_WRONG')) return 'That product is not expected back on this ticket.';
    if (!Number.isSafeInteger(row.receivedQty) || row.receivedQty < 0) return 'Received quantity must be a whole number.';
    if (row.receivedQty > line.quantity) return `Only ${line.quantity} of ${line.productName} were expected back.`;
  }
  if (received.every((row) => row.receivedQty === 0)) return 'Nothing arrived? Leave the ticket waiting, or resolve it as a write-off.';
  return null;
}

/** The RTO ticket for a failed delivery that is coming back: every order line, on its way back. */
export function buildRtoTicket(failure: DeliveryFailure, order: Order | undefined, at: { todayAd: string; todayBs: string; nowIso: string; by: string }): Omit<ReturnEntry, 'id' | 'createdAt'> {
  const items = order?.items.filter((item) => !item.isGift || item.quantity > 0) || [];
  const lines: TicketLine[] = items.length
    ? items.map((item) => ({ productId: item.productId, productName: item.productName, brandCode: item.brandCode, kind: 'BACK', quantity: item.quantity }))
    : (failure.products || []).map((product) => ({ productId: '', productName: product.productName, brandCode: failure.brandCode, kind: 'BACK' as const, quantity: product.quantity || 1 }));
  const first = lines[0] || { productId: '', productName: failure.productName || 'Order items', brandCode: failure.brandCode, kind: 'BACK' as const, quantity: 1 };
  return {
    orderId: failure.orderId, orderNumber: failure.orderNumber, brandCode: failure.brandCode,
    productId: first.productId, productName: lines.length > 1 ? `${first.productName} +${lines.length - 1} more` : first.productName,
    customerName: failure.customerName, customerPhone: failure.customerPhone, dateAd: at.todayAd, dateBs: at.todayBs,
    ...(order ? { orderProcessedDateAd: order.orderDateAd, orderProcessedDateBs: order.orderDateBs } : {}),
    platform: order?.platform || failure.platform || '', quantity: lines.reduce((sum, line) => sum + line.quantity, 0) || 1,
    reasonCategory: 'Returned to origin', orderStatus: 'Pending', valley: failure.valley, issueCategories: [],
    ...(failure.remarks ? { remarks: failure.remarks } : {}),
    ticketType: 'RTO', stage: 'IN_TRANSIT', lines: lines.length ? lines : [first], expectGoodsBack: true, fault: 'COURIER',
    deliveryFailureId: failure.id, courier: failure.deliveryMethod || order?.deliveryMethod,
    timeline: [{ at: at.nowIso, by: at.by, stage: 'IN_TRANSIT', note: `Delivery failed (${failure.reason}). Parcel is coming back to the warehouse.` }],
  };
}

// ---------- Reports ----------

export interface RtoRow {
  failureId: string; ticketId?: string; orderId: string; orderNumber: string; brandCode: string; customerName: string;
  courier: string; district: string; valley: string; reason: string; attempts: number;
  orderDateAd?: string; dispatchedDateAd?: string; failedDateAd: string; rtoDateAd?: string; receivedDateAd?: string;
  daysToReturn: number | null; daysWaiting: number | null; value: number; units: number; back: boolean; tracked: boolean;
}

/** Every parcel marked returned-to-warehouse, with its ticket when one exists. */
export function rtoRows(failures: DeliveryFailure[], tickets: ReturnEntry[], orders: Order[], todayAd: string): RtoRow[] {
  const byOrder = new Map(orders.map((order) => [order.id, order]));
  const ticketByFailure = new Map(tickets.filter((entry) => entry.ticketType === 'RTO' && entry.deliveryFailureId).map((entry) => [entry.deliveryFailureId!, entry]));
  return failures.filter((failure) => failure.status === 'RETURNED_TO_WAREHOUSE' || ticketByFailure.has(failure.id)).map((failure) => {
    const order = byOrder.get(failure.orderId);
    const ticket = ticketByFailure.get(failure.id);
    const rtoDateAd = failure.rtoDateAd || ticket?.dateAd;
    const receivedDateAd = ticket?.receivedDateAd;
    return {
      failureId: failure.id, ticketId: ticket?.id, orderId: failure.orderId, orderNumber: failure.orderNumber, brandCode: failure.brandCode,
      customerName: failure.customerName, courier: failure.deliveryMethod || order?.deliveryMethod || 'Not set',
      district: failure.district || order?.district || '', valley: failure.valley, reason: failure.reason, attempts: failure.attempts || failure.attemptLog?.length || 1,
      orderDateAd: order?.orderDateAd || failure.orderDateAd, dispatchedDateAd: order?.dispatchedDateAd, failedDateAd: failure.dateAd,
      rtoDateAd, receivedDateAd, daysToReturn: dayDiff(rtoDateAd, receivedDateAd), daysWaiting: receivedDateAd ? null : dayDiff(rtoDateAd, todayAd),
      value: order?.totalAmount || 0, units: (order?.items || []).reduce((sum, item) => sum + item.quantity, 0) || (failure.products || []).reduce((sum, item) => sum + (item.quantity || 1), 0),
      back: !!receivedDateAd, tracked: !!ticket,
    };
  }).sort((a, b) => (b.rtoDateAd || b.failedDateAd).localeCompare(a.rtoDateAd || a.failedDateAd));
}

export interface RateRow { key: string; shipped: number; rto: number; ratePct: number; value: number; notBack: number }

const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 1000) / 10 : 0;

/** Orders that left the warehouse: the base for an RTO rate. */
export function wasShipped(order: Pick<Order, 'status' | 'dispatchedDateAd'>): boolean {
  return !!order.dispatchedDateAd || ['DISPATCHED', 'DELIVERED', 'FAILED', 'RETURNED', 'EXCHANGED'].includes(order.status);
}

export function rtoRateBy(rows: RtoRow[], orders: Order[], keyOf: (order: Order) => string, rowKey: (row: RtoRow) => string): RateRow[] {
  const table = new Map<string, RateRow>();
  const get = (key: string) => { let row = table.get(key); if (!row) { row = { key, shipped: 0, rto: 0, ratePct: 0, value: 0, notBack: 0 }; table.set(key, row); } return row; };
  for (const order of orders) if (wasShipped(order)) get(keyOf(order) || 'Not set').shipped += 1;
  for (const row of rows) { const entry = get(rowKey(row) || 'Not set'); entry.rto += 1; entry.value += row.value; if (!row.back) entry.notBack += 1; }
  for (const row of table.values()) row.ratePct = pct(row.rto, row.shipped);
  return [...table.values()].filter((row) => row.shipped || row.rto).sort((a, b) => b.rto - a.rto || b.shipped - a.shipped);
}

export interface PackingErrorRow { key: string; tickets: number; units: number; shortShipped: number; wrongItem: number }

/** Packing errors grouped by product (what went wrong on it) or by the person who packed. */
export function packingErrors(tickets: ReturnEntry[], by: 'product' | 'packer'): PackingErrorRow[] {
  const table = new Map<string, PackingErrorRow>();
  for (const entry of tickets) {
    const type = ticketTypeOf(entry);
    if (type !== 'SHORT_SHIPPED' && type !== 'WRONG_ITEM') continue;
    if (ticketStageOf(entry) === 'REJECTED') continue;
    const lines = ticketLinesOf(entry).filter((line) => line.kind === 'MISSING' || line.kind === 'SHOULD_HAVE_SENT');
    const keys = by === 'packer' ? [{ key: entry.packedBy?.trim() || 'Not recorded', units: lines.reduce((sum, line) => sum + line.quantity, 0) }]
      : lines.map((line) => ({ key: line.productName, units: line.quantity }));
    for (const { key, units } of keys) {
      const row = table.get(key) || { key, tickets: 0, units: 0, shortShipped: 0, wrongItem: 0 };
      row.tickets += 1; row.units += units;
      if (type === 'SHORT_SHIPPED') row.shortShipped += 1; else row.wrongItem += 1;
      table.set(key, row);
    }
  }
  return [...table.values()].sort((a, b) => b.tickets - a.tickets || b.units - a.units);
}

export interface TypeSummaryRow { type: TicketType; total: number; open: number; awaitingGoods: number; resolved: number; rejected: number; medianDaysToResolve: number | null }

const median = (values: number[]) => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10; };

export function ticketSummary(tickets: ReturnEntry[]): TypeSummaryRow[] {
  const types: TicketType[] = ['RETURN', 'EXCHANGE', 'SHORT_SHIPPED', 'WRONG_ITEM', 'RTO'];
  return types.map((type) => {
    const rows = tickets.filter((entry) => ticketTypeOf(entry) === type);
    const stages = rows.map(ticketStageOf);
    return {
      type, total: rows.length,
      open: stages.filter((stage) => OPEN_STAGES.includes(stage)).length,
      awaitingGoods: rows.filter(awaitingGoods).length,
      resolved: stages.filter((stage) => stage === 'RESOLVED' || stage === 'CLOSED').length,
      rejected: stages.filter((stage) => stage === 'REJECTED').length,
      medianDaysToResolve: median(rows.map((entry) => dayDiff(entry.dateAd, entry.resolvedDateAd)).filter((value): value is number => value !== null)),
    };
  });
}

export interface ReasonRow { reason: string; type: TicketType; tickets: number; units: number }

export function issuesByReason(tickets: ReturnEntry[]): ReasonRow[] {
  const table = new Map<string, ReasonRow>();
  for (const entry of tickets) {
    const type = ticketTypeOf(entry);
    const key = `${type}|${entry.reasonCategory}`;
    const row = table.get(key) || { reason: entry.reasonCategory, type, tickets: 0, units: 0 };
    row.tickets += 1; row.units += ticketLinesOf(entry).filter((line) => line.kind !== 'SHOULD_HAVE_SENT').reduce((sum, line) => sum + line.quantity, 0);
    table.set(key, row);
  }
  return [...table.values()].sort((a, b) => b.tickets - a.tickets);
}

/** For the dashboard and reports: counts over a set of tickets. */
export function ticketCounts(tickets: ReturnEntry[]) {
  let packing = 0, rto = 0, open = 0, waiting = 0;
  for (const entry of tickets) {
    const type = ticketTypeOf(entry);
    if (ticketStageOf(entry) === 'REJECTED') continue;
    if (type === 'SHORT_SHIPPED' || type === 'WRONG_ITEM') packing += 1;
    if (type === 'RTO') rto += 1;
    if (OPEN_STAGES.includes(ticketStageOf(entry))) open += 1;
    if (awaitingGoods(entry)) waiting += 1;
  }
  return { packing, rto, open, awaitingGoods: waiting };
}

/**
 * Old-style rows for return metrics: one per product coming back, customer returns only.
 * A ticket with several products becomes several rows; the first keeps the ticket id.
 */
export function returnRowsForMetrics(tickets: ReturnEntry[]): ReturnEntry[] {
  const out: ReturnEntry[] = [];
  for (const entry of tickets) {
    if (!isCustomerReturn(entry)) continue;
    if (!entry.lines || entry.lines.length <= 1) { out.push(entry); continue; }
    entry.lines.filter((line) => line.kind === 'BACK').forEach((line, index) => {
      out.push({ ...entry, id: index === 0 ? entry.id : `${entry.id}#${index}`, productId: line.productId, productName: line.productName, brandCode: line.brandCode as ReturnEntry['brandCode'], quantity: line.quantity,
        ...(line.comboId ? { comboId: line.comboId, comboName: line.comboName } : { comboId: undefined, comboName: undefined }) });
    });
  }
  return out;
}
