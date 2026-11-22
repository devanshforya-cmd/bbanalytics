'use client';

import React, { useState } from 'react';
import { ArrowRight, Ban, Check, Truck } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canWorkOrders } from '@/lib/permissions';
import type { Order } from '@/lib/types';
import { MANUAL_ORDER_STATUSES, ORDER_STATUS_LABEL, ORDER_STATUS_STYLE, nextOrderStatus, type ManualOrderStatus } from '@/lib/order-status';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { confirmAction } from '@/components/common/confirm';
import { toast } from '@/components/common/Toast';
import { displayDocumentId } from '@/lib/document-ids';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { bsLabel } from '@/components/common/DualDateField';

interface OrderStatusControlProps {
  order: Order;
  /** Compact: a badge and the one-click next step, for table rows. */
  compact?: boolean;
  onChanged?: (order: Order) => void;
}

export function OrderStatusBadge({ status }: { status: Order['status'] }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${ORDER_STATUS_STYLE[status] || ORDER_STATUS_STYLE.PENDING}`}>{ORDER_STATUS_LABEL[status] || status}</span>;
}

const STEP_ICON: Record<string, React.ReactNode> = { DISPATCHED: <Truck className="h-3 w-3" />, DELIVERED: <Check className="h-3 w-3" /> };

/** Shared status change used by the order page and Daily Orders. */
export async function changeOrderStatus(order: Order, status: ManualOrderStatus, reason?: string): Promise<Order | null> {
  const undoing = order.status === 'DELIVERED' || order.status === 'CANCELLED';
  if (undoing && status !== order.status) {
    const ok = await confirmAction({
      title: `Change ${displayDocumentId(order.orderNumber)} from ${ORDER_STATUS_LABEL[order.status]} to ${ORDER_STATUS_LABEL[status]}?`,
      message: 'Use this to correct a wrong click.',
      consequences: [order.status === 'DELIVERED' ? 'The customer’s delivered count and karma point are taken back.' : 'The customer’s cancellation and karma penalty are taken back.', 'The change is kept in the order history.'],
      confirmLabel: 'Change status',
    });
    if (!ok) return null;
  }
  try {
    const updated = db.setOrderStatus(order.id, status, { reason });
    if (updated) toast.success(`${displayDocumentId(order.orderNumber)} marked ${ORDER_STATUS_LABEL[status].toLowerCase()}`);
    return updated;
  } catch (error) {
    toast.error('Status not changed', error instanceof Error ? error.message : 'Please try again.');
    return null;
  }
}

export default function OrderStatusControl({ order, compact = false, onChanged }: OrderStatusControlProps) {
  const canEdit = canWorkOrders(db.getCurrentUser());
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const next = nextOrderStatus(order.status);
  const { formatDate } = useCalendarPreference();
  const day = (ad: string) => formatDate(ad, bsLabel(ad));

  const apply = (status: ManualOrderStatus, why?: string) => guardedSubmit(async () => {
    const updated = await changeOrderStatus(order, status, why);
    if (updated) { setCancelling(false); setReason(''); onChanged?.(updated); }
  });

  if (!canEdit) return <OrderStatusBadge status={order.status} />;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <OrderStatusBadge status={order.status} />
        {next && (
          <button type="button" disabled={isSubmitting} onClick={() => apply(next)} title={`Mark ${ORDER_STATUS_LABEL[next].toLowerCase()}`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50">
            {STEP_ICON[next]} {ORDER_STATUS_LABEL[next]}
          </button>
        )}
      </span>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={order.status} />
        {next && (
          <button type="button" disabled={isSubmitting} onClick={() => apply(next)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
            {STEP_ICON[next]} Mark {ORDER_STATUS_LABEL[next].toLowerCase()} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        <label className="sr-only" htmlFor={`status-${order.id}`}>Set status</label>
        <select id={`status-${order.id}`} value="" disabled={isSubmitting}
          onChange={(event) => { const value = event.target.value as ManualOrderStatus; event.target.value = ''; if (!value) return; if (value === 'CANCELLED') setCancelling(true); else apply(value); }}
          className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700">
          <option value="">Set status…</option>
          {MANUAL_ORDER_STATUSES.filter((status) => status !== order.status).map((status) => <option key={status} value={status}>{ORDER_STATUS_LABEL[status]}</option>)}
        </select>
      </div>
      {order.status === 'FAILED' && <p className="text-[11px] text-slate-500">Delivered after a failed attempt? Mark it delivered and the open delivery failure closes with it.</p>}
      {cancelling && (
        <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
          <label htmlFor={`cancel-${order.id}`} className="block text-xs font-bold text-rose-900">Why is this order cancelled? <span className="text-rose-600">*</span></label>
          <input id={`cancel-${order.id}`} autoFocus value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="For example: customer changed mind before dispatch"
            className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs outline-none focus:border-rose-400" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setCancelling(false); setReason(''); }} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-white">Keep order</button>
            <button type="button" disabled={isSubmitting || !reason.trim()} onClick={() => apply('CANCELLED', reason.trim())}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"><Ban className="h-3.5 w-3.5" /> Cancel order</button>
          </div>
        </div>
      )}
      {(order.dispatchedDateAd || order.deliveredDateAd || order.cancelledDateAd) && (
        <p className="text-[11px] text-slate-500">
          {[order.dispatchedDateAd && `Dispatched ${day(order.dispatchedDateAd)}`, order.deliveredDateAd && `Delivered ${day(order.deliveredDateAd)}`, order.cancelledDateAd && `Cancelled ${day(order.cancelledDateAd)}`].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}
