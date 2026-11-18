'use client';

import InfoTip from '@/components/common/InfoTip';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, MoreHorizontal, PackageX, Repeat, Search, Truck, Undo2, X } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { canPerform, canWorkOrders, hasAccess } from '@/lib/permissions';
import type { Order, ReturnEntry } from '@/lib/types';
import { displayDocumentId, matchesDocumentId } from '@/lib/document-ids';
import { phoneDigits } from '@/lib/customer-lookup';
import { ORDER_STATUS_LABEL, isOpenOrder, type ManualOrderStatus } from '@/lib/order-status';
import { exchangeAwaitingReturn, exchangeNeedsLink, isExchangeOrder } from '@/lib/exchange';
import { getTodayAd, shiftAdDate } from '@/lib/nepali-calendar';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { syncManager } from '@/lib/offline-sync';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import BulkActionBar from '@/components/common/BulkActionBar';
import { confirmAction } from '@/components/common/confirm';
import { toast } from '@/components/common/Toast';
import OrderStatusControl from '@/components/orders/OrderStatusControl';
import ExchangePanel from '@/components/orders/ExchangePanel';
import LogFailureForm from '@/app/orderflow/delivery-failures/components/LogFailureForm';
import LogReturnForm from '@/app/reviews/returns/components/LogReturnForm';

type StatusFilter = 'OPEN' | 'ALL' | Order['status'];
const RANGES = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['ALL', 'All time']] as const;
const PAGE = 50;

/**
 * Every order in one place: search by order ID, phone, name or product, then move it along
 * (dispatched, delivered), log a failed attempt, a return or an exchange from the same row.
 * Open to OrderFlow and to the Order Desk permission, which shows no sales metrics.
 */
