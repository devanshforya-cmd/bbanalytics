'use client';

import NumberInput from '@/components/common/NumberInput';
import React, { useRef, useState } from 'react';
import { AlertTriangle, Camera } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canPerform, canWorkOrders, hasAccess } from '@/lib/permissions';
import type { Order, ReturnEntry, ReturnReason } from '@/lib/types';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { phoneDigits } from '@/lib/customer-lookup';
import { displayDocumentId } from '@/lib/document-ids';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { syncManager } from '@/lib/offline-sync';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import CustomerLookup, { customerLookupError, EMPTY_CUSTOMER_LOOKUP, type CustomerLookupValue } from '@/components/common/CustomerLookup';
import OrderPicker from '@/components/common/OrderPicker';
import DualDateField from '@/components/common/DualDateField';
import DynamicCheckboxes from '@/components/common/DynamicCheckboxes';
import { toast } from '@/components/common/Toast';
import { capturePhoto } from '@/lib/photo-capture';
import { valleyOf } from '@/app/orderflow/delivery-failures/components/LogFailureForm';
import { returnableLines } from '@/lib/return-lines';
import { waitingExchangeOrders } from '@/lib/exchange';

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const REASONS: ReturnReason[] = ['Damage', 'Wrong product sent', 'Product not as described', 'Allergic reaction', 'Quality defect', 'Size issue', 'Color mismatch', 'Changed mind'];
const RESOLUTIONS: ReturnEntry['orderStatus'][] = ['Pending', 'Exchanged', 'Refunded', 'Returned', 'Rejected'];

export interface SavedReturnSummary { returnId: string; resolution: ReturnEntry['orderStatus']; customerName: string; customerPhone: string; productId: string; productName: string; isSerialReturner: boolean; timeToReturnDays: number; exchangeLinked?: boolean }
interface LogReturnFormProps { onClose: () => void; onSaved: (summary: SavedReturnSummary) => void; onViewCustomer?: (phone: string) => void; initialOrder?: Order | null;
  /** An exchange order from WhatsApp whose return is being logged now: same customer, resolution Exchanged, linked on save. */
  exchangeOrder?: Order | null }

/**
 * Log an actual product return with the same flow as a delivery failure:
 * phone, order, reason. Returns stay separate from delivery failures.
 */
