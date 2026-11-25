'use client';

import NumberInput from '@/components/common/NumberInput';
import PagedList from '@/components/common/PagedList';
import Portal from '@/components/common/Portal';
import { nprText } from '@/components/common/Money';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { canPerform, d2cAssignees, hasAccess } from '@/lib/permissions';
import type { Order, OrderItem, ReturnEntry } from '@/lib/types';
import { activeOrderOptionNames } from '@/lib/order-options';
import { useOrderOptions } from '@/hooks/useOrderOptions';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { isSellableCombo, matchingCatalogCombo } from '@/lib/product-catalog';
import { allocate } from '@/lib/offers';
import { diffOrder, editNeedsReason } from '@/lib/order-history';
import { displayDocumentId } from '@/lib/document-ids';
import { phoneDigits } from '@/lib/customer-lookup';
import { getTodayAd } from '@/lib/nepali-calendar';
import { syncManager } from '@/lib/offline-sync';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import NepalLocationFields from '@/components/common/NepalLocationFields';
import CustomerLookup, { customerLookupError, type CustomerLookupValue } from '@/components/common/CustomerLookup';
import DualDateField, { bsLabel } from '@/components/common/DualDateField';
import { toast } from '@/components/common/Toast';
import OrderStatusControl from '@/components/orders/OrderStatusControl';
import ExchangePanel from '@/components/orders/ExchangePanel';
import OrderFollowUps from '@/components/customer-calls/OrderFollowUps';
import LogFailureForm from '@/app/orderflow/delivery-failures/components/LogFailureForm';
import LogReturnForm from '@/app/reviews/returns/components/LogReturnForm';
import OrderIssueForm from '@/components/tickets/OrderIssueForm';
import { TicketBadges } from '@/components/tickets/TicketBadges';
import { ticketRef } from '@/lib/order-tickets';
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Check, History, Layers, Minus, PackageX, Plus, Search, Trash2, Undo2, X } from 'lucide-react';

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';
const PAYMENT = ['COD', 'Prepaid', 'Advance', 'Credit 15 days', 'Credit 30 days'] as const;
const money = (value: number) => `${nprText(Math.round(value * 100) / 100 === Math.round(value) ? Math.round(value).toLocaleString() : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}`;

interface Draft {
  customer: CustomerLookupValue; alternatePhone: string; address: string; province: string; district: string; platform: string;
  orderDateAd: string; orderDateBs: string; paymentTerms: Order['paymentTerms']; deliveryMethod: string; assignedToId: string; notes: string; items: OrderItem[];
}

function draftFrom(order: Order): Draft {
  const customer = db.getCustomerByPhone(order.customerPhone);
  return {
    customer: { phone: phoneDigits(order.customerPhone) || order.customerPhone, name: order.customerName, link: customer ? 'LINKED' : 'NEW', customer },
    alternatePhone: order.alternatePhone || '', address: order.address || '', province: order.province || '', district: order.district || '', platform: order.platform,
    orderDateAd: order.orderDateAd, orderDateBs: order.orderDateBs, paymentTerms: order.paymentTerms, deliveryMethod: order.deliveryMethod,
    assignedToId: order.assignedToId || (order as Order & { createdById?: string }).createdById || '', notes: order.notes || '', items: order.items.map((item) => ({ ...item })),
  };
}

/**
 * The order view. Every saved value is pre-filled and everything can be
 * changed. Saving shows before and after first; the server then records each
 * changed field in a history that cannot be edited.
 */
