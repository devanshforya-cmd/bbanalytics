'use client';

import NumberInput from '@/components/common/NumberInput';
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, PackageX } from 'lucide-react';
import { failureReasonLabel, isOtherReason, REASON_DETAIL_MAX } from '@/lib/failure-reason';
import { db } from '@/lib/db/db-service';
import { canPerform, hasAccess } from '@/lib/permissions';
import type { Order } from '@/lib/types';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { phoneDigits } from '@/lib/customer-lookup';
import { displayDocumentId } from '@/lib/document-ids';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { syncManager } from '@/lib/offline-sync';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import CustomerLookup, { customerLookupError, EMPTY_CUSTOMER_LOOKUP, type CustomerLookupValue } from '@/components/common/CustomerLookup';
import OrderPicker from '@/components/common/OrderPicker';
import CreatableSelect from '@/components/common/CreatableSelect';
import DualDateField from '@/components/common/DualDateField';
import { toast } from '@/components/common/Toast';

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const INSIDE_VALLEY = ['kathmandu', 'lalitpur', 'bhaktapur', 'kirtipur', 'madhyapur thimi', 'patan'];
export const valleyOf = (district?: string): 'Inside' | 'Outside' => INSIDE_VALLEY.some((name) => (district || '').toLowerCase().includes(name)) ? 'Inside' : 'Outside';

interface LogFailureFormProps { onClose: () => void; onSaved: () => void; onViewCustomer?: (phone: string) => void; initialOrder?: Order | null }

/**
 * Log a delivery failure with three inputs: phone, order, reason.
 * Everything else comes from the order and is shown read-only.
 */