export default function AllOrdersPage() {
  const router = useRouter();
  const user = db.getCurrentUser();
  const { formatDate } = useCalendarPreference();
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [, setVersion] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('OPEN');
  const [range, setRange] = useState<(typeof RANGES)[number][0]>('30');
  const [brand, setBrand] = useState('ALL');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<string[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [failureFor, setFailureFor] = useState<Order | null>(null);
  const [returnFor, setReturnFor] = useState<Order | null>(null);
  const [exchangeReturnFor, setExchangeReturnFor] = useState<Order | null>(null);
  const [exchangeFor, setExchangeFor] = useState<ReturnEntry | null>(null);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener('bb-db-updated', refresh);
    void db.syncWithSupabase().finally(refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);
  useEffect(() => { setLimit(PAGE); setSelected([]); }, [query, status, range, brand]);

  const canWork = canWorkOrders(user);
  const canFail = canPerform(user, 'orderflow', 'CREATE') || canPerform(user, 'order_desk', 'CREATE');
  const canReturn = canPerform(user, 'reviews', 'CREATE') || canPerform(user, 'order_desk', 'CREATE');
  const brands = db.getBrands('ACTIVE');
  const orders = db.getOrders('ALL');
  const returns = db.getReturns('ALL');
  const failures = db.getDeliveryFailures('ALL');

  // A search looks at every date; without one, the date range applies.
  const term = query.trim();
  const inRange = (order: Order) => term || range === 'ALL' || order.orderDateAd >= shiftAdDate(getTodayAd(), -Number(range));
  const matches = (order: Order) => {
    if (!term) return true;
    const text = term.toLowerCase();
    const digits = phoneDigits(term);
    return matchesDocumentId(term, order.orderNumber, order.legacyOrderNumber, order.id)
      || (digits.length >= 4 && /^[\d\s+()-]+$/.test(term) && (phoneDigits(order.customerPhone).includes(digits) || phoneDigits(order.alternatePhone || '').includes(digits)))
      || (/[a-z]/i.test(text) && (order.customerName.toLowerCase().includes(text) || order.items.some((item) => item.productName.toLowerCase().includes(text)) || (order.address || '').toLowerCase().includes(text)));
  };
  const base = useMemo(() => orders.filter((order) => (brand === 'ALL' || order.brandCode === brand) && inRange(order) && matches(order)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, brand, range, term]);
  const counts = useMemo(() => {
    const result: Record<string, number> = { OPEN: 0, ALL: base.length };
    for (const order of base) { result[order.status] = (result[order.status] || 0) + 1; if (isOpenOrder(order.status)) result.OPEN += 1; }
    return result;
  }, [base]);
  const list = useMemo(() => base.filter((order) => status === 'ALL' || (status === 'OPEN' ? isOpenOrder(order.status) : order.status === status))
    .sort((a, b) => b.orderDateAd.localeCompare(a.orderDateAd) || b.createdAt.localeCompare(a.createdAt)), [base, status]);
  const shown = list.slice(0, limit);
  const brandName = (code: string) => brands.find((entry) => entry.code === code)?.name || code;

  const bulk = (target: ManualOrderStatus) => guardedSubmit(async () => {
    const chosen = list.filter((order) => selected.includes(order.id) && order.status !== target && !['DELIVERED', 'CANCELLED', 'RETURNED', 'EXCHANGED'].includes(order.status));
    const skipped = selected.length - chosen.length;
    if (!chosen.length) { toast.info('Nothing to change', 'The selected orders are already at that status, or closed.'); return; }
    const ok = await confirmAction({ title: `Mark ${chosen.length} order${chosen.length === 1 ? '' : 's'} ${ORDER_STATUS_LABEL[target].toLowerCase()}?`,
      consequences: [target === 'DELIVERED' ? 'Each customer gets a delivered count and karma point.' : 'Dispatch date is set to today.', ...(skipped ? [`${skipped} delivered, cancelled or returned order${skipped === 1 ? ' is' : 's are'} left as ${skipped === 1 ? 'it is' : 'they are'}.`] : [])],
      confirmLabel: `Mark ${ORDER_STATUS_LABEL[target].toLowerCase()}` });
    if (!ok) return;
    let done = 0;
    for (const order of chosen) { try { if (db.setOrderStatus(order.id, target)) done += 1; } catch { /* Reported below. */ } }
    try { await syncManager.forceSyncNow(); } catch { /* Queued. */ }
    toast.success(`${done} order${done === 1 ? '' : 's'} marked ${ORDER_STATUS_LABEL[target].toLowerCase()}`, done < chosen.length ? `${chosen.length - done} could not be changed.` : undefined);
    setSelected([]);
  });

  const chips: { key: StatusFilter; label: string }[] = [
    { key: 'OPEN', label: 'To deliver' }, { key: 'PENDING', label: 'Pending' }, { key: 'DISPATCHED', label: 'Dispatched' }, { key: 'FAILED', label: 'Failed' },
    { key: 'DELIVERED', label: 'Delivered' }, { key: 'RETURNED', label: 'Returned' }, { key: 'EXCHANGED', label: 'Exchanged' }, { key: 'CANCELLED', label: 'Cancelled' }, { key: 'ALL', label: 'All' },
  ];

  return (
    <PageGuard feature={['orderflow', 'order_desk']}>
      <div className="mx-auto max-w-7xl space-y-4 pb-28">
        <Breadcrumbs items={[{ label: 'Orderflow', href: '/orderflow/orders' }, { label: 'All Orders' }]} />
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h1 className="flex items-center gap-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">All Orders
<InfoTip label="About this page">Find any order, then mark it dispatched or delivered, or log a failed delivery, a return or an exchange.</InfoTip></h1>
            
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4">
          <div className="flex flex-col gap-2 lg:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search orders</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order ID (0421, FOR-0421), phone, customer, product or address"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
            </label>
            <div className="flex gap-2">
              <select aria-label="Date range" value={range} disabled={!!term} onChange={(event) => setRange(event.target.value as typeof range)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:bg-slate-50 disabled:text-slate-400" title={term ? 'Search looks at every date' : undefined}>
                {RANGES.map(([value, label]) => <option key={value} value={value}>{term ? 'All dates (search)' : label}</option>)}
              </select>
              {brands.length > 1 && (
                <select aria-label="Brand" value={brand} onChange={(event) => setBrand(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                  <option value="ALL">All brands</option>
                  {brands.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="tablist" aria-label="Status">
            {chips.map((chip) => (
              <button key={chip.key} type="button" role="tab" aria-selected={status === chip.key} onClick={() => setStatus(chip.key)}
                className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold transition ${status === chip.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                {chip.label} <span className={status === chip.key ? 'text-slate-300' : 'text-slate-400'}>{counts[chip.key] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        {!list.length ? (
          <EmptyState title={term ? `No order matches “${term}”` : 'No orders here'} description={term ? 'Check the number, or try the customer name or a product.' : status === 'OPEN' ? 'Everything in this period is delivered or closed.' : 'Try another status or a longer date range.'} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    {canWork && <th className="w-8 px-3 py-2.5"><input type="checkbox" aria-label="Select all shown" checked={shown.length > 0 && shown.every((order) => selected.includes(order.id))} onChange={(event) => setSelected(event.target.checked ? shown.map((order) => order.id) : [])} /></th>}
                    <th className="px-3 py-2.5 font-bold">Order</th>
                    <th className="px-3 py-2.5 font-bold">Customer</th>
                    <th className="px-3 py-2.5 font-bold">Products</th>
                    <th className="px-3 py-2.5 font-bold">Delivery</th>
                    <th className="px-3 py-2.5 font-bold">Status</th>
                    <th className="px-3 py-2.5 text-right font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((order) => {
                    const orderReturns = returns.filter((entry) => entry.orderId === order.id);
                    const unlinked = orderReturns.find(exchangeNeedsLink);
                    const openFailure = failures.find((entry) => entry.orderId === order.id && ['FAILED', 'REATTEMPT_SCHEDULED', undefined].includes(entry.status as any));
                    return (
                      <tr key={order.id} className={selected.includes(order.id) ? 'bg-blue-50/50' : 'hover:bg-slate-50/60'}>
                        {canWork && <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${displayDocumentId(order.orderNumber)}`} checked={selected.includes(order.id)} onChange={(event) => setSelected((rows) => event.target.checked ? [...rows, order.id] : rows.filter((id) => id !== order.id))} /></td>}
                        <td className="px-3 py-3 align-top">
                          <Link href={`/orderflow/orders/${order.id}`} className="font-mono text-[13px] font-bold text-slate-900 hover:text-blue-700 hover:underline">{displayDocumentId(order.orderNumber)}</Link>
                          <span className="block text-[11px] text-slate-500">{formatDate(order.orderDateAd, order.orderDateBs)}{brands.length > 1 ? ` · ${brandName(order.brandCode)}` : ''}</span>
                          {isExchangeOrder(order) && <span className="mt-0.5 inline-block rounded-full bg-purple-100 px-1.5 text-[9px] font-bold uppercase text-purple-800">{exchangeAwaitingReturn(order) ? 'Exchange · return not logged' : 'Exchange'}</span>}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span className="block max-w-[180px] truncate font-semibold text-slate-900">{order.customerName}</span>
                          <span className="block font-mono text-[11px] text-slate-500">{order.customerPhone}</span>
                        </td>
                        <td className="max-w-[240px] px-3 py-3 align-top text-slate-700">
                          <span className="line-clamp-2">{order.items.map((item) => `${item.quantity}× ${item.productName}${item.isGift ? ' (gift)' : ''}`).join(', ')}</span>
                        </td>
                        <td className="px-3 py-3 align-top text-[11px] text-slate-600">
                          <span className="block">{order.deliveryMethod}</span>
                          <span className="block max-w-[160px] truncate text-slate-400">{order.district || order.address}</span>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <OrderStatusControl order={order} compact />
                          {openFailure && <span className="mt-1 block text-[10px] font-semibold text-rose-700">Attempt {openFailure.attempts || 1} failed{openFailure.reattemptDateAd ? ` · retry ${formatDate(openFailure.reattemptDateAd, openFailure.reattemptDateBs)}` : ''}</span>}
                          {orderReturns.length > 0 && <span className="mt-1 block text-[10px] font-semibold text-amber-700">{orderReturns.length} return{orderReturns.length === 1 ? '' : 's'}{unlinked ? ' · exchange not linked' : ''}</span>}
                        </td>
                        <td className="relative px-3 py-3 text-right align-top">
                          <button type="button" aria-haspopup="menu" aria-expanded={menuFor === order.id} aria-label={`More actions for ${displayDocumentId(order.orderNumber)}`} onClick={() => setMenuFor(menuFor === order.id ? null : order.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"><MoreHorizontal className="h-3.5 w-3.5" /> Actions <ChevronDown className="h-3 w-3" /></button>
                          {menuFor === order.id && (
                            <>
                              <div className="fixed inset-0 z-20" aria-hidden="true" onClick={() => setMenuFor(null)} />
                              <div role="menu" className="absolute right-3 top-10 z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-left shadow-lg">
                                <Link role="menuitem" href={`/orderflow/orders/${order.id}`} className="block px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open order</Link>
                                {canFail && !['DELIVERED', 'CANCELLED', 'RETURNED', 'EXCHANGED'].includes(order.status) && (
                                  <button role="menuitem" type="button" onClick={() => { setMenuFor(null); setFailureFor(order); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"><PackageX className="h-3.5 w-3.5" /> {openFailure ? 'Log another failed attempt' : 'Log failed delivery'}</button>
                                )}
                                {canReturn && exchangeAwaitingReturn(order) && (
                                  <button role="menuitem" type="button" onClick={() => { setMenuFor(null); setExchangeReturnFor(order); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50"><Repeat className="h-3.5 w-3.5" /> Log the return for this exchange</button>
                                )}
                                {canReturn && order.status !== 'CANCELLED' && !order.exchangeRequested && (
                                  <button role="menuitem" type="button" onClick={() => { setMenuFor(null); setReturnFor(order); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50"><Undo2 className="h-3.5 w-3.5" /> Log return or exchange</button>
                                )}
                                {unlinked && canReturn && (
                                  <button role="menuitem" type="button" onClick={() => { setMenuFor(null); setExchangeFor(unlinked); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50"><Repeat className="h-3.5 w-3.5" /> Link replacement order</button>
                                )}
                                {hasAccess(user, 'customers') && <Link role="menuitem" href={`/customers/${phoneDigits(order.customerPhone)}`} className="block px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Customer 360</Link>}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500">
              <span>Showing {shown.length} of {list.length}</span>
              {list.length > shown.length && <button type="button" onClick={() => setLimit((value) => value + PAGE)} className="rounded-lg border border-slate-200 px-3 py-1 font-bold text-slate-700 hover:bg-slate-50">Show {Math.min(PAGE, list.length - shown.length)} more</button>}
            </div>
          </div>
        )}

        {canWork && (
          <BulkActionBar selectedCount={selected.length} totalCount={list.length} onClearSelection={() => setSelected([])} onSelectAll={() => setSelected(list.map((order) => order.id))}>
            <button type="button" disabled={isSubmitting} onClick={() => bulk('DISPATCHED')} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"><Truck className="h-3.5 w-3.5" /> Mark dispatched</button>
            <button type="button" disabled={isSubmitting} onClick={() => bulk('DELIVERED')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Mark delivered</button>
          </BulkActionBar>
        )}

        {failureFor && <LogFailureForm initialOrder={failureFor} onClose={() => setFailureFor(null)} onSaved={() => setFailureFor(null)} onViewCustomer={(phone) => router.push(`/customers/${phone}`)} />}
        {returnFor && (
          <LogReturnForm initialOrder={returnFor} onClose={() => setReturnFor(null)} onViewCustomer={(phone) => router.push(`/customers/${phone}`)}
            onSaved={(summary) => { setReturnFor(null); if (summary.resolution === 'Exchanged' && !summary.exchangeLinked) { const saved = db.getReturns('ALL').find((entry) => entry.id === summary.returnId); if (saved) setExchangeFor(saved); } }} />
        )}
        {exchangeReturnFor && (
          <LogReturnForm exchangeOrder={exchangeReturnFor} onClose={() => setExchangeReturnFor(null)} onViewCustomer={(phone) => router.push(`/customers/${phone}`)}
            onSaved={(summary) => { setExchangeReturnFor(null); if (summary.resolution === 'Exchanged' && !summary.exchangeLinked) { const saved = db.getReturns('ALL').find((entry) => entry.id === summary.returnId); if (saved) setExchangeFor(saved); } }} />
        )}
        {exchangeFor && <ExchangePanel ret={exchangeFor} onClose={() => setExchangeFor(null)} />}
      </div>
    </PageGuard>
  );
}