export default function OrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  const orderOptions = useOrderOptions();
  const { formatDate, preference } = useCalendarPreference();
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [, setVersion] = useState(0);
  const [loaded, setLoaded] = useState(() => db.isWorkspaceLoaded());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [productQuery, setProductQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const loadedVersion = useRef<string>('');
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const [panel, setPanel] = useState<'FAILURE' | 'RETURN' | 'PACKING' | null>(null);
  const [exchangeFor, setExchangeFor] = useState<ReturnEntry | null>(null);

  const order = db.getOrderById(orderId);
  const user = db.getCurrentUser();
  const canEdit = canPerform(user, 'orderflow', 'EDIT');

  useEffect(() => {
    const refresh = () => { setVersion((value) => value + 1); setLoaded(db.isWorkspaceLoaded()); };
    window.addEventListener('bb-db-updated', refresh);
    void db.syncWithSupabase().finally(refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);

  // Fill the form once per order. A later change by someone else shows a notice instead of wiping what is being typed.
  const fingerprint = order ? JSON.stringify([order.customerName, order.customerPhone, order.address, order.items, order.orderDateAd, order.platform, order.paymentTerms, order.deliveryMethod, order.notes, order.assignedToId, order.province, order.district, order.alternatePhone]) : '';
  useEffect(() => {
    if (!order) return;
    if (!draft) { setDraft(draftFrom(order)); loadedVersion.current = fingerprint; return; }
    if (loadedVersion.current && loadedVersion.current !== fingerprint && !isSubmitting) setChangedElsewhere(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  const products = db.getProducts('ALL');
  const combos = db.getCombos('ALL');
  const brandCode = order?.brandCode || '';
  const brandName = (code: string) => db.getBrands('ALL').find((brand) => brand.code === code)?.name || code;
  const isCombo = (productId: string) => combos.some((combo) => combo.id === productId);

  const next: Partial<Order> | null = useMemo(() => {
    if (!order || !draft) return null;
    const itemsChanged = JSON.stringify(draft.items) !== JSON.stringify(order.items);
    const assignee = db.getUsers().find((entry) => entry.id === draft.assignedToId);
    return {
      customerName: draft.customer.name.trim(), customerPhone: phoneDigits(draft.customer.phone) === phoneDigits(order.customerPhone) ? order.customerPhone : phoneDigits(draft.customer.phone),
      alternatePhone: draft.alternatePhone.trim() || undefined, address: draft.address.trim(), province: draft.province.trim(), district: draft.district.trim(), platform: draft.platform,
      orderDateAd: draft.orderDateAd, orderDateBs: draft.orderDateAd === order.orderDateAd ? order.orderDateBs : draft.orderDateBs || bsLabel(draft.orderDateAd),
      paymentTerms: draft.paymentTerms, deliveryMethod: draft.deliveryMethod as Order['deliveryMethod'], notes: draft.notes.trim() || undefined,
      ...(draft.assignedToId && draft.assignedToId !== order.assignedToId ? { assignedToId: draft.assignedToId, assignedToName: assignee?.fullName } : {}),
      ...(itemsChanged ? { items: draft.items, totalAmount: Math.round(draft.items.reduce((sum, item) => sum + item.totalPrice, 0) * 100) / 100 } : {}),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, draft]);
  const changes = order && next ? diffOrder(order, { ...order, ...next }) : [];
  const needsReason = order && next ? editNeedsReason(order, { ...order, ...next }) : false;
  const phoneChanged = order && draft ? phoneDigits(draft.customer.phone) !== phoneDigits(order.customerPhone) : false;

  if (!order || !draft) {
    return (
      <PageGuard feature={["orderflow", "order_desk"]}>
        {!loaded && !order ? (
          <div className="flex min-h-[320px] items-center justify-center" role="status" aria-label="Loading order"><div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
        ) : !order ? (
          <div className="mx-auto my-12 max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
            <h2 className="text-xl font-bold text-slate-900">Order not found</h2>
            <p className="text-xs text-slate-500">This order was deleted, or it is outside your brands or team.</p>
            <Link href="/orderflow/daily-orders" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white"><ArrowLeft className="h-4 w-4" /> Back to daily orders</Link>
          </div>
        ) : null}
      </PageGuard>
    );
  }

  const set = (patch: Partial<Draft>) => { setDraft((current) => current ? { ...current, ...patch } : current); setErrors({}); };
  const assignees = d2cAssignees(user, db.getUsers(), brandCode);
  const assigneeOptions = [...assignees, ...db.getUsers().filter((entry) => entry.id === order.assignedToId && !assignees.some((option) => option.id === entry.id))];
  const attachedFailure = db.getDeliveryFailures('ALL').filter((failure) => failure.orderId === order.id || failure.orderNumber === order.orderNumber).length;
  const orderTickets = db.getOrderIssues('ALL').filter((entry) => entry.orderId === order.id || entry.orderNumber === order.orderNumber);
  const attachedReturn = orderTickets.length;

  // ----- Line items -----
  const setItems = (items: OrderItem[]) => set({ items });
  const setQuantity = (index: number, quantity: number) => {
    const clean = Math.max(1, Math.min(9999, Math.round(quantity) || 1));
    // The price trail scales with the quantity: offer and customer discounts per unit stay the same.
    const scale = (value: number | undefined, from: number) => value === undefined || !from ? value : Math.round((value / from) * clean * 100) / 100;
    setItems(draft.items.map((item, i) => i === index ? { ...item, quantity: clean, totalPrice: Math.round(item.unitPrice * clean * 100) / 100, ...(item.discountAmount !== undefined && item.catalogUnitPrice !== undefined ? { discountAmount: Math.round((item.catalogUnitPrice - item.unitPrice) * clean * 100) / 100 } : {}),
      ...(item.offerDiscount !== undefined ? { offerDiscount: scale(item.offerDiscount, item.quantity) } : {}), ...(item.customerDiscount !== undefined ? { customerDiscount: scale(item.customerDiscount, item.quantity) } : {}) } : item));
  };
  const addCatalogueItem = (id: string) => {
    const existing = draft.items.findIndex((item) => item.productId === id);
    if (existing >= 0) { setQuantity(existing, draft.items[existing].quantity + 1); return; }
    const product = products.find((entry) => entry.id === id);
    const combo = combos.find((entry) => entry.id === id);
    const price = product ? product.mrp : combo ? combo.comboPrice || combo.comboMrp || 0 : 0;
    const chosen = product || combo;
    if (!chosen) return;
    // A line added today is priced at today's catalogue price, and that price is kept with it.
    setItems([...draft.items, { productId: chosen.id, productName: chosen.name, brandCode: chosen.brandCode, quantity: 1, unitPrice: price, totalPrice: price, catalogUnitPrice: price }]);
  };
  /** A combo line that needs changing is opened into its products, at their own prices. */
  const expandCombo = (index: number) => {
    const line = draft.items[index];
    const combo = combos.find((entry) => entry.id === line.productId);
    if (!combo) return;
    // The amount the customer paid for the combo stays the same: it is shared out over the products in
    // proportion to their prices in the combo, never re-priced at today's catalogue prices.
    const weights = combo.items.map((part) => Math.round((part.mrp || products.find((entry) => entry.id === part.productId)?.mrp || 0) * 100) * part.quantity);
    const shares = allocate(Math.round(line.totalPrice * 100), weights.some((weight) => weight > 0) ? weights : weights.map(() => 1));
    const parts: OrderItem[] = combo.items.map((part, i) => {
      const product = products.find((entry) => entry.id === part.productId);
      const quantity = part.quantity * line.quantity;
      const total = shares[i] / 100;
      const listPrice = part.mrp || product?.mrp || 0;
      return { productId: part.productId, productName: product?.name || part.productName || 'Product', brandCode: product?.brandCode || combo.brandCode, quantity,
        unitPrice: Math.round((total / quantity) * 100) / 100, totalPrice: total, catalogUnitPrice: listPrice, discountAmount: Math.round((listPrice * quantity - total) * 100) / 100 };
    });
    const rest = draft.items.filter((_, i) => i !== index);
    for (const part of parts) {
      const at = rest.findIndex((item) => item.productId === part.productId && !item.isGift && item.catalogUnitPrice === part.catalogUnitPrice);
      if (at >= 0) { const quantity = rest[at].quantity + part.quantity; const totalPrice = Math.round((rest[at].totalPrice + part.totalPrice) * 100) / 100; rest[at] = { ...rest[at], quantity, totalPrice, unitPrice: Math.round((totalPrice / quantity) * 100) / 100 }; }
      else rest.push(part);
    }
    setItems(rest);
    toast.info(`${combo.name} opened into its products`, 'Prices are now the single-product prices. Check the total before saving.');
  };
  // If the product lines now form a saved combo, offer to collapse them (same rule as the extractor).
  const plainLines = draft.items.filter((item) => !isCombo(item.productId));
  const comboLines = draft.items.filter((item) => isCombo(item.productId));
  const detected = plainLines.length && plainLines.every((item) => item.catalogUnitPrice === undefined || item.catalogUnitPrice === item.unitPrice)
    ? matchingCatalogCombo(combos, products.filter((product) => product.active !== false), plainLines.map((item) => ({ productId: item.productId, quantity: item.quantity })), brandCode) : null;
  const collapse = () => {
    if (!detected) return;
    setItems([...comboLines, { productId: detected.id, productName: detected.name, brandCode, quantity: 1, unitPrice: detected.comboPrice, totalPrice: detected.comboPrice }]);
    toast.success(`Collapsed into ${detected.name}`, `Saves ${money(detected.savings)} against single prices.`);
  };
  const term = productQuery.trim().toLowerCase();
  const pickable = [
    ...products.filter((product) => product.active !== false && product.brandCode === brandCode).map((product) => ({ id: product.id, name: product.name, price: product.mrp, combo: false })),
    ...combos.filter((combo) => combo.brandCode === brandCode && isSellableCombo(combo, products)).map((combo) => ({ id: combo.id, name: combo.name, price: combo.comboPrice || combo.comboMrp || 0, combo: true })),
  ].filter((entry) => !term || entry.name.toLowerCase().includes(term));
  const draftTotal = JSON.stringify(draft.items) === JSON.stringify(order.items) ? order.totalAmount : draft.items.reduce((sum, item) => sum + item.totalPrice, 0);

  const review = () => {
    const problems: Record<string, string> = {};
    const lookup = customerLookupError(draft.customer);
    if (lookup) problems.customer = lookup;
    else if (!draft.customer.name.trim()) problems.customer = 'Enter the customer name.';
    if (!draft.address.trim()) problems.address = 'Enter the delivery address.';
    if (!draft.orderDateAd) problems.date = 'Choose the order date.';
    if (draft.orderDateAd > getTodayAd()) problems.date = 'The order date cannot be in the future.';
    if (!draft.items.length) problems.items = 'An order needs at least one product.';
    setErrors(problems);
    if (Object.keys(problems).length) { toast.error('Check the highlighted fields', Object.values(problems)[0]); return; }
    if (!changes.length) { toast.info('Nothing has changed', 'Edit a field first, then save.'); return; }
    setConfirming(true);
  };

  const save = () => guardedSubmit(async () => {
    if (!next) return;
    if (needsReason && !reason.trim()) { toast.error('A reason is required', 'Say briefly why the phone number or date is changing.'); return; }
    try {
      const updated = db.updateOrder(order.id, next, user.fullName, reason.trim() || undefined);
      if (!updated) throw new Error('This order is no longer available. Refresh and try again.');
      try { await syncManager.forceSyncNow(); } catch { /* The edit stays in the device sync queue. */ }
      const stuck = syncManager.getWorkspaceMutations().some((mutation) => mutation.collection === 'orders' && mutation.id === order.id);
      const fresh = db.getOrderById(order.id) || updated;
      loadedVersion.current = ''; setChangedElsewhere(false);
      setDraft(draftFrom(fresh)); setConfirming(false); setReason('');
      if (stuck) toast.warning(`Order ${displayDocumentId(order.orderNumber)} is waiting to sync`, 'Open Sync status to see why. Your change is kept on this device.');
      else toast.success(`Order ${displayDocumentId(order.orderNumber)} updated`, `${changes.length} change${changes.length === 1 ? '' : 's'} saved and recorded in the history.`,
        hasAccess(user, 'customers') ? { label: 'View customer', onClick: () => router.push(`/customers/${phoneDigits(fresh.customerPhone)}`) } : undefined);
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'The order could not be updated.'); }
  });

  const history = order.editHistory || [];
  const grouped = history.reduce<{ key: string; entries: typeof history }[]>((groups, entry) => {
    const key = `${entry.timestamp}|${entry.changedBy}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry); else groups.push({ key, entries: [entry] });
    return groups;
  }, []);
  const stamp = (iso: string) => { const day = iso.slice(0, 10); return `${preference === 'AD' ? day : bsLabel(day)} · ${new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; };

  return (
    <PageGuard feature={["orderflow", "order_desk"]}>
      <div className="mx-auto max-w-6xl space-y-5 pb-28">
        <Breadcrumbs items={[{ label: 'Online orders', href: '/orderflow/daily-orders' }, { label: 'Daily orders', href: '/orderflow/daily-orders' }, { label: displayDocumentId(order.orderNumber) }]} />

        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-black tracking-tight text-slate-900">{displayDocumentId(order.orderNumber)}</h1>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">{brandName(order.brandCode)}</span>

            </div>
            <p className="mt-1 text-xs text-slate-500">
              Ordered {formatDate(order.orderDateAd, order.orderDateBs)} · {order.source === 'WHATSAPP_EXTRACTOR' || order.source === 'Extractor' ? 'WhatsApp extractor' : order.source === 'FIELD_CALL' || order.source === 'Field' ? 'Field call' : 'Manual entry'}
              {order.legacyOrderNumber && <> · earlier ID <span className="font-mono">{order.legacyOrderNumber}</span></>}
            </p>
          </div>
          <Link href="/orderflow/daily-orders" className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 sm:self-center"><ArrowLeft className="h-3.5 w-3.5" /> Daily orders</Link>
        </div>

        <section aria-labelledby="order-status" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="order-status" className="text-sm font-bold text-slate-900">Delivery status</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Pending → Dispatched → Delivered. A failed attempt is logged in Delivery Failures; returns and exchanges in Returns.</p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <OrderStatusControl order={order} onChanged={() => setVersion((value) => value + 1)} />
            <div className="flex flex-wrap gap-2">
              {(canPerform(user, 'orderflow', 'CREATE') || canPerform(user, 'order_desk', 'CREATE')) && !['DELIVERED', 'CANCELLED', 'RETURNED', 'EXCHANGED'].includes(order.status) && (
                <button type="button" onClick={() => setPanel('FAILURE')} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-50"><PackageX className="h-3.5 w-3.5" /> Log failed delivery</button>
              )}
              {(canPerform(user, 'reviews', 'CREATE') || canPerform(user, 'order_desk', 'CREATE')) && order.status !== 'CANCELLED' && (
                <button type="button" onClick={() => setPanel('RETURN')} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-50"><Undo2 className="h-3.5 w-3.5" /> Log return or exchange</button>
              )}
              {(canPerform(user, 'reviews', 'CREATE') || canPerform(user, 'order_desk', 'CREATE') || canPerform(user, 'orderflow', 'CREATE')) && ['DELIVERED', 'RETURNED', 'EXCHANGED'].includes(order.status) && (
                <button type="button" onClick={() => setPanel('PACKING')} className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-orange-800 hover:bg-orange-50"><PackageX className="h-3.5 w-3.5" /> Log packing error</button>
              )}
            </div>
          </div>
        </section>
        {panel === 'FAILURE' && <LogFailureForm initialOrder={order} onClose={() => setPanel(null)} onSaved={() => { setPanel(null); setVersion((value) => value + 1); }} />}
        {panel === 'RETURN' && <LogReturnForm initialOrder={order} onClose={() => setPanel(null)}
          onSaved={(summary) => { setPanel(null); setVersion((value) => value + 1); if (summary.resolution === 'Exchanged' && !summary.exchangeLinked) { const saved = db.getReturns('ALL').find((entry) => entry.id === summary.returnId); if (saved) setExchangeFor(saved); } }} />}
        {exchangeFor && <ExchangePanel ret={exchangeFor} onClose={() => setExchangeFor(null)} onDone={() => setVersion((value) => value + 1)} />}
        {panel === 'PACKING' && <OrderIssueForm initialOrder={order} onClose={() => setPanel(null)} onSaved={() => { setPanel(null); setVersion((value) => value + 1); }} />}
        {orderTickets.length > 0 && (
          <section aria-labelledby="order-tickets" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <h2 id="order-tickets" className="text-sm font-bold text-slate-900">Issues on this order</h2>
            <ul className="mt-2 divide-y divide-slate-100 text-xs">
              {orderTickets.map((entry) => (
                <li key={entry.id}><Link href={`/reviews/returns?ticket=${encodeURIComponent(entry.id)}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:text-blue-700">
                  <span><span className="font-mono font-bold">{ticketRef(entry)}</span> <span className="text-slate-600">{entry.productName} · {entry.dateAd}</span></span><TicketBadges entry={entry} />
                </Link></li>
              ))}
            </ul>
          </section>
        )}

        {!canEdit && <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">You can view this order. Editing needs the OrderFlow edit permission.</p>}
        {changedElsewhere && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900" role="status">
            <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Someone else saved a change to this order.</strong> If you save now, your fields win and both versions are kept in the history.</span></span>
            <button type="button" onClick={() => { setDraft(draftFrom(order)); loadedVersion.current = fingerprint; setChangedElsewhere(false); }} className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 font-bold hover:bg-amber-100">Load their version</button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
          <fieldset disabled={!canEdit} className="min-w-0 space-y-5">
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="order-customer">
              <h2 id="order-customer" className="text-sm font-bold text-slate-900">Customer</h2>
              <CustomerLookup value={draft.customer} onChange={(customer) => set({ customer })} error={errors.customer} savedPhone={order.customerPhone} />
              {phoneChanged && (
                <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
                  This order will move to {draft.customer.link === 'LINKED' ? <strong>{draft.customer.customer?.name}</strong> : 'a new customer profile'}. Order counts, last order date and brands are recounted for both numbers.
                  {(attachedFailure > 0 || attachedReturn > 0) && <span className="mt-1 block font-semibold text-amber-800">This order has {[attachedFailure && `${attachedFailure} delivery failure${attachedFailure === 1 ? '' : 's'}`, attachedReturn && `${attachedReturn} return${attachedReturn === 1 ? '' : 's'}`].filter(Boolean).join(' and ')} attached. They stay on the order and keep the number they were logged with.</span>}
                </p>
              )}
              <div>
                <label htmlFor="order-alt-phone" className="mb-1 block text-xs font-bold text-slate-700">Alternate phone</label>
                <input id="order-alt-phone" type="tel" value={draft.alternatePhone} maxLength={20} onChange={(event) => set({ alternatePhone: event.target.value })} className={`${field} font-mono`} />
              </div>
              <div>
                <label htmlFor="order-address" className="mb-1 block text-xs font-bold text-slate-700">Delivery address <span className="text-rose-600">*</span></label>
                <input id="order-address" value={draft.address} maxLength={500} onChange={(event) => set({ address: event.target.value })} className={`${field} ${errors.address ? 'border-rose-400 bg-rose-50/30' : ''}`} />
                {errors.address && <p className="mt-1 text-[11px] font-medium text-rose-600">{errors.address}</p>}
              </div>
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <NepalLocationFields idPrefix="order-location" province={draft.province} city={draft.district} onChange={(location) => set({ province: location.province, district: location.city })} />
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="order-items">
              <div className="flex items-center justify-between">
                <h2 id="order-items" className="text-sm font-bold text-slate-900">Products</h2>
                <span className="text-sm font-black text-slate-900">{money(draftTotal)}</span>
              </div>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {draft.items.map((item, index) => (
                  <li key={`${item.productId}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-900">{isCombo(item.productId) && <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700"><Layers className="h-3 w-3" /> Combo</span>}<span className="truncate">{item.productName}</span></span>
                      <span className="text-[11px] text-slate-500">{money(item.unitPrice)} each{item.catalogUnitPrice !== undefined && item.catalogUnitPrice !== item.unitPrice ? ` (list ${money(item.catalogUnitPrice)})` : ''}</span>
                      {isCombo(item.productId) && canEdit && <button type="button" onClick={() => expandCombo(index)} className="ml-2 text-[11px] font-bold text-blue-700 hover:underline">Change what is inside</button>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" aria-label={`One fewer ${item.productName}`} onClick={() => setQuantity(index, item.quantity - 1)} disabled={item.quantity <= 1} className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Minus className="h-3 w-3" /></button>
                      <NumberInput aria-label={`Quantity of ${item.productName}`} type="number" min={1} max={9999} value={item.quantity} onChange={(event) => setQuantity(index, Number(event.target.value))} className="w-14 rounded-lg border border-slate-200 py-1 text-center font-bold disabled:bg-slate-50" />
                      <button type="button" aria-label={`One more ${item.productName}`} onClick={() => setQuantity(index, item.quantity + 1)} className="rounded-lg border border-slate-200 p-1 text-slate-600 hover:bg-slate-50"><Plus className="h-3 w-3" /></button>
                      <span className="w-24 text-right font-bold text-slate-900">{money(item.totalPrice)}</span>
                      <button type="button" aria-label={`Remove ${item.productName}`} onClick={() => setItems(draft.items.filter((_, i) => i !== index))} className="rounded-lg p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  </li>
                ))}
                {!draft.items.length && <li className="px-3 py-4 text-center text-xs text-slate-500">No products on this order.</li>}
              </ul>
              {errors.items && <p className="text-[11px] font-medium text-rose-600">{errors.items}</p>}
              {detected && canEdit && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
                  <span>These products make the <strong>{detected.name}</strong> combo at {money(detected.comboPrice)} (saves {money(detected.savings)}).</span>
                  <button type="button" onClick={collapse} className="rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-700">Collapse into combo</button>
                </div>
              )}
              {canEdit && (!showPicker ? (
                <button type="button" onClick={() => setShowPicker(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-blue-300 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" /> Add a product or combo</button>
              ) : (
                <div className="rounded-xl border border-slate-200">
                  <div className="flex items-center border-b border-slate-100">
                    <Search className="ml-3 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <input autoFocus aria-label="Search the catalogue" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder={`Search ${brandName(brandCode)} products and combos`} className="w-full bg-transparent px-2 py-2 text-xs outline-none" />
                    <button type="button" aria-label="Close product search" onClick={() => { setShowPicker(false); setProductQuery(''); }} className="mr-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>
                  </div>
                  <ul className="max-h-52 overflow-y-auto">
                    {pickable.map((entry) => (
                      <li key={entry.id}><button type="button" onClick={() => addCatalogueItem(entry.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50">
                        <span className="flex min-w-0 items-center gap-1.5">{entry.combo && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700">Combo</span>}<span className="truncate font-medium text-slate-800">{entry.name}</span></span>
                        <span className="shrink-0 font-bold text-slate-600">{money(entry.price)} <Plus className="ml-1 inline h-3 w-3 text-blue-600" /></span>
                      </button></li>
                    ))}
                    {!pickable.length && <li className="p-4 text-center text-xs text-slate-500">{term ? 'Nothing in the catalogue matches.' : `No active ${brandName(brandCode)} products are saved.`}</li>}
                  </ul>
                </div>
              ))}
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="order-details">
              <h2 id="order-details" className="text-sm font-bold text-slate-900">Order details</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="order-platform" className="mb-1 block text-xs font-bold text-slate-700">Platform</label>
                  <select id="order-platform" value={draft.platform} onChange={(event) => set({ platform: event.target.value })} className={field}>
                    {activeOrderOptionNames(orderOptions, 'channels', order.platform).map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <DualDateField id="order-date" label="Order date" required valueAd={draft.orderDateAd} maxAd={getTodayAd()} error={errors.date} onChange={(ad, bs) => set({ orderDateAd: ad, orderDateBs: bs })} />
                <div>
                  <label htmlFor="order-payment" className="mb-1 block text-xs font-bold text-slate-700">Payment status</label>
                  <select id="order-payment" value={draft.paymentTerms} onChange={(event) => set({ paymentTerms: event.target.value as Order['paymentTerms'] })} className={field}>
                    {PAYMENT.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="order-delivery" className="mb-1 block text-xs font-bold text-slate-700">Delivery method</label>
                  <select id="order-delivery" value={draft.deliveryMethod} onChange={(event) => set({ deliveryMethod: event.target.value })} className={field}>
                    {activeOrderOptionNames(orderOptions, 'deliveryMethods', order.deliveryMethod).map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="order-assignee" className="mb-1 block text-xs font-bold text-slate-700">Responsible person</label>
                  <select id="order-assignee" value={draft.assignedToId} onChange={(event) => set({ assignedToId: event.target.value })} className={field}>
                    {!assigneeOptions.some((entry) => entry.id === draft.assignedToId) && <option value={draft.assignedToId}>{order.assignedToName || 'Not assigned'}</option>}
                    {assigneeOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.fullName}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="order-notes" className="mb-1 block text-xs font-bold text-slate-700">Remarks</label>
                <textarea id="order-notes" rows={2} value={draft.notes} maxLength={1000} onChange={(event) => set({ notes: event.target.value })} className={field} />
              </div>
            </section>
          </fieldset>

          <aside className="space-y-5">
            <OrderFollowUps order={order} />
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="order-history">
              <h2 id="order-history" className="flex items-center gap-2 text-sm font-bold text-slate-900"><History className="h-4 w-4 text-slate-500" /> Edit history</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">Recorded by the system on every save. It cannot be edited.</p>
              {!grouped.length ? <p className="mt-3 rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">This order has not been edited.</p> : (
                <ol className="mt-3 space-y-3">
                  {<PagedList items={grouped} label="changes" pageSize={10} asItem render={(pageRows) => pageRows.map((group) => (
                    <li key={group.key} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
                      <p className="font-bold text-slate-900">{group.entries[0].changedBy}</p>
                      <p className="text-[11px] text-slate-500">{stamp(group.entries[0].timestamp)}</p>
                      {group.entries[0].overwroteVersionBy && <p className="mt-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">Saved over a version by {group.entries[0].overwroteVersionBy}</p>}
                      <ul className="mt-2 space-y-1.5">
                        {group.entries.map((entry, index) => entry.field ? (
                          <li key={index}><span className="font-semibold text-slate-700">{entry.field}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]"><span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-800 line-through decoration-rose-300">{entry.oldValue}</span><ArrowRight className="h-3 w-3 text-slate-400" /><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">{entry.newValue}</span></span></li>
                        ) : <li key={index} className="text-slate-600">{entry.note}</li>)}
                      </ul>
                      {group.entries[0].reason && <p className="mt-2 text-[11px] text-slate-600">Reason: {group.entries[0].reason}</p>}
                    </li>
                  ))} />}
                </ol>
              )}
            </section>
          </aside>
        </div>

        {canEdit && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-600">{changes.length ? <><strong className="text-slate-900">{changes.length} unsaved change{changes.length === 1 ? '' : 's'}</strong> · {changes.map((change) => change.field).join(', ')}</> : 'No changes yet'}</span>
              <div className="flex gap-2">
                <button type="button" disabled={!changes.length} onClick={() => { setDraft(draftFrom(order)); setErrors({}); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Discard</button>
                <button type="button" disabled={!changes.length} onClick={review} className="btn btn-primary disabled:cursor-not-allowed disabled:bg-blue-300">Review changes</button>
              </div>
            </div>
          </div>
        )}

        {confirming && (
          <Portal><div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-xs sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-edit-title">
            <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 id="confirm-edit-title" className="text-base font-bold text-slate-900">Save changes to {displayDocumentId(order.orderNumber)}?</h2>
                <p className="text-xs text-slate-500">Check before and after. Each line is added to the order history.</p>
              </div>
              <div className="space-y-3 overflow-y-auto px-5 py-4 text-xs">
                <table className="w-full table-fixed border-separate border-spacing-y-1.5">
                  <thead><tr className="text-left text-[11px] font-bold text-slate-500"><th className="w-1/4 pb-1">Field</th><th className="pb-1">Before</th><th className="pb-1">After</th></tr></thead>
                  <tbody>
                    {changes.map((change) => (
                      <tr key={change.field} className="align-top">
                        <td className="pr-2 font-bold text-slate-700">{change.field}</td>
                        <td className="break-words rounded-l-lg bg-rose-50 px-2 py-1.5 text-rose-900">{change.field === 'Total' ? money(Number(change.oldValue)) : change.oldValue}</td>
                        <td className="break-words rounded-r-lg bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-900">{change.field === 'Total' ? money(Number(change.newValue)) : change.newValue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {phoneChanged && (attachedFailure > 0 || attachedReturn > 0) && <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />A delivery failure or return is attached to this order. It is kept as it is.</p>}
                <div>
                  <label htmlFor="edit-reason" className="mb-1 block font-bold text-slate-700">Reason {needsReason ? <span className="text-rose-600">*</span> : <span className="font-medium text-slate-500">(optional)</span>}</label>
                  <input id="edit-reason" autoFocus={needsReason} value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder={needsReason ? 'Why is the phone number or date changing?' : 'e.g. Customer called to add one more'} className={field} />
                  {needsReason && <p className="mt-1 text-[11px] text-slate-500">Required because the phone number or the order date is changing.</p>}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
                <button type="button" onClick={() => setConfirming(false)} disabled={isSubmitting} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Keep editing</button>
                <button type="button" onClick={save} disabled={isSubmitting || (needsReason && !reason.trim())} className="btn btn-primary disabled:cursor-not-allowed disabled:bg-blue-300">
                  <Check className="h-3.5 w-3.5" /> {isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Saving…</> : 'Save changes'}
                </button>
              </div>
            </div>
          </div></Portal>
        )}
      </div>
    </PageGuard>
  );
}