export default function LogFailureForm({ onClose, onSaved, onViewCustomer, initialOrder = null }: LogFailureFormProps) {
  const user = db.getCurrentUser();
  const { formatDate } = useCalendarPreference();
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [customer, setCustomer] = useState<CustomerLookupValue>(() => {
    if (!initialOrder) return EMPTY_CUSTOMER_LOOKUP;
    const owner = db.getCustomerByPhone(initialOrder.customerPhone);
    return owner ? { phone: phoneDigits(owner.phone), name: owner.name, link: 'LINKED', customer: owner } : { phone: phoneDigits(initialOrder.customerPhone), name: initialOrder.customerName, link: 'NEW' };
  });
  const [order, setOrder] = useState<Order | null>(initialOrder);
  const [reasonId, setReasonId] = useState<string[]>([]);
  const [reasonDetail, setReasonDetail] = useState('');
  const [dateAd, setDateAd] = useState(getTodayAd());
  const [dateBs, setDateBs] = useState(getTodayBs());
  const [attempt, setAttempt] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reattemptAd, setReattemptAd] = useState('');
  const [reattemptBs, setReattemptBs] = useState('');
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, refresh] = useState(0);
  const lookupRef = useRef<HTMLDivElement>(null);

  const reasons = db.getFailureReasons();
  const reason = reasons.find((entry) => entry.id === reasonId[0])?.name || '';
  const needsDetail = isOtherReason(reason);
  const detail = needsDetail ? reasonDetail.trim() : '';
  const openFailure = order ? db.getOpenDeliveryFailure(order.id) : undefined;
  const previousAttempts = useMemo(() => order ? db.getDeliveryFailures('ALL').filter((failure) => failure.orderId === order.id).reduce((total, failure) => Math.max(total, failure.attempts || 1), 0) : 0, [order]);
  const nextAttempt = openFailure ? (openFailure.attempts || 1) + 1 : previousAttempts + 1;
  const attemptNumber = Math.max(1, Math.round(Number(attempt)) || nextAttempt);
  const brandName = (code: string) => db.getBrands('ALL').find((brand) => brand.code === code)?.name || code;

  const pickCustomer = (next: CustomerLookupValue) => {
    setCustomer(next); setErrors({});
    if (next.link !== 'LINKED') { setOrder(null); return; }
    // One undelivered order is almost always the one that failed, so it is chosen for the user.
    const own = db.getOrders('ALL').filter((entry) => phoneDigits(entry.customerPhone) === phoneDigits(next.phone));
    const undelivered = own.filter((entry) => ['PENDING', 'DISPATCHED', 'FAILED'].includes(entry.status));
    setOrder(undelivered.length === 1 ? undelivered[0] : own.length === 1 ? own[0] : null);
  };
  const pickOrder = (next: Order | null) => {
    setOrder(next); setErrors({});
    if (next && customer.link !== 'LINKED') {
      const owner = db.getCustomerByPhone(next.customerPhone);
      setCustomer(owner ? { phone: phoneDigits(owner.phone), name: owner.name, link: 'LINKED', customer: owner } : { phone: phoneDigits(next.customerPhone), name: next.customerName, link: 'NEW' });
    }
  };

  const save = () => guardedSubmit(async () => {
    const problems: Record<string, string> = {};
    if (!order) { const lookup = customerLookupError(customer); if (lookup && customer.link !== 'NEW') problems.customer = lookup; problems.order = 'Pick the order that failed.'; }
    if (!reason) problems.reason = 'Choose the reason.';
    else if (needsDetail && !detail) problems.reasonDetail = 'Write why the delivery failed.';
    if (reattemptAd && reattemptAd < dateAd) problems.reattempt = 'The reattempt cannot be before the failure date.';
    setErrors(problems);
    if (Object.keys(problems).length || !order) { toast.error('Three things are needed: phone, order and reason', Object.values(problems)[0]); return; }
    try {
      if (openFailure) {
        db.addDeliveryAttempt(openFailure.id, { dateAd, dateBs, reason, ...(detail ? { reasonDetail: detail } : {}), remarks: remarks.trim() || undefined, ...(reattemptAd ? { reattemptDateAd: reattemptAd, reattemptDateBs: reattemptBs } : {}) });
      } else {
        db.addDeliveryFailure({
          orderId: order.id, orderNumber: order.orderNumber, brandCode: order.brandCode, customerName: order.customerName, customerPhone: order.customerPhone,
          productName: order.items.map((item) => `${item.quantity}× ${item.productName}${item.isGift ? ' (gift)' : ''}`).join(', '), products: order.items.map((item) => ({ productName: item.productName, quantity: item.quantity })),
          deliveryMethod: order.deliveryMethod, address: order.address, district: order.district, platform: order.platform, orderDateAd: order.orderDateAd,
          dateAd, dateBs, reason, ...(detail ? { reasonDetail: detail } : {}), valley: valleyOf(order.district), attempts: attemptNumber, status: reattemptAd ? 'REATTEMPT_SCHEDULED' : 'FAILED',
          ...(remarks.trim() ? { remarks: remarks.trim() } : {}), ...(reattemptAd ? { reattemptDateAd: reattemptAd, reattemptDateBs: reattemptBs } : {}),
        });
      }
      try { await syncManager.forceSyncNow(); } catch { /* The failure stays in the sync queue. */ }
      toast.success(openFailure ? `Attempt ${nextAttempt} logged for ${displayDocumentId(order.orderNumber)}` : `Delivery failure logged for ${displayDocumentId(order.orderNumber)}`,
        `${order.customerName} · ${failureReasonLabel({ reason, reasonDetail: detail })}`, hasAccess(user, 'customers') && onViewCustomer ? { label: 'View customer', onClick: () => onViewCustomer(phoneDigits(order.customerPhone)) } : undefined);
      onSaved();
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'The failure could not be saved.'); }
  });

  if (!canPerform(user, 'orderflow', 'CREATE') && !canPerform(user, 'order_desk', 'CREATE')) return null;
  const ready = !!order && !!reason && (!needsDetail || !!detail);
  const footer = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-slate-500">{ready ? 'Ready to save' : !order ? 'Step 1 and 2: phone, then order' : needsDetail && reason ? 'Step 3: write the reason' : 'Step 3: choose the reason'}</span>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary disabled:opacity-50">Cancel</button>
        <button type="button" onClick={save} disabled={isSubmitting} className="rounded-lg bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300">
          {isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Saving…</> : openFailure ? `Add attempt ${nextAttempt}` : 'Log delivery failure'}
        </button>
      </div>
    </div>
  );

  return (
    <SlideOverPanel isOpen onClose={isSubmitting ? () => {} : onClose} width="lg" title="Log delivery failure" subtitle="Phone, order, reason. The rest is filled from the order." footer={footer}>
      <div className="space-y-5 p-5 text-xs">
        <section ref={lookupRef}>
          <p className="mb-2 text-[11px] font-bold text-slate-500">1 · Customer</p>
          <CustomerLookup value={customer} onChange={pickCustomer} autoFocus error={errors.customer} />
        </section>

        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-500">2 · Order</p>
          <OrderPicker required customerPhone={customer.link === 'LINKED' || customer.link === 'NEW' ? customer.phone : ''} selectedId={order?.id || ''} onSelect={pickOrder} error={errors.order}
            onCheckNumber={() => { setCustomer(EMPTY_CUSTOMER_LOOKUP); setOrder(null); lookupRef.current?.querySelector('input')?.focus(); }} />
        </section>

        {order && (
          <>
            {order.status === 'DELIVERED' && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span><strong>This order is marked Delivered.</strong> Log a failure only if that is wrong. A product that came back after delivery belongs in Returns.</span></p>
            )}
            {openFailure && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900" role="status">
                <p className="flex items-center gap-2 font-bold"><PackageX className="h-4 w-4" /> This order already has an open failure</p>
                <p className="mt-0.5 text-[11px]">Attempt {openFailure.attempts || 1} · {failureReasonLabel(openFailure)} · {formatDate(openFailure.dateAd, openFailure.dateBs)}. Saving adds attempt {nextAttempt} to it instead of creating a duplicate.</p>
              </div>
            )}
            <section>
              <p className="mb-2 text-[11px] font-bold text-slate-500">From the order</p>
              <div className="flex flex-wrap gap-1.5">
                {[['Customer', order.customerName], ['Brand', brandName(order.brandCode)], ['Products', order.items.map((item) => `${item.quantity}× ${item.productName}${item.isGift ? ' (gift)' : ''}`).join(', ')],
                  ['Address', order.address || '—'], ['District', order.district || '—'], ['Valley', valleyOf(order.district)], ['Platform', order.platform],
                  ['Delivery', order.deliveryMethod], ['Ordered', formatDate(order.orderDateAd, order.orderDateBs)]].map(([term, detail]) => (
                  <span key={term} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1"><span className="text-slate-500">{term}:</span> <strong className="text-slate-900">{detail}</strong></span>
                ))}
              </div>
            </section>
          </>
        )}

        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-500">3 · Reason</p>
          <CreatableSelect label="Why did the delivery fail?" required noun="reason" value={reasonId} onChange={(ids) => { setReasonId(ids); setErrors((current) => ({ ...current, reason: '' })); }}
            options={reasons.map((entry) => ({ id: entry.id, name: entry.name }))} error={errors.reason} placeholder="Choose a reason, or type a new one"
            onCreate={(text) => { const made = db.addFailureReason(text); refresh((n) => n + 1); return { id: made.id, name: made.name }; }} />
          {needsDetail && (
            <div className="mt-3">
              <label htmlFor="failure-reason-detail" className="mb-1 block font-bold text-slate-700">Write the reason <span className="text-rose-600">*</span></label>
              <textarea id="failure-reason-detail" autoFocus rows={2} maxLength={REASON_DETAIL_MAX} value={reasonDetail}
                onChange={(event) => { setReasonDetail(event.target.value); setErrors((current) => ({ ...current, reasonDetail: '' })); }}
                aria-invalid={!!errors.reasonDetail} aria-describedby="failure-reason-detail-help"
                placeholder="For example: rider could not reach the area because of a road closure"
                className={`${field} resize-y ${errors.reasonDetail ? 'border-rose-400 focus:border-rose-500' : ''}`} />
              <p id="failure-reason-detail-help" className={`mt-1 flex justify-between text-[11px] ${errors.reasonDetail ? 'font-medium text-rose-600' : 'text-slate-500'}`}>
                <span>{errors.reasonDetail || 'Shown with the failure everywhere it is listed.'}</span>
                <span className="text-slate-500">{reasonDetail.length}/{REASON_DETAIL_MAX}</span>
              </p>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200">
          <button type="button" aria-expanded={more} onClick={() => setMore((value) => !value)} className="flex w-full items-center justify-between px-3 py-2.5 text-left font-bold text-slate-700">
            <span>Optional details <span className="font-medium text-slate-500">· {formatDate(dateAd, dateBs)} · attempt {openFailure ? nextAttempt : attemptNumber}</span></span>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition ${more ? 'rotate-180' : ''}`} />
          </button>
          {more && (
            <div className="space-y-3 border-t border-slate-100 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DualDateField id="failure-date" label="Failure date" valueAd={dateAd} maxAd={getTodayAd()} onChange={(ad, bs) => { if (ad) { setDateAd(ad); setDateBs(bs); } }} />
                <div>
                  <label htmlFor="failure-attempt" className="mb-1 block font-bold text-slate-700">Attempt number</label>
                  <NumberInput id="failure-attempt" type="number" min={1} max={20} disabled={!!openFailure} value={openFailure ? nextAttempt : attempt} placeholder={String(nextAttempt)} onChange={(event) => setAttempt(event.target.value)} className={`${field} disabled:bg-slate-50`} />
                </div>
              </div>
              <DualDateField id="failure-reattempt" label="Reattempt date" valueAd={reattemptAd} minAd={dateAd} allowClear error={errors.reattempt} helper="Leave empty if no reattempt is planned yet." onChange={(ad, bs) => { setReattemptAd(ad); setReattemptBs(bs); }} />
              <div>
                <label htmlFor="failure-remarks" className="mb-1 block font-bold text-slate-700">Remarks</label>
                <textarea id="failure-remarks" rows={2} value={remarks} maxLength={500} onChange={(event) => setRemarks(event.target.value)} placeholder="What the rider or customer said" className={field} />
              </div>
            </div>
          )}
        </section>
      </div>
    </SlideOverPanel>
  );
}
