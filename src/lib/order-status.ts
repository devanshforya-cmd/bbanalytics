import type { OrderStatus } from './types';

/** Statuses staff set directly. Failed, Returned and Exchanged come from their own forms. */
export type ManualOrderStatus = 'PENDING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
export const MANUAL_ORDER_STATUSES: ManualOrderStatus[] = ['PENDING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending', DISPATCHED: 'Dispatched', DELIVERED: 'Delivered', FAILED: 'Delivery failed',
  CANCELLED: 'Cancelled', RETURNED: 'Returned', EXCHANGED: 'Exchanged',
};

export const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-700 border-slate-200',
  DISPATCHED: 'bg-blue-50 text-blue-700 border-blue-200',
  DELIVERED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200 line-through',
  RETURNED: 'bg-amber-50 text-amber-800 border-amber-200',
  EXCHANGED: 'bg-purple-50 text-purple-700 border-purple-200',
};

/** The usual next step offered as the one-click action. */
export function nextOrderStatus(status: OrderStatus): ManualOrderStatus | null {
  if (status === 'PENDING') return 'DISPATCHED';
  if (status === 'DISPATCHED' || status === 'FAILED') return 'DELIVERED';
  return null;
}

/** Orders still out for delivery: what the team should be chasing. */
export function isOpenOrder(status: OrderStatus): boolean {
  return status === 'PENDING' || status === 'DISPATCHED' || status === 'FAILED';
}

/** An order the customer bought: not cancelled, and not a free replacement for an exchange. Same rule as Daily Orders. */
export function countsAsSale(order: { status: OrderStatus; exchangeReturnId?: string; isMarketing?: boolean }): boolean {
  return order.status !== 'CANCELLED' && !order.exchangeReturnId && !order.isMarketing;
}

/** Orders whose delivery has an outcome, for delivery success rates (pending and in-transit are not counted yet). */
export function hasDeliveryOutcome(status: OrderStatus): boolean {
  return status === 'DELIVERED' || status === 'FAILED' || status === 'RETURNED' || status === 'EXCHANGED';
}