export default function LogReturnForm({ onClose, onSaved, onViewCustomer, initialOrder = null, exchangeOrder = null }: LogReturnFormProps) {
  const user = db.getCurrentUser();
  const { formatDate } = useCalendarPreference();
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [customer, setCustomer] = useState<CustomerLookupValue>(() => {
    const from = initialOrder || exchangeOrder;
    if (!from) return EMPTY_CUSTOMER_LOOKUP;
    const owner = db.getCustomerByPhone(from.customerPhone);
    return owner ? { phone: phoneDigits(owner.phone), name: owner.name, link: 'LINKED', customer: owner } : { phone: phoneDigits(from.customerPhone), name: from.customerName, link: 'NEW' };
  });
  const combos = db.getCombos('ALL');
  const linesFor = (next: Order | null) => next ? returnableLines(next, combos, db.getReturns('ALL')) : [];
  // One line ordered: pick it. A single combo: pick the whole combo; staff switch to one product if needed.
  const firstKey = (next: Order | null) => { const lines = linesFor(next); return next?.items.length === 1 ? lines[0]?.key || '' : ''; };
  const [order, setOrder] = useState<Order | null>(initialOrder);
  const [productId, setProductId] = useState(() => firstKey(initialOrder));
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [returnAd, setReturnAd] = useState(getTodayAd());
  const [returnBs, setReturnBs] = useState(getTodayBs());
  const [resolution, setResolution] = useState<ReturnEntry['orderStatus']>(exchangeOrder ? 'Exchanged' : 'Pending');
  const [linkExchangeId, setLinkExchangeId] = useState(exchangeOrder?.id || '');
  const [issues, setIssues] = useState<string[]>([]);
  const [evidence, setEvidence] = useState('');
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lookupRef = useRef<HTMLDivElement>(null);

  const lines = linesFor(order);
  const item = lines.find((entry) => entry.key === productId) || null;
  const alreadyReturned = item?.returned || 0;
  const remaining = item?.remaining || 0;
  const waiting = customer.phone ? waitingExchangeOrders(db.getOrders('ALL'), customer.phone, order?.id) : [];
  // The first waiting exchange is linked unless staff choose "Not now".
  const chosenLink = linkExchangeId || waiting[0]?.id || '';
  const linkTo = resolution === 'Exchanged' ? waiting.find((entry) => entry.id === chosenLink) : undefined;
  const brandName = (code: string) => db.getBrands('ALL').find((brand) => brand.code === code)?.name || code;

  const pickOrder = (next: Order | null) => {
    setOrder(next); setErrors({});
    setProductId(firstKey(next)); setQuantity(1);
    if (next && customer.link !== 'LINKED') {
      const owner = db.getCustomerByPhone(next.customerPhone);
      setCustomer(owner ? { phone: phoneDigits(owner.phone), name: owner.name, link: 'LINKED', customer: owner } : { phone: phoneDigits(next.customerPhone), name: next.customerName, link: 'NEW' });
    }
  };
  const pickCustomer = (next: CustomerLookupValue) => {
    setCustomer(next); setErrors({});
    if (next.link !== 'LINKED') { pickOrder(null); return; }
    const own = db.getOrders('ALL').filter((entry) => phoneDigits(entry.customerPhone) === phoneDigits(next.phone) && !entry.exchangeRequested);
    pickOrder(own.length === 1 ? own[0] : null);
  };
  const onEvidence = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Compressed automatically and saved to Google Drive, so any size of phone photo is fine.
    void capturePhoto(event.target.files?.[0], 'reviews', setEvidence);
    event.target.value = '';
  };

  const save = () => guardedSubmit(async () => {
    const problems: Record<string, string> = {};
    if (!order) { const lookup = customerLookupError(customer); if (lookup && customer.link !== 'NEW') problems.customer = lookup; problems.order = 'Pick the order this return belongs to.'; }
    else if (!item) problems.product = 'Choose which product came back.';
    else if (remaining < 1) problems.product = 'Every unit of this product on this order has already been returned.';
    else if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > remaining) problems.quantity = `Enter a quantity between 1 and ${remaining}.`;
    if (!reason) problems.reason = 'Choose the reason.';
    if (order && returnAd < order.orderDateAd) problems.date = 'The return cannot be before the order date.';
    setErrors(problems);
    if (Object.keys(problems).length || !order || !item || !reason) { toast.error('Check the highlighted fields', Object.values(problems)[0]); return; }
    try {
      const days = Math.max(0, Math.round((Date.parse(returnAd) - Date.parse(order.orderDateAd)) / 86400000));
      const recent = db.getReturns('ALL').filter((entry) => phoneDigits(entry.customerPhone) === phoneDigits(order.customerPhone) && Date.parse(entry.dateAd) >= Date.now() - 30 * 86400000).length;
      const saved = db.addReturn({
        orderId: order.id, orderNumber: order.orderNumber, brandCode: item.brandCode || order.brandCode, productId: item.productId, productName: item.productName,
        ...(item.comboId ? { comboId: item.comboId, comboName: item.comboName } : {}),
        customerName: order.customerName, customerPhone: order.customerPhone, dateAd: returnAd, dateBs: returnBs,
        orderProcessedDateAd: order.orderDateAd, orderProcessedDateBs: order.orderDateBs, platform: order.platform, quantity, reasonCategory: reason,
        orderStatus: resolution, valley: valleyOf(order.district), issueCategories: issues, ...(remarks.trim() ? { remarks: remarks.trim() } : {}), ...(evidence ? { evidenceUrl: evidence } : {}),
      });
      let exchangeLinked = false;
      if (linkTo) {
        try { db.linkExchangeOrder(saved.id, linkTo.id); exchangeLinked = true; }
        catch (problem) { toast.error('Return saved, exchange not linked', problem instanceof Error ? problem.message : 'Link it from the Returns page.'); }
      }
      try { await syncManager.forceSyncNow(); } catch { /* The return stays in the sync queue. */ }
      const what = item.comboName ? `${item.productName} (from ${item.comboName})` : item.productName;
      toast.success(`Return logged for ${displayDocumentId(order.orderNumber)}`, `${quantity}× ${what} · ${reason}${exchangeLinked ? ` · exchange ${displayDocumentId(linkTo!.orderNumber)} linked` : ''}`,
        hasAccess(user, 'customers') && onViewCustomer ? { label: 'View customer', onClick: () => onViewCustomer(phoneDigits(order.customerPhone)) } : undefined);
      onSaved({ returnId: saved.id, resolution, customerName: order.customerName, customerPhone: phoneDigits(order.customerPhone), productId: item.productId, productName: what, isSerialReturner: recent + 1 >= 3, timeToReturnDays: days, exchangeLinked });
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'The return could not be saved.'); }
  });

  if (!canPerform(user, 'reviews', 'CREATE') && !canPerform(user, 'order_desk', 'CREATE')) return null;
  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary disabled:opacity-50">Cancel</button>
      <button type="button" onClick={save} disabled={isSubmitting} className="btn btn-primary disabled:cursor-not-allowed disabled:bg-blue-300">{isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Saving…</> : 'Log return'}</button>
    </div>
  );

  return (
    <SlideOverPanel isOpen onClose={isSubmitting ? () => {} : onClose} width="lg" title="Log a product return" subtitle="A product that came back after delivery. Failed deliveries are logged separately." footer={footer}>
      <div className="space-y-5 p-5 text-xs">
        <section ref={lookupRef}>
          <p className="mb-2 text-[11px] font-bold text-slate-500">1 · Customer</p>
          <CustomerLookup value={customer} onChange={pickCustomer} autoFocus error={errors.customer} />
        </section>

        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-500">2 · Order</p>
          <OrderPicker required customerPhone={customer.link === 'LINKED' || customer.link === 'NEW' ? customer.phone : ''} selectedId={order?.id || ''} onSelect={pickOrder} error={errors.order}
            onCheckNumber={() => { setCustomer(EMPTY_CUSTOMER_LOOKUP); pickOrder(null); lookupRef.current?.querySelector('input')?.focus(); }} />
        </section>

        {order && (
          <>
            {order.status !== 'DELIVERED' && order.status !== 'RETURNED' && order.status !== 'EXCHANGED' && (
              <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1"><strong>This order is not marked Delivered.</strong> If the customer received it, mark it delivered first. If the parcel never reached them, log a delivery failure instead.</span>
                {canWorkOrders(user) && order.status !== 'CANCELLED' && (
                  <button type="button" onClick={() => { try { const updated = db.setOrderStatus(order.id, 'DELIVERED'); if (updated) { setOrder(updated); toast.success(`${displayDocumentId(order.orderNumber)} marked delivered`); } } catch (problem) { toast.error('Status not changed', problem instanceof Error ? problem.message : undefined); } }}
                    className="shrink-0 self-center rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100">Mark delivered</button>
                )}</p>
            )}
            <section>
              <p className="mb-2 text-[11px] font-bold text-slate-500">From the order</p>
              <div className="flex flex-wrap gap-1.5">
                {[['Customer', order.customerName], ['Brand', brandName(order.brandCode)], ['Ordered', formatDate(order.orderDateAd, order.orderDateBs)], ['Platform', order.platform], ['Valley', valleyOf(order.district)]].map(([term, detail]) => (
                  <span key={term} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1"><span className="text-slate-500">{term}:</span> <strong className="text-slate-900">{detail}</strong></span>
                ))}
              </div>
            </section>
            <section>
              <span className="mb-1.5 block font-bold text-slate-700">Which product came back? <span className="text-rose-600">*</span></span>
              <div className="space-y-1.5" role="radiogroup" aria-label="Returned product">
                {lines.map((entry) => { const on = entry.key === productId; const done = entry.remaining < 1; return (
                  <button key={entry.key} type="button" role="radio" aria-checked={on} disabled={done && !on} onClick={() => { setProductId(entry.key); setQuantity(1); setErrors({}); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${entry.comboId ? 'ml-5 w-[calc(100%-1.25rem)]' : ''} ${on ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}`}>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{entry.wholeCombo ? `Whole combo: ${entry.productName}` : entry.productName}</span>
                      {entry.comboId && <span className="block text-[11px] text-slate-500">One product from {entry.comboName}</span>}
                    </span>
                    <span className="shrink-0 text-slate-500">{done ? 'all returned' : `${entry.ordered - entry.remaining > 0 ? `${entry.remaining} of ` : ''}${entry.ordered} ${entry.wholeCombo ? 'set' : 'unit'}${entry.ordered === 1 ? '' : 's'}`}</span>
                  </button>
                ); })}
              </div>
              {errors.product && <p className="mt-1 text-[11px] font-medium text-rose-600">{errors.product}</p>}
              {item && remaining > 1 && (
                <div className="mt-2 max-w-[160px]">
                  <label htmlFor="return-quantity" className="mb-1 block font-bold text-slate-700">Quantity returned</label>
                  <NumberInput id="return-quantity" type="number" min={1} max={remaining} value={quantity} onChange={(event) => setQuantity(Math.round(Number(event.target.value)) || 1)} className={`${field} ${errors.quantity ? 'border-rose-400' : ''}`} />
                  {errors.quantity && <p className="mt-1 text-[11px] font-medium text-rose-600">{errors.quantity}</p>}
                </div>
              )}
              {item && alreadyReturned > 0 && <p className="mt-1 text-[11px] text-amber-700">{alreadyReturned} of {item.ordered} already returned on this order.</p>}
            </section>
          </>
        )}

        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-500">3 · Reason</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Return reason">
            {REASONS.map((entry) => (
              <button key={entry} type="button" role="radio" aria-checked={reason === entry} onClick={() => { setReason(entry); setErrors((current) => ({ ...current, reason: '' })); }}
                className={`rounded-xl border px-3 py-1.5 font-bold transition ${reason === entry ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`}>{entry}</button>
            ))}
          </div>
          {errors.reason && <p className="mt-1 text-[11px] font-medium text-rose-600">{errors.reason}</p>}
          {reason === 'Wrong product sent' && <p className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-900">If we packed the wrong product, cancel and use <strong>Log packing error</strong> instead. That keeps it off the customer’s return count and karma, and tracks what should have been sent.</p>}
        </section>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DualDateField id="return-date" label="Return date" required valueAd={returnAd} maxAd={getTodayAd()} minAd={order?.orderDateAd} error={errors.date} onChange={(ad, bs) => { if (ad) { setReturnAd(ad); setReturnBs(bs); } }} />
          <div>
            <label htmlFor="return-resolution" className="mb-1 block font-bold text-slate-700">Resolution</label>
            <select id="return-resolution" value={resolution} onChange={(event) => setResolution(event.target.value as ReturnEntry['orderStatus'])} className={field}>
              {RESOLUTIONS.map((entry) => <option key={entry} value={entry}>{entry === 'Pending' ? 'Pending — not decided yet' : entry}</option>)}
            </select>
            {resolution === 'Exchanged' && !waiting.length && <p className="mt-1 text-[11px] text-purple-700">After saving you’ll create or link the replacement order.</p>}
            {resolution !== 'Exchanged' && waiting.length > 0 && <p className="mt-1 text-[11px] text-purple-700">{displayDocumentId(waiting[0].orderNumber)} was saved as an exchange for this customer. Choose Exchanged to link it.</p>}
          </div>
        </div>

        {resolution === 'Exchanged' && waiting.length > 0 && (
          <section className="rounded-xl border border-purple-200 bg-purple-50/60 p-3">
            <p className="mb-2 font-bold text-purple-900">Link the exchange order</p>
            <div className="space-y-1.5" role="radiogroup" aria-label="Exchange order to link">
              {[...waiting.map((entry) => ({ id: entry.id, title: displayDocumentId(entry.orderNumber), detail: `${formatDate(entry.orderDateAd, entry.orderDateBs)} · ${entry.items.map((line) => `${line.quantity}× ${line.productName}`).join(', ')} · NPR ${entry.totalAmount.toLocaleString()} to collect` })),
                { id: 'NONE', title: 'Not now', detail: 'Create or link the replacement after saving' }].map((option) => (
                <button key={option.id} type="button" role="radio" aria-checked={chosenLink === option.id} onClick={() => setLinkExchangeId(option.id)}
                  className={`block w-full rounded-lg border px-3 py-2 text-left ${chosenLink === option.id ? 'border-purple-400 bg-white ring-2 ring-purple-100' : 'border-purple-100 bg-white/60 hover:bg-white'}`}>
                  <span className="font-semibold text-slate-900">{option.title}</span><span className="block truncate text-[11px] text-slate-500">{option.detail}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"><DynamicCheckboxes selectedCategories={issues} onChange={setIssues} /></div>

        <div>
          <span className="mb-1 block font-bold text-slate-700">Evidence photo</span>
          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50">
              <Camera className="h-4 w-4 text-slate-500" /><span>{evidence ? 'Change photo' : 'Add a photo'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={onEvidence} />
            </label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {evidence && <img src={evidence} alt="Return evidence" className="h-12 w-12 rounded-xl border border-slate-300 object-cover" />}
            {evidence && <button type="button" onClick={() => setEvidence('')} className="text-[11px] font-bold text-slate-500 hover:text-rose-600">Remove</button>}
          </div>
        </div>

        <div>
          <label htmlFor="return-remarks" className="mb-1 block font-bold text-slate-700">Remarks</label>
          <input id="return-remarks" value={remarks} maxLength={500} onChange={(event) => setRemarks(event.target.value)} placeholder="What was found on inspection" className={field} />
        </div>
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">Saving follows the existing karma rule for an actual return and adds the return to the customer’s timeline. It is not counted as a delivery failure.</p>
      </div>
    </SlideOverPanel>
  );
}
