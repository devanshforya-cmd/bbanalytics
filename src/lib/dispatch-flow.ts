/**
 * Store orders and dispatch orders, one flow.
 *
 *   Store order taken on a visit (SO-0108)
 *     → dispatch order created at once, "Order received" (DP-0045)
 *     → Packed → Dispatched → Delivered   (or Cancelled at any step before delivery)
 *
 * The store order's status follows its dispatch order, so reports, area selling and the
 * store ledger all read the same truth. Older dispatches, logged before statuses existed,
 * count as Dispatched.
 */
import type { Dispatch, DispatchItem, DispatchStatus, SecondaryOrder } from './types';

export const DISPATCH_STATUSES: { status: DispatchStatus; label: string; short: string; tone: 'blue' | 'amber' | 'violet' | 'green' | 'slate' }[] = [
  { status: 'ORDER_RECEIVED', label: 'Order received', short: 'Received', tone: 'blue' },
  { status: 'PACKED', label: 'Packed', short: 'Packed', tone: 'amber' },
  { status: 'DISPATCHED', label: 'Dispatched', short: 'Dispatched', tone: 'violet' },
  { status: 'DELIVERED', label: 'Delivered', short: 'Delivered', tone: 'green' },
  { status: 'CANCELLED', label: 'Cancelled', short: 'Cancelled', tone: 'slate' },
];

export const dispatchStatus = (dispatch: Pick<Dispatch, 'status'>): DispatchStatus => dispatch.status || 'DISPATCHED';
export const statusLabel = (status: DispatchStatus) => DISPATCH_STATUSES.find((s) => s.status === status)?.label || status;

/** The next step(s) a dispatch order can move to. */
export function nextSteps(status: DispatchStatus): DispatchStatus[] {
  switch (status) {
    case 'ORDER_RECEIVED': return ['PACKED', 'DISPATCHED', 'CANCELLED'];
    case 'PACKED': return ['DISPATCHED', 'ORDER_RECEIVED', 'CANCELLED'];
    case 'DISPATCHED': return ['DELIVERED', 'CANCELLED'];
    default: return [];
  }
}

export const canMoveTo = (from: DispatchStatus, to: DispatchStatus) => nextSteps(from).includes(to);

/** Quantities can be corrected until the store has received the goods. */
export const canCorrect = (status: DispatchStatus) => status !== 'DELIVERED' && status !== 'CANCELLED';

/** The store order status that matches a dispatch status. */
export function orderStatusFor(status: DispatchStatus): SecondaryOrder['status'] {
  if (status === 'DISPATCHED') return 'DISPATCHED';
  if (status === 'DELIVERED') return 'DELIVERED';
  if (status === 'CANCELLED') return 'CANCELLED';
  return 'PENDING_DISPATCH';
}

/** Who the stock is going to, for lists and the challan. */
export function destinationName(dispatch: Pick<Dispatch, 'storeName' | 'branchName' | 'distributorName'>): string {
  return dispatch.storeName || dispatch.branchName || dispatch.distributorName || 'Store';
}

export const dispatchUnits = (dispatch: Pick<Dispatch, 'items'>) => dispatch.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
export const dispatchValue = (dispatch: Pick<Dispatch, 'items'>) => dispatch.items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);

/** Payment due date: dispatch day plus the days in the payment terms ("15 days credit" → +15). Cash terms have none. */
export function paymentDueDate(dispatchedOn: string, terms?: string): string {
  if (!dispatchedOn || !terms || /cash|cod/i.test(terms)) return '';
  const days = Number(/(\d+)/.exec(terms)?.[1] || 0);
  if (!days) return '';
  return new Date(Date.parse(`${dispatchedOn.slice(0, 10)}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export interface StoreRef { id: string; name: string; type: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER'; chainId?: string; chainName?: string; distributorId?: string; distributorName?: string }

/** The dispatch order a new store order starts. The server gives it its DP number. */
export function dispatchFromOrder(order: SecondaryOrder, store: StoreRef | null, byName: string, now = new Date()): Omit<Dispatch, 'dispatchNumber'> {
  const at = now.toISOString();
  const items: DispatchItem[] = order.items.map((item) => ({
    productId: item.productId, productName: item.productName, brandCode: item.brandCode, subBrandId: item.subBrandId,
    quantity: (item.totalUnits || 0) + (item.freeUnits || 0), quantityPcs: (item.totalUnits || 0) + (item.freeUnits || 0),
    orderedQty: (item.totalUnits || 0) + (item.freeUnits || 0), unitPrice: item.totalUnits ? Math.round(((item.totalAmount || 0) / ((item.totalUnits || 0) + (item.freeUnits || 0))) * 100) / 100 : item.unitPrice,
  }));
  const viaDistributor = !!store?.distributorId && store.type === 'RETAILER';
  return {
    id: `disp_so_${order.id}`.slice(0, 170),
    status: 'ORDER_RECEIVED',
    statusHistory: [{ status: 'ORDER_RECEIVED', at, byName, note: `From store order ${order.orderNumber || ''}`.trim() }],
    orderId: order.id,
    orderNumber: order.orderNumber,
    storeId: order.entityId,
    storeName: order.storeName,
    entityType: order.entityType,
    distributorId: store?.type === 'BRANCH' ? store.chainId || order.entityId : order.entityId,
    distributorName: store?.type === 'BRANCH' ? store.chainName || order.storeName : order.storeName,
    branchId: order.entityType === 'BRANCH' ? order.entityId : undefined,
    branchName: order.entityType === 'BRANCH' ? order.storeName : undefined,
    fulfilledBy: viaDistributor ? 'DISTRIBUTOR' : 'WAREHOUSE',
    fulfillerId: viaDistributor ? store!.distributorId : undefined,
    fulfillerName: viaDistributor ? store!.distributorName : undefined,
    orderDateAd: order.orderDateAd,
    dispatchDateAd: '',
    dispatchDateBs: '',
    items,
    totalAmount: order.totalAmount,
    paymentTerms: order.paymentTerms,
    notes: order.notes,
    createdBy: byName,
    createdAt: at,
    edits: [],
  };
}
