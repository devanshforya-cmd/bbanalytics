'use client';

import React, { useRef, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import type { Order, ReturnEntry } from '@/lib/types';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { phoneDigits } from '@/lib/customer-lookup';
import { displayDocumentId } from '@/lib/document-ids';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { syncManager } from '@/lib/offline-sync';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import CustomerLookup, { EMPTY_CUSTOMER_LOOKUP, type CustomerLookupValue } from '@/components/common/CustomerLookup';
import OrderPicker from '@/components/common/OrderPicker';
import DualDateField from '@/components/common/DualDateField';
import SearchSelect from '@/components/common/SearchSelect';
import { toast } from '@/components/common/Toast';
import { valleyOf } from '@/app/orderflow/delivery-failures/components/LogFailureForm';
import { TICKET_TYPE_HINT, TICKET_TYPE_LABEL, ticketRef, validateTicketLines, type TicketLine, type TicketType } from '@/lib/order-tickets';

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
export type PackingIssueType = Extract<TicketType, 'SHORT_SHIPPED' | 'WRONG_ITEM'>;

interface Props {
  onClose: () => void;
  onSaved: (ticket: ReturnEntry) => void;
  initialOrder?: Order | null;
  initialType?: PackingIssueType;
}

/** Packing errors: fewer units than ordered, or a different product than ordered. */
export default function OrderIssueForm({ onClose, onSaved, initialOrder = null, initialType = 'SHORT_SHIPPED' }: Props) {
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [type, setType] = useState<PackingIssueType>(initialType);
  const [customer, setCustomer] = useState<CustomerLookupValue>(() => {
    if (!initialOrder) return EMPTY_CUSTOMER_LOOKUP;
    const owner = db.getCustomerByPhone(initialOrder.customerPhone);
    return owner ? { phone: phoneDigits(owner.phone), name: owner.name, link: 'LINKED', customer: owner } : { phone: phoneDigits(initialOrder.customerPhone), name: initialOrder.customerName, link: 'NEW' };
  });
  const [order, setOrder] = useState<Order | null>(initialOrder);
  /** Short shipped: units missing per order line. */
  const [missing, setMissing] = useState<Record<string, number>>({});
  /** Wrong item: what should have gone (from the order) and what went instead (any product). */
  const [shouldHave, setShouldHave] = useState<Record<string, number>>({});
  const [sentWrong, setSentWrong] = useState<{ productId: string; quantity: number }[]>([{ productId: '', quantity: 1 }]);
  const [expectBack, setExpectBack] = useState(true);
  const [packedBy, setPackedBy] = useState('');
  const [dateAd, setDateAd] = useState(getTodayAd());
  const [dateBs, setDateBs] = useState(getTodayBs());
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const lookupRef = useRef<HTMLDivElement>(null);

  const products = db.getProducts('ALL').filter((product) => product.active !== false);
  const productName = (id: string) => products.find((product) => product.id === id)?.name || id;
  const productOptions = products.filter((product) => !order || product.brandCode === order.brandCode || order.items.some((item) => item.brandCode === product.brandCode))
    .map((product) => ({ value: product.id, label: product.name, hint: product.alias || product.sku }));
  const staff = db.getUsers().filter((user) => user.active !== false).map((user) => user.fullName).sort();
  // Order lines grouped by product: the same product can be on two lines.
  const orderLines = order ? Object.values(order.items.reduce<Record<string, { productId: string; productName: string; brandCode: string; quantity: number }>>((acc, item) => {
    const row = acc[item.productId] || { productId: item.productId, productName: item.productName, brandCode: item.brandCode, quantity: 0 };
    row.quantity += item.quantity; acc[item.productId] = row; return acc;
  }, {})) : [];

  const pickOrder = (next: Order | null) => {
    setOrder(next); setMissing({}); setShouldHave({}); setError('');
    if (next && customer.link !== 'LINKED') {
      const owner = db.getCustomerByPhone(next.customerPhone);
      setCustomer(owner ? { phone: phoneDigits(owner.phone), name: owner.name, link: 'LINKED', customer: owner } : { phone: phoneDigits(next.customerPhone), name: next.customerName, link: 'NEW' });
    }
  };
  const pickCustomer = (next: CustomerLookupValue) => {
    setCustomer(next); setError('');
    if (next.link !== 'LINKED') { pickOrder(null); return; }
    const own = db.getOrders('ALL').filter((entry) => phoneDigits(entry.customerPhone) === phoneDigits(next.phone) && !entry.exchangeRequested);
    pickOrder(own.length === 1 ? own[0] : null);
  };

  const buildLines = (): TicketLine[] => {
    if (!order) return [];
    if (type === 'SHORT_SHIPPED') return orderLines.filter((line) => (missing[line.productId] || 0) > 0)
      .map((line) => ({ productId: line.productId, productName: line.productName, brandCode: line.brandCode, kind: 'MISSING', quantity: missing[line.productId] }));
    const right: TicketLine[] = orderLines.filter((line) => (shouldHave[line.productId] || 0) > 0)
      .map((line) => ({ productId: line.productId, productName: line.productName, brandCode: line.brandCode, kind: 'SHOULD_HAVE_SENT', quantity: shouldHave[line.productId] }));
    const wrong: TicketLine[] = sentWrong.filter((row) => row.productId).map((row) => {
      const product = products.find((entry) => entry.id === row.productId);
      return { productId: row.productId, productName: product?.name || row.productId, brandCode: product?.brandCode || order.brandCode, kind: 'SENT_WRONG', quantity: row.quantity };
    });
    return [...wrong, ...right];
  };

  const save = () => guardedSubmit(async () => {
    if (!order) { setError('Pick the order this happened on.'); return; }
    const lines = buildLines();
    const problem = validateTicketLines(type, lines, order);
    if (problem) { setError(problem); toast.error('Check the products', problem); return; }
    try {
      const ticket = db.addOrderIssue({ type, order, lines, dateAd, dateBs, packedBy, remarks, valley: valleyOf(order.district), expectGoodsBack: type === 'WRONG_ITEM' ? expectBack : false });
      try { await syncManager.forceSyncNow(); } catch { /* stays in the sync queue */ }
      toast.success(`${TICKET_TYPE_LABEL[type]} logged as ${ticketRef(ticket)}`, `${displayDocumentId(order.orderNumber)} · ${lines.filter((line) => line.kind !== 'SENT_WRONG').map((line) => `${line.quantity}× ${line.productName}`).join(', ')}`);
      onSaved(ticket);
    } catch (failure) { const message = failure instanceof Error ? failure.message : 'The issue could not be saved.'; setError(message); toast.error(message); }
  });

  const stepper = (value: number, max: number, onChange: (next: number) => void, label: string) => (
    <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))} className="px-2 py-1.5 text-slate-600 disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button>
      <span className="min-w-[2ch] text-center font-mono font-bold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="px-2 py-1.5 text-slate-600 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary disabled:opacity-50">Cancel</button>
      <button type="button" onClick={save} disabled={isSubmitting} className="btn btn-primary disabled:opacity-50">{isSubmitting ? 'Saving…' : `Log ${TICKET_TYPE_LABEL[type].toLowerCase()}`}</button>
    </div>
  );

  return (
    <SlideOverPanel isOpen onClose={isSubmitting ? () => {} : onClose} width="lg" title="Log a packing error" subtitle="The parcel reached the customer, but what we packed was wrong. This is not counted as a customer return." footer={footer}>
      <div className="space-y-5 p-5 text-xs">
        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-500">What went wrong</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Packing error type">
            {(['SHORT_SHIPPED', 'WRONG_ITEM'] as PackingIssueType[]).map((entry) => (
              <button key={entry} type="button" role="radio" aria-checked={type === entry} onClick={() => { setType(entry); setError(''); }}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${type === entry ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}`}>
                <span className="block font-bold text-slate-900">{TICKET_TYPE_LABEL[entry]}</span>
                <span className="block text-[11px] text-slate-500">{TICKET_TYPE_HINT[entry]}</span>
              </button>
            ))}
          </div>
        </section>

        <section ref={lookupRef}>
          <p className="mb-2 text-[11px] font-bold text-slate-500">Customer</p>
          <CustomerLookup value={customer} onChange={pickCustomer} autoFocus={!initialOrder} />
        </section>
        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-500">Order</p>
          <OrderPicker required customerPhone={customer.link === 'LINKED' || customer.link === 'NEW' ? customer.phone : ''} selectedId={order?.id || ''} onSelect={pickOrder}
            onCheckNumber={() => { setCustomer(EMPTY_CUSTOMER_LOOKUP); pickOrder(null); lookupRef.current?.querySelector('input')?.focus(); }} />
        </section>

        {order && type === 'SHORT_SHIPPED' && (
          <section>
            <p className="mb-1 font-bold text-slate-700">How many units were missing? <span className="text-rose-600">*</span></p>
            <p className="mb-2 text-[11px] text-slate-500">Example: the customer ordered 2 and the parcel had 1. Set missing to 1.</p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {orderLines.map((line) => (
                <div key={line.productId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{line.productName}</span><span className="text-[11px] text-slate-500">{line.quantity} ordered</span></span>
                  {stepper(missing[line.productId] || 0, line.quantity, (next) => setMissing((current) => ({ ...current, [line.productId]: next })), `missing ${line.productName}`)}
                </div>
              ))}
            </div>
          </section>
        )}

        {order && type === 'WRONG_ITEM' && (
          <>
            <section>
              <p className="mb-1 font-bold text-slate-700">What should have been sent? <span className="text-rose-600">*</span></p>
              <p className="mb-2 text-[11px] text-slate-500">From the order. Example: ordered Body Wash and Shampoo, but Shampoo was swapped. Set Shampoo to 1.</p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {orderLines.map((line) => (
                  <div key={line.productId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{line.productName}</span><span className="text-[11px] text-slate-500">{line.quantity} ordered</span></span>
                    {stepper(shouldHave[line.productId] || 0, line.quantity, (next) => setShouldHave((current) => ({ ...current, [line.productId]: next })), `${line.productName} not received`)}
                  </div>
                ))}
              </div>
            </section>
            <section>
              <p className="mb-2 font-bold text-slate-700">What was sent instead? <span className="text-rose-600">*</span></p>
              <div className="space-y-2">
                {sentWrong.map((row, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <SearchSelect id={`wrong-${index}`} options={productOptions} value={row.productId} placeholder="Search products" onChange={(value) => setSentWrong((current) => current.map((entry, i) => i === index ? { ...entry, productId: value } : entry))} />
                    </div>
                    <input aria-label="Units sent by mistake" type="number" min={1} value={row.quantity} onChange={(event) => setSentWrong((current) => current.map((entry, i) => i === index ? { ...entry, quantity: Math.max(1, Math.round(Number(event.target.value)) || 1) } : entry))} className="w-20 shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    {sentWrong.length > 1 && <button type="button" aria-label="Remove this product" onClick={() => setSentWrong((current) => current.filter((_, i) => i !== index))} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
                <button type="button" onClick={() => setSentWrong((current) => [...current, { productId: '', quantity: 1 }])} className="text-[11px] font-bold text-blue-700 hover:underline">+ Another wrong product</button>
              </div>
            </section>
            <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <input type="checkbox" checked={expectBack} onChange={(event) => setExpectBack(event.target.checked)} className="mt-0.5 h-4 w-4" />
              <span><strong className="text-slate-900">The wrong product is coming back</strong><span className="block text-[11px] text-slate-500">The ticket stays open until it is received in-house. Untick if the customer keeps it.</span></span>
            </label>
          </>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DualDateField id="issue-date" label="Reported on" required valueAd={dateAd} maxAd={getTodayAd()} minAd={order?.orderDateAd} onChange={(ad, bs) => { if (ad) { setDateAd(ad); setDateBs(bs); } }} />
          <div>
            <label htmlFor="packed-by" className="mb-1 block font-bold text-slate-700">Packed by</label>
            <input id="packed-by" list="packers" value={packedBy} maxLength={120} onChange={(event) => setPackedBy(event.target.value)} placeholder="Who packed this parcel" className={field} />
            <datalist id="packers">{staff.map((name) => <option key={name} value={name} />)}</datalist>
          </div>
        </div>
        <div>
          <label htmlFor="issue-remarks" className="mb-1 block font-bold text-slate-700">Notes</label>
          <input id="issue-remarks" value={remarks} maxLength={500} onChange={(event) => setRemarks(event.target.value)} placeholder="What the customer said, photo sent on WhatsApp, etc." className={field} />
        </div>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-semibold text-rose-700">{error}</p>}
        {order && type === 'WRONG_ITEM' && sentWrong.some((row) => row.productId) && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">Sent {sentWrong.filter((row) => row.productId).map((row) => `${row.quantity}× ${productName(row.productId)}`).join(', ')} by mistake. After saving, open the ticket to create the resend order.</p>
        )}
      </div>
    </SlideOverPanel>
  );
}
