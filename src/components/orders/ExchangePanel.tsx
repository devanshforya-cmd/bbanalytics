'use client';

import React, { useMemo, useState } from 'react';
import { Link2, Minus, PackagePlus, Plus, Repeat, Search, Trash2 } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canWorkOrders } from '@/lib/permissions';
import type { ReturnEntry } from '@/lib/types';
import { phoneDigits } from '@/lib/customer-lookup';
import { displayDocumentId } from '@/lib/document-ids';
import { activeOrderOptionNames } from '@/lib/order-options';
import { isSellableCombo } from '@/lib/product-catalog';
import { useOrderOptions } from '@/hooks/useOrderOptions';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { syncManager } from '@/lib/offline-sync';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import { toast } from '@/components/common/Toast';
import { OrderStatusBadge } from '@/components/orders/OrderStatusControl';

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

interface ExchangePanelProps { ret: ReturnEntry; onClose: () => void; onDone?: () => void }

/**
 * Settle a return as an exchange by pointing it at the replacement order: create it now, pre-filled
 * from the original order, or link one that was already created. Either way the replacement is
 * tracked like any order (dispatch, delivery) and feeds the exchange analysis on the Returns page.
 */
export default function ExchangePanel({ ret, onClose, onDone }: ExchangePanelProps) {
  const options = useOrderOptions();
  const { formatDate } = useCalendarPreference();
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const original = ret.orderId ? db.getOrderById(ret.orderId) : undefined;
  const canCreate = !!original && canWorkOrders(db.getCurrentUser(), 'CREATE');
  const [mode, setMode] = useState<'CREATE' | 'LINK'>(canCreate ? 'CREATE' : 'LINK');
  const sameProduct = db.getProducts('ALL').find((product) => product.id === ret.productId);
  const [items, setItems] = useState<{ productId: string; productName: string; brandCode: string; quantity: number }[]>(
    sameProduct ? [{ productId: sameProduct.id, productName: sameProduct.name, brandCode: sameProduct.brandCode, quantity: ret.quantity || 1 }] : []);
  const [amount, setAmount] = useState('0');
  const [deliveryMethod, setDeliveryMethod] = useState(original?.deliveryMethod || '');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [linkId, setLinkId] = useState('');

  const brand = original?.brandCode || ret.brandCode;
  const products = db.getProducts('ALL');
  const catalogue = useMemo(() => [
    ...products.filter((product) => product.active !== false && product.brandCode === brand).map((product) => ({ id: product.id, name: product.name, brandCode: product.brandCode, combo: false })),
    ...db.getCombos('ALL').filter((combo) => combo.brandCode === brand && isSellableCombo(combo, products)).map((combo) => ({ id: combo.id, name: combo.name, brandCode: combo.brandCode, combo: true })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [brand, products.length]);
  const term = query.trim().toLowerCase();
  const pickable = catalogue.filter((entry) => !term || entry.name.toLowerCase().includes(term)).slice(0, 30);
  const linkedElsewhere = new Set(db.getReturns('ALL').filter((entry) => entry.id !== ret.id && entry.exchangeOrderId).map((entry) => entry.exchangeOrderId));
  const candidates = db.getOrders('ALL')
    .filter((order) => phoneDigits(order.customerPhone) === phoneDigits(ret.customerPhone) && order.id !== ret.orderId && !linkedElsewhere.has(order.id))
    .sort((a, b) => b.orderDateAd.localeCompare(a.orderDateAd));
  const deliveryMethods = activeOrderOptionNames(options, 'deliveryMethods', original?.deliveryMethod);

  const save = () => guardedSubmit(async () => {
    try {
      if (mode === 'CREATE') {
        if (!items.length) { toast.error('Add the product to send'); return; }
        const value = Number(amount);
        if (!Number.isFinite(value) || value < 0) { toast.error('Enter the amount to collect', 'Use 0 when the replacement is free.'); return; }
        const order = db.createExchangeOrder(ret.id, { items, amountToCollect: value, deliveryMethod, notes });
        try { await syncManager.forceSyncNow(); } catch { /* Queued and retried. */ }
        toast.success('Replacement order created', `${displayDocumentId(db.getOrderById(order.id)?.orderNumber || order.orderNumber)} is pending dispatch and linked to this return.`);
      } else {
        if (!linkId) { toast.error('Choose the replacement order'); return; }
        db.linkExchangeOrder(ret.id, linkId);
        try { await syncManager.forceSyncNow(); } catch { /* Queued and retried. */ }
        toast.success('Exchange linked', `${displayDocumentId(db.getOrderById(linkId)?.orderNumber || '')} is now the replacement for this return.`);
      }
      onDone?.(); onClose();
    } catch (error) { toast.error('Exchange not saved', error instanceof Error ? error.message : 'Please try again.'); }
  });

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Later</button>
      <button type="button" onClick={save} disabled={isSubmitting} className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700 disabled:bg-purple-300">
        {isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Saving…</> : mode === 'CREATE' ? 'Create replacement order' : 'Link order'}
      </button>
    </div>
  );

  return (
    <SlideOverPanel isOpen onClose={isSubmitting ? () => {} : onClose} width="lg" title="Exchange" subtitle={`${ret.quantity}× ${ret.productName} returned by ${ret.customerName} · ${ret.reasonCategory}`} footer={footer}>
      <div className="space-y-5 p-5 text-xs">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to record the exchange">
          {([['CREATE', 'Create replacement order', 'Pre-filled from the original order', Repeat], ['LINK', 'Link an existing order', 'The replacement was already entered', Link2]] as const).map(([value, title, hint, Icon]) => (
            <button key={value} type="button" role="radio" aria-checked={mode === value} disabled={value === 'CREATE' && !canCreate} onClick={() => setMode(value)}
              className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${mode === value ? 'border-purple-400 bg-purple-50 ring-2 ring-purple-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
              <span className="flex items-center gap-1.5 font-bold text-slate-900"><Icon className="h-3.5 w-3.5 text-purple-600" />{title}</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">{hint}</span>
            </button>
          ))}
        </div>
        {!original && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">The original order is not available, so a replacement cannot be pre-filled. Link the replacement order instead.</p>}

        {mode === 'CREATE' && original && (
          <>
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
              Sending to <strong className="text-slate-900">{original.customerName}</strong> · {original.customerPhone} · {original.address}{original.district ? `, ${original.district}` : ''}.
              <span className="block">Same brand and channel as {displayDocumentId(original.orderNumber)}. You can edit the replacement order like any other order after saving.</span>
            </section>
            <section>
              <p className="mb-2 font-bold text-slate-700">What are we sending? <span className="text-rose-500">*</span></p>
              {items.length > 0 && (
                <ul className="mb-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {items.map((item) => (
                    <li key={item.productId} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="truncate font-semibold text-slate-900">{item.productName}</span>
                      <span className="flex items-center gap-1">
                        <button type="button" aria-label={`One fewer ${item.productName}`} disabled={item.quantity <= 1} onClick={() => setItems((rows) => rows.map((row) => row.productId === item.productId ? { ...row, quantity: row.quantity - 1 } : row))} className="rounded-lg border border-slate-200 p-1 disabled:opacity-40"><Minus className="h-3 w-3" /></button>
                        <span className="w-6 text-center font-bold">{item.quantity}</span>
                        <button type="button" aria-label={`One more ${item.productName}`} onClick={() => setItems((rows) => rows.map((row) => row.productId === item.productId ? { ...row, quantity: Math.min(99, row.quantity + 1) } : row))} className="rounded-lg border border-slate-200 p-1"><Plus className="h-3 w-3" /></button>
                        <button type="button" aria-label={`Remove ${item.productName}`} onClick={() => setItems((rows) => rows.filter((row) => row.productId !== item.productId))} className="ml-1 rounded-lg p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="rounded-xl border border-slate-200">
                <div className="relative border-b border-slate-100">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input aria-label="Search products to send" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Same product, a different shade, or a combo" className="w-full rounded-t-xl bg-transparent py-2 pl-8 pr-3 outline-none" />
                </div>
                <ul className="max-h-40 overflow-y-auto">
                  {pickable.map((entry) => { const added = items.some((row) => row.productId === entry.id); return (
                    <li key={entry.id}>
                      <button type="button" disabled={added} onClick={() => setItems((rows) => [...rows, { productId: entry.id, productName: entry.name, brandCode: entry.brandCode, quantity: 1 }])}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-purple-50 disabled:text-slate-400">
                        <span className="truncate">{entry.name}{entry.combo && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[9px] font-bold uppercase text-amber-800">Combo</span>}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700">{added ? 'Added' : <><PackagePlus className="h-3 w-3" /> Add</>}</span>
                      </button>
                    </li>
                  ); })}
                  {!pickable.length && <li className="p-3 text-center text-slate-500">No product matches.</li>}
                </ul>
              </div>
            </section>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="exchange-amount" className="mb-1 block font-bold text-slate-700">Amount to collect (NPR)</label>
                <input id="exchange-amount" type="number" min={0} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className={field} />
                <p className="mt-1 text-[11px] text-slate-500">0 for a free replacement. Any price difference is collected on delivery.</p>
              </div>
              <div>
                <label htmlFor="exchange-delivery" className="mb-1 block font-bold text-slate-700">Delivery method</label>
                <select id="exchange-delivery" value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value)} className={field}>
                  {deliveryMethods.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="exchange-notes" className="mb-1 block font-bold text-slate-700">Notes</label>
              <input id="exchange-notes" value={notes} maxLength={300} onChange={(event) => setNotes(event.target.value)} placeholder="For example: collect the damaged unit from the customer" className={field} />
            </div>
          </>
        )}

        {mode === 'LINK' && (
          <section>
            <p className="mb-2 font-bold text-slate-700">Which order is the replacement? <span className="text-rose-500">*</span></p>
            {!candidates.length ? <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-slate-500">This customer has no other order to link. Create the replacement order instead.</p> : (
              <ul className="max-h-72 space-y-1.5 overflow-y-auto" role="radiogroup" aria-label="Replacement order">
                {candidates.map((order) => (
                  <li key={order.id}>
                    <button type="button" role="radio" aria-checked={linkId === order.id} onClick={() => setLinkId(order.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left ${linkId === order.id ? 'border-purple-400 bg-purple-50 ring-2 ring-purple-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <span className="flex items-center justify-between gap-2"><span className="font-mono font-bold text-slate-900">{displayDocumentId(order.orderNumber)}</span><OrderStatusBadge status={order.status} /></span>
                      <span className="block truncate text-[11px] text-slate-500">{formatDate(order.orderDateAd, order.orderDateBs)} · {order.items.map((item) => `${item.quantity}× ${item.productName}`).join(', ')} · NPR {order.totalAmount.toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </SlideOverPanel>
  );
}
