'use client';

import NumberInput from '@/components/common/NumberInput';
import Portal from '@/components/common/Portal';
import InfoTip from '@/components/common/InfoTip';
import DownloadButton from '@/components/common/DownloadButton';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import type { Dispatch, DispatchItem, DispatchStatus } from '@/lib/types';
import { formatDualDate, getTodayAd, adToBs } from '@/lib/nepali-calendar';
import CameraCapture from '@/components/common/CameraCapture';
import SearchSelect, { type SearchOption } from '@/components/common/SearchSelect';
import Money, { canSeeMoney } from '@/components/common/Money';
import { toast } from '@/components/common/Toast';
import { Truck, Plus, Edit2, X, History, FileCheck, Printer, PackageCheck, Send, CheckCircle2, Ban, Search, Download, Trash2, Undo2 } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import ConfirmModal from '@/components/common/ConfirmModal';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';
import { canPerform } from '@/lib/permissions';
import { canDownload } from '@/lib/download-access';
import { productLabel } from '@/lib/sub-brands';
import { productsForStore } from '@/lib/store-brands';
import { channelLabel, channelOfDistributor, channelOfRetailer } from '@/lib/store-channels';
import { DISPATCH_STATUSES, canCorrect, destinationName, dispatchStatus, dispatchUnits, dispatchValue, nextSteps, statusLabel } from '@/lib/dispatch-flow';
import { downloadDispatchWorkbook } from '@/lib/export/record-downloads';

const TONE: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-800', amber: 'bg-amber-100 text-amber-900', violet: 'bg-violet-100 text-violet-800', green: 'bg-emerald-100 text-emerald-800', slate: 'bg-slate-200 text-slate-700',
};
const statusPill = (status: DispatchStatus) => {
  const def = DISPATCH_STATUSES.find((s) => s.status === status)!;
  return <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONE[def.tone]}`}>{def.label}</span>;
};
const STEP_ACTION: Record<DispatchStatus, { label: string; icon: typeof Send; style: string }> = {
  ORDER_RECEIVED: { label: 'Back to order received', icon: History, style: 'border border-slate-200 text-slate-700 hover:bg-slate-50' },
  PACKED: { label: 'Mark packed', icon: PackageCheck, style: 'bg-amber-500 text-white hover:bg-amber-600' },
  DISPATCHED: { label: 'Mark dispatched', icon: Send, style: 'bg-violet-600 text-white hover:bg-violet-700' },
  DELIVERED: { label: 'Mark delivered', icon: CheckCircle2, style: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  CANCELLED: { label: 'Cancel order', icon: Ban, style: 'border border-rose-200 text-rose-700 hover:bg-rose-50' },
};

type Line = { productId: string; cartons: number; units: number; /** Units per carton for this dispatch, when it differs from the product's usual size. */ cartonSize?: number };

export default function DispatchPage() {
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);
  const bump = () => setVersion((v) => v + 1);
  const user = db.getCurrentUser();
  const canCreate = canPerform(user, 'dispatches', 'CREATE');
  const canEdit = canPerform(user, 'dispatches', 'EDIT');
  const seesMoney = canSeeMoney();
  const allowDownload = canDownload(user);

  const dispatches = db.getDispatches();
  const products = db.getProducts().filter((product) => product.active !== false);
  const brands = db.getBrands('ALL');
  const productName = (id: string, fallback: string) => { const p = products.find((x) => x.id === id) || db.getProducts().find((x) => x.id === id); return p ? productLabel(p) : fallback; };

  // Every account stock can go to, searchable by name, type, chain or area.
  const destinations = useMemo(() => {
    const options: (SearchOption & { kind: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER'; chainId?: string; chainName?: string; terms?: string; distributorId?: string; distributorName?: string; margins?: Record<string, { pct: number; type: string }> })[] = [];
    for (const r of db.getRetailers()) options.push({ value: r.id, label: r.name, hint: [channelLabel(channelOfRetailer(r)), r.area, r.city, r.distributorName && `via ${r.distributorName}`].filter(Boolean).join(' · '), group: channelLabel(channelOfRetailer(r)), kind: 'RETAILER', terms: r.creditTerms, distributorId: r.distributorId, distributorName: r.distributorName, margins: r.defaultMargins });
    for (const b of db.getBranches()) { const chain = db.getDistributors().find((d) => d.id === b.distributorId); options.push({ value: b.id, label: b.name, hint: ['MT outlet', b.distributorName, b.area || b.city].filter(Boolean).join(' · '), group: 'MT outlets', kind: 'BRANCH', chainId: b.distributorId, chainName: b.distributorName, terms: chain?.creditTerms, margins: b.defaultMargins || chain?.defaultMargins }); }
    for (const d of db.getDistributors()) options.push({ value: d.id, label: d.name, hint: [channelOfDistributor(d) === 'CHAIN_STORE' ? 'MT chain head office' : 'Distributor', d.city].filter(Boolean).join(' · '), group: channelOfDistributor(d) === 'CHAIN_STORE' ? 'MT chains (head office)' : 'Distributors', kind: 'DISTRIBUTOR', terms: d.creditTerms, margins: d.defaultMargins });
    const order = ['MT outlets', 'SAMT', 'Retail store', 'MT chains (head office)', 'Distributors'];
    return options.sort((a, b) => order.indexOf(a.group || '') - order.indexOf(b.group || '') || a.label.localeCompare(b.label));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatches.length]);

  // Filters
  const [tab, setTab] = useState<DispatchStatus | 'OPEN' | 'ALL'>('OPEN');
  const [query, setQuery] = useState('');
  // A notification link (?q=<order number>) lands on that order, whatever its step.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) { setQuery(q.slice(0, 80)); setTab('ALL'); }
  }, []);
  const counts = Object.fromEntries(DISPATCH_STATUSES.map((s) => [s.status, dispatches.filter((d) => dispatchStatus(d) === s.status).length])) as Record<DispatchStatus, number>;
  const openCount = counts.ORDER_RECEIVED + counts.PACKED + counts.DISPATCHED;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = dispatches.filter((d) => {
    const status = dispatchStatus(d);
    if (tab === 'OPEN' ? !['ORDER_RECEIVED', 'PACKED', 'DISPATCHED'].includes(status) : tab !== 'ALL' && status !== tab) return false;
    const text = `${d.dispatchNumber || ''} ${d.orderNumber || ''} ${destinationName(d)} ${d.distributorName} ${d.fulfillerName || ''} ${d.items.map((i) => i.productName).join(' ')}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });

  // Store orders that never got a dispatch order (taken before this flow, or not yet synced).
  const orphanOrders = db.getSecondaryOrders().filter((o) => o.status === 'PENDING_DISPATCH' && !dispatches.some((d) => d.orderId === o.id));

  // New dispatch order form
  const [showForm, setShowForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [destId, setDestId] = useState('');
  const [alreadySent, setAlreadySent] = useState(false);
  const [sentDate, setSentDate] = useState(getTodayAd());
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', cartons: 0, units: 0 }]);
  const dest = destinations.find((d) => d.value === destId);
  const caseSize = (id: string) => products.find((p) => p.id === id)?.caseSize || 0;
  const lineCarton = (line: Line) => line.cartonSize || caseSize(line.productId);
  const lineUnits = (line: Line) => line.cartons * lineCarton(line) + line.units;
  const priceFor = (productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p?.mrp) return 0;
    const margin = dest?.margins?.[p.brandCode];
    if (!margin) return 0;
    return margin.type === 'MARKUP' ? Math.round(p.mrp / (1 + margin.pct / 100)) : Math.round(p.mrp * (1 - margin.pct / 100));
  };
  const filled = lines.filter((l) => l.productId && lineUnits(l) > 0);
  const totalUnits = filled.reduce((sum, l) => sum + lineUnits(l), 0);
  const totalValue = filled.reduce((sum, l) => sum + lineUnits(l) * priceFor(l.productId), 0);
  const storeRecord = (id?: string) => !id ? null : db.getRetailers().find((r) => r.id === id) || db.getBranches().find((b) => b.id === id) || db.getDistributors().find((d) => d.id === id) || null;
  const destProducts = productsForStore(products, storeRecord(destId));
  const productOptions: SearchOption[] = destProducts.map((p) => ({ value: p.id, label: productLabel(p), hint: [p.alias ? p.name : '', p.sku, p.caseSize ? `${p.caseSize} per carton` : 'no carton size'].filter(Boolean).join(' · ') }));

  const resetForm = () => { setDestId(''); setAlreadySent(false); setSentDate(getTodayAd()); setNotes(''); setPhoto(''); setLines([{ productId: '', cartons: 0, units: 0 }]); };
  const review = () => {
    if (!dest) { toast.error('Choose who the order is for.'); return; }
    if (!filled.length) { toast.error('Add at least one product with a quantity.'); return; }
    setShowForm(false); setShowConfirm(true);
  };
  const save = () => guardedSubmit(async () => {
    if (!dest) return;
    const items: DispatchItem[] = filled.map((l) => {
      const p = products.find((x) => x.id === l.productId)!;
      return { productId: p.id, productName: p.name, brandCode: p.brandCode, subBrandId: p.subBrandId, quantity: lineUnits(l), quantityPcs: lineUnits(l), unitPrice: priceFor(p.id) || undefined, ...(l.cartons && lineCarton(l) ? { unitsPerCarton: lineCarton(l) } : {}) };
    });
    const created = db.addDispatch({
      status: 'ORDER_RECEIVED',
      storeId: dest.value, storeName: dest.label, entityType: dest.kind,
      distributorId: dest.kind === 'BRANCH' ? dest.chainId || dest.value : dest.value,
      distributorName: dest.kind === 'BRANCH' ? dest.chainName || dest.label : dest.label,
      branchId: dest.kind === 'BRANCH' ? dest.value : undefined, branchName: dest.kind === 'BRANCH' ? dest.label : undefined,
      fulfilledBy: dest.kind === 'RETAILER' && dest.distributorId ? 'DISTRIBUTOR' : 'WAREHOUSE',
      fulfillerId: dest.kind === 'RETAILER' ? dest.distributorId : undefined, fulfillerName: dest.kind === 'RETAILER' ? dest.distributorName : undefined,
      orderDateAd: getTodayAd(), dispatchDateAd: '', dispatchDateBs: '',
      items, totalAmount: totalValue || undefined, notes, documentUrl: photo || undefined, paymentTerms: dest.terms || undefined,
    });
    if (alreadySent) db.setDispatchStatus(created.id, 'DISPATCHED', { dateAd: sentDate, note: 'Logged after it was sent' });
    setShowConfirm(false); resetForm(); bump();
    toast.success(alreadySent ? 'Dispatch logged as sent.' : 'Dispatch order created: Order received.');
  });

  // Moving an order along
  const [moving, setMoving] = useState<{ dispatch: Dispatch; to: DispatchStatus } | null>(null);
  const [moveDate, setMoveDate] = useState(getTodayAd());
  const [moveNote, setMoveNote] = useState('');
  const [movePhoto, setMovePhoto] = useState('');
  const startMove = (dispatch: Dispatch, to: DispatchStatus) => { setMoving({ dispatch, to }); setMoveDate(getTodayAd()); setMoveNote(''); setMovePhoto(''); };
  const confirmMove = () => guardedSubmit(async () => {
    if (!moving) return;
    if (moving.to === 'CANCELLED' && !moveNote.trim()) { toast.error('Say why the order is cancelled. It goes in the history.'); return; }
    try {
      db.setDispatchStatus(moving.dispatch.id, moving.to, { dateAd: moveDate, note: moveNote.trim() || undefined, documentUrl: movePhoto || undefined });
      toast.success(`${moving.dispatch.dispatchNumber || 'Order'}: ${statusLabel(moving.to)}.`);
      setMoving(null); bump();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Not saved.'); }
  });

  // Correcting quantities
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<{ key: string; productId: string; units: number }[]>([]);
  const startCorrecting = (disp: Dispatch) => { setCorrecting(disp.id); setCorrections(Object.fromEntries(disp.items.map((i) => [i.productId, i.quantity]))); setReason(''); setRemoved([]); setAdded([]); };
  const addLine = () => setAdded((rows) => [...rows, { key: `add_${Date.now()}_${rows.length}`, productId: '', units: 0 }]);
  const correctionCount = (disp: Dispatch) => disp.items.filter((item) => !removed.includes(item.productId) && corrections[item.productId] !== item.quantity).length + removed.length + added.filter((row) => row.productId && row.units > 0).length;
  const saveCorrections = (disp: Dispatch) => {
    const changed = disp.items.filter((item) => !removed.includes(item.productId) && corrections[item.productId] !== item.quantity);
    const adding = added.filter((row) => row.productId);
    const changes = changed.length + removed.length + adding.length;
    if (!changes) { setCorrecting(null); return; }
    if (adding.some((row) => !(row.units > 0))) { toast.error('Enter how many units of each added product to send, or remove the line.'); return; }
    if (removed.length === disp.items.length && !adding.length) { toast.error('Every product is removed. Cancel the order, or add a product.'); return; }
    if (!reason.trim()) { toast.error('Say why the order is changing. It goes in the history.'); return; }
    guardedSubmit(async () => {
      try {
        // Add first, so the order is never left empty part way through.
        for (const row of adding) {
          const p = products.find((x) => x.id === row.productId)!;
          db.addDispatchItem(disp.id, { productId: p.id, productName: p.name, brandCode: p.brandCode, subBrandId: p.subBrandId, quantity: row.units, quantityPcs: row.units }, reason.trim());
        }
        for (const item of changed) db.editDispatchItem(disp.id, item.productId, Math.max(0, corrections[item.productId] || 0), reason.trim());
        for (const id of removed) db.removeDispatchItem(disp.id, id, reason.trim());
        setCorrecting(null); bump();
        toast.success(`${changes} ${changes === 1 ? 'change' : 'changes'} saved.`);
      } catch (error) { toast.error(error instanceof Error ? error.message : 'Not saved.'); }
    });
  };

  const [lightbox, setLightbox] = useState<string | null>(null);

  const tabs: { key: typeof tab; label: string; count: number }[] = [
    { key: 'OPEN', label: 'To do', count: openCount },
    ...DISPATCH_STATUSES.map((s) => ({ key: s.status, label: s.label, count: counts[s.status] })),
    { key: 'ALL', label: 'All', count: dispatches.length },
  ];

  return (
    <PageGuard feature="dispatches">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Orders &amp; dispatch
              <InfoTip label="About this page">Every store order becomes a dispatch order here the moment it is taken. Move it from Order received to Packed, Dispatched and Delivered; the store order follows. Print the order challan to pack from.</InfoTip>
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">Orders to MT outlets, SAMT and retail stores, and stock sent to distributors.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton datasets={['dispatch_orders', 'dispatch_lines']} records={{ dispatches: shown }} fileLabel="Orders-and-dispatch" />
            {canCreate && (
              <button type="button" onClick={() => { resetForm(); setShowForm(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700">
                <Plus className="h-4 w-4" /> New dispatch order
              </button>
            )}
          </div>
        </div>

        {orphanOrders.length > 0 && canCreate && (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between">
            <p><strong>{orphanOrders.length} store {orphanOrders.length === 1 ? 'order has' : 'orders have'} no dispatch order yet</strong> (taken before this page was linked). {orphanOrders.slice(0, 3).map((o) => `${o.orderNumber} ${o.storeName}`).join(', ')}{orphanOrders.length > 3 ? '…' : ''}</p>
            <button type="button" onClick={() => guardedSubmit(async () => { for (const o of orphanOrders) db.createDispatchOrderFromOrder(o.id); bump(); toast.success(`${orphanOrders.length} dispatch ${orphanOrders.length === 1 ? 'order' : 'orders'} created.`); })}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 font-bold text-white hover:bg-amber-700">Create {orphanOrders.length === 1 ? 'its dispatch order' : 'their dispatch orders'}</button>
          </div>
        )}

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Order status" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-xs">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} type="button" onClick={() => setTab(t.key)}
                className={`rounded-lg px-3 py-1.5 font-bold ${tab === t.key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>{t.label} ({t.count})</button>
            ))}
          </div>
          <label className="relative block w-full lg:w-72">
            <span className="sr-only">Search orders</span>
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search DP or SO number, store, product" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs" />
          </label>
        </div>

        <div className="space-y-4">
          {shown.length === 0 ? (
            <EmptyState type="generic" icon={Truck} title={dispatches.length ? 'Nothing here' : 'No dispatch orders yet'} description={dispatches.length ? 'Try another status or search.' : 'Store orders taken on visits appear here automatically. You can also create one with “New dispatch order”.'} />
          ) : shown.map((disp) => {
            const status = dispatchStatus(disp);
            const editing = correcting === disp.id;
            const value = dispatchValue(disp) || disp.totalAmount || 0;
            const changes = editing ? correctionCount(disp) : 0;
            const allRemoved = editing && removed.length === disp.items.length && !added.some((row) => row.productId);
            return (
              <article key={disp.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label={`${disp.dispatchNumber || 'Dispatch'} to ${destinationName(disp)}`}>
                <header className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {disp.dispatchNumber && <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">{disp.dispatchNumber}</span>}
                      {disp.orderNumber && <span className="rounded border border-slate-300 px-1.5 py-0.5 font-mono text-[11px] text-slate-700" title="Store order">{disp.orderNumber}</span>}
                      {statusPill(status)}
                    </div>
                    <h3 className="mt-1.5 text-base font-bold text-slate-900">
                      {disp.storeId ? <Link href={`/offline-sales/stores/${disp.storeId}`} className="hover:text-blue-700 hover:underline">{destinationName(disp)}</Link> : destinationName(disp)}
                      {disp.branchName && disp.distributorName && disp.branchName !== disp.distributorName && <span className="ml-1.5 text-xs font-medium text-slate-500">{disp.distributorName}</span>}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[
                        disp.orderDateAd && `Ordered ${disp.orderDateAd}`,
                        disp.dispatchDateAd && `Sent ${disp.dispatchDateBs || disp.dispatchDateAd}`,
                        disp.deliveredDateAd && `Delivered ${disp.deliveredDateAd}`,
                        disp.fulfilledBy === 'DISTRIBUTOR' ? `Delivered by ${disp.fulfillerName || 'the store’s distributor'}` : 'From our warehouse',
                        disp.paymentTerms && `Terms: ${disp.paymentTerms}`,
                        disp.paymentDueDateAd && `Payment due ${disp.paymentDueDateBs || disp.paymentDueDateAd}`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{dispatchUnits(disp).toLocaleString()} units</span>
                    {value > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700"><Money>{value.toLocaleString()}</Money></span>}
                  </div>
                </header>

                <div className={editing ? '-mx-1 rounded-xl bg-blue-50/30 p-3 ring-2 ring-blue-200' : ''}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-[11px] text-slate-500">
                          <th className="py-2 font-semibold">Product</th>
                          <th className="py-2 text-right font-semibold">Ordered</th>
                          <th className="py-2 text-right font-semibold">Sending</th>
                          {seesMoney && <th className="py-2 text-right font-semibold">Rate</th>}
                          {editing && <th className="py-2 pl-4 font-semibold">Send instead</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {disp.items.map((item) => {
                          const next = corrections[item.productId] ?? item.quantity;
                          const diff = next - item.quantity;
                          return (
                            <tr key={item.productId}>
                              <td className="py-2 font-medium text-slate-800">{productName(item.productId, item.productName)}</td>
                              <td className="py-2 text-right tabular-nums text-slate-600">{item.orderedQty ?? item.quantity}</td>
                              <td className={`py-2 text-right font-bold tabular-nums ${editing && diff ? 'text-slate-400 line-through' : item.orderedQty !== undefined && item.orderedQty !== item.quantity ? 'text-amber-800' : 'text-slate-900'}`}>{item.quantity}</td>
                              {seesMoney && <td className="py-2 text-right tabular-nums text-slate-600">{item.unitPrice ? item.unitPrice.toLocaleString() : '—'}</td>}
                              {editing && (
                                <td className="py-1.5 pl-4">
                                  {removed.includes(item.productId) ? (
                                    <div className="flex items-center gap-2">
                                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">Removed</span>
                                      <button type="button" onClick={() => setRemoved((ids) => ids.filter((id) => id !== item.productId))} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:underline"><Undo2 className="h-3 w-3" />Undo</button>
                                    </div>
                                  ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white">
                                      <button type="button" aria-label={`Fewer ${item.productName}`} onClick={() => setCorrections((c) => ({ ...c, [item.productId]: Math.max(0, next - 1) }))} className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100">−</button>
                                      <NumberInput aria-label={`Corrected units of ${item.productName}`} type="number" min={0} value={next} onChange={(e) => setCorrections((c) => ({ ...c, [item.productId]: Math.max(0, parseInt(e.target.value) || 0) }))} className="w-16 border-x border-slate-200 py-1.5 text-center font-bold outline-none" />
                                      <button type="button" aria-label={`More ${item.productName}`} onClick={() => setCorrections((c) => ({ ...c, [item.productId]: next + 1 }))} className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100">+</button>
                                    </div>
                                    {diff !== 0 && <span className={`text-[11px] font-bold ${diff > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{diff > 0 ? '+' : ''}{diff}</span>}
                                    <button type="button" aria-label={`Remove ${item.productName} from the order`} title="Remove from the order" onClick={() => setRemoved((ids) => [...ids, item.productId])} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                                  </div>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {editing && (
                    <div className="mt-3 space-y-2">
                      {added.map((row, idx) => {
                        const taken = new Set([...disp.items.map((i) => i.productId), ...added.filter((other) => other.key !== row.key).map((other) => other.productId)]);
                        const options = productsForStore(products, storeRecord(disp.storeId)).filter((p) => !taken.has(p.id)).map((p) => ({ value: p.id, label: productLabel(p), hint: [p.sku, p.caseSize ? `${p.caseSize} per carton` : ''].filter(Boolean).join(' · ') }));
                        return (
                          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_88px_32px] items-end gap-2 rounded-xl border border-emerald-200 bg-white p-2">
                            <SearchSelect label={`Added product ${idx + 1}`} options={options} value={row.productId} onChange={(v) => setAdded((rows) => rows.map((r) => r.key === row.key ? { ...r, productId: v } : r))} placeholder="Search product" />
                            <label className="block text-[11px] font-semibold text-slate-600">Units
                              <NumberInput type="number" min={0} value={row.units || ''} onChange={(e) => setAdded((rows) => rows.map((r) => r.key === row.key ? { ...r, units: Math.max(0, parseInt(e.target.value) || 0) } : r))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-center font-semibold" />
                            </label>
                            <button type="button" aria-label="Remove this added product" onClick={() => setAdded((rows) => rows.filter((r) => r.key !== row.key))} className="mb-1.5 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                          </div>
                        );
                      })}
                      {allRemoved ? (
                        <div role="alertdialog" aria-label="Every product removed" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs">
                          <p className="font-bold text-rose-900">Every product is removed from this order.</p>
                          <p className="mt-0.5 text-rose-800">An order needs at least one product. Cancel the whole order, or add new products?</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {nextSteps(status).includes('CANCELLED') && <button type="button" onClick={() => { setCorrecting(null); startMove(disp, 'CANCELLED'); }} className="rounded-lg bg-rose-600 px-3 py-1.5 font-bold text-white hover:bg-rose-700">Cancel the order</button>}
                            <button type="button" onClick={addLine} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-800 hover:bg-slate-50">Add new products</button>
                            <button type="button" onClick={() => setRemoved([])} className="px-2 py-1.5 font-semibold text-slate-600 hover:underline">Undo removals</button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"><Plus className="h-3.5 w-3.5" /> Add product</button>
                      )}
                    </div>
                  )}
                  {editing && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label className="flex-1 text-xs">
                        <span className="mb-1 block font-semibold text-slate-700">Why is the order changing?</span>
                        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Only 48 in stock, rest next week" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500" />
                      </label>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setCorrecting(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                        <button type="button" onClick={() => saveCorrections(disp)} disabled={isSubmitting || !changes || !reason.trim() || allRemoved} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{changes ? `Save ${changes} ${changes === 1 ? 'change' : 'changes'}` : 'Save changes'}</button>
                      </div>
                    </div>
                  )}
                </div>

                {(disp.statusHistory?.length || disp.edits?.length) ? (
                  <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] font-semibold text-slate-700"><History className="h-3.5 w-3.5" /> History</summary>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
                      {[...(disp.statusHistory || []).map((h) => ({ at: h.at, text: <>{statusLabel(h.status)} by {h.byName}{h.note ? <span className="text-slate-500">: “{h.note}”</span> : null}</> })),
                        ...(disp.edits || []).map((e) => ({ at: e.createdAt, text: <><strong>{e.productName}</strong> {e.oldQty} → {e.newQty} by {e.changedBy}: <span className="text-slate-500">“{e.reason}”</span></> }))]
                        .sort((a, b) => a.at.localeCompare(b.at)).map((row, i) => <li key={i}><span className="text-slate-500">{new Date(row.at).toLocaleString('en-GB', { timeZone: 'Asia/Kathmandu', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span> · {row.text}</li>)}
                    </ul>
                  </details>
                ) : null}

                <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/offline-sales/dispatch/challan/${encodeURIComponent(disp.id)}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Printer className="h-3.5 w-3.5" /> Order challan</Link>
                    {allowDownload && <button type="button" onClick={() => downloadDispatchWorkbook(disp, db.getProducts(), brands, seesMoney)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" /> Excel</button>}
                    {disp.documentUrl && <button type="button" onClick={() => setLightbox(disp.documentUrl || null)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"><FileCheck className="h-3.5 w-3.5" /> Signed challan</button>}
                    {canEdit && canCorrect(status) && !editing && <button type="button" onClick={() => startCorrecting(disp)} disabled={!!correcting} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Edit2 className="h-3 w-3" /> Edit products</button>}
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {nextSteps(status).slice().reverse().map((to) => {
                        const action = STEP_ACTION[to];
                        const Icon = action.icon;
                        return <button key={to} type="button" onClick={() => startMove(disp, to)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold ${action.style}`}><Icon className="h-3.5 w-3.5" /> {action.label}</button>;
                      })}
                    </div>
                  )}
                </footer>
              </article>
            );
          })}
        </div>

        {/* New dispatch order */}
        {showForm && (
          <Portal><div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="new-dispatch-title">
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 id="new-dispatch-title" className="text-base font-bold text-slate-900">New dispatch order</h3>
                  <p className="mt-0.5 text-xs text-slate-500">For orders that did not come from a store visit, or stock sent to a distributor.</p>
                </div>
                <button type="button" onClick={() => setShowForm(false)} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-xs">
                <SearchSelect label="Going to *" options={destinations} value={destId} onChange={setDestId} placeholder="Type a store, chain, outlet or area" />
                {dest && (
                  <p className="-mt-3 text-[11px] text-slate-600">
                    {dest.kind === 'RETAILER' && dest.distributorName ? `Delivered by ${dest.distributorName}. ` : 'From our warehouse. '}
                    {dest.terms ? `Terms: ${dest.terms}.` : 'No payment terms on file.'}
                  </p>
                )}
                <section>
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="font-semibold text-slate-700">Products *</span>
                    <span className="text-[11px] text-slate-500">Per carton starts at the product&apos;s usual size. Change it if this pack differs.</span>
                  </div>
                  <ul className="space-y-2">
                    {lines.map((line, idx) => {
                      const usual = caseSize(line.productId);
                      const size = lineCarton(line);
                      const taken = new Set(lines.filter((_, i) => i !== idx).map((l) => l.productId));
                      return (
                        <li key={idx} className="grid grid-cols-[minmax(0,1fr)_64px_64px_64px_32px] items-end gap-2 rounded-xl border border-slate-200 p-2">
                          <SearchSelect label={`Product ${idx + 1}`} options={productOptions.filter((o) => !taken.has(o.value))} value={line.productId} onChange={(v) => setLines((rows) => rows.map((r, i) => i === idx ? { ...r, productId: v, cartonSize: undefined } : r))} placeholder="Search product or short name" />
                          <label className="block text-[11px] font-semibold text-slate-600">Per carton
                            <NumberInput type="number" min={1} max={1000} disabled={!line.productId} value={size || ''} placeholder="—" title={usual ? `Usually ${usual} per carton` : 'No carton size on the product'}
                              onChange={(e) => { const next = Math.min(1000, Math.max(0, parseInt(e.target.value) || 0)); setLines((rows) => rows.map((r, i) => i === idx ? { ...r, cartonSize: next && next !== usual ? next : undefined } : r)); }}
                              className={`mt-1 w-full rounded-lg border px-2 py-2 text-center font-semibold disabled:bg-slate-50 ${line.cartonSize ? 'border-amber-400 text-amber-800' : 'border-slate-300'}`} />
                          </label>
                          <label className="block text-[11px] font-semibold text-slate-600">Cartons
                            <NumberInput type="number" min={0} disabled={!size} value={line.cartons || ''} title={size ? `${size} units per carton` : 'No carton size set'} onChange={(e) => setLines((rows) => rows.map((r, i) => i === idx ? { ...r, cartons: Math.max(0, parseInt(e.target.value) || 0) } : r))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-center font-semibold disabled:bg-slate-50" />
                          </label>
                          <label className="block text-[11px] font-semibold text-slate-600">Units
                            <NumberInput type="number" min={0} value={line.units || ''} onChange={(e) => setLines((rows) => rows.map((r, i) => i === idx ? { ...r, units: Math.max(0, parseInt(e.target.value) || 0) } : r))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-center font-semibold" />
                          </label>
                          <button type="button" aria-label={`Remove product ${idx + 1}`} onClick={() => setLines((rows) => rows.length > 1 ? rows.filter((_, i) => i !== idx) : [{ productId: '', cartons: 0, units: 0 }])} className="mb-1.5 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                          {lineUnits(line) > 0 && <span className="col-span-5 text-right text-[11px] text-slate-600">{lineUnits(line)} units{seesMoney && priceFor(line.productId) ? ` × ${priceFor(line.productId)} = NPR ${(lineUnits(line) * priceFor(line.productId)).toLocaleString()}` : ''}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  <button type="button" onClick={() => setLines((rows) => [...rows, { productId: '', cartons: 0, units: 0 }])} className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><Plus className="h-3.5 w-3.5" /> Add product</button>
                </section>
                <label className="block"><span className="mb-1 block font-semibold text-slate-700">Note</span>
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Deliver before Friday" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
                  <input type="checkbox" checked={alreadySent} onChange={(e) => setAlreadySent(e.target.checked)} className="mt-0.5" />
                  <span><span className="font-semibold text-slate-800">Already sent</span><span className="block text-slate-500">Log it as dispatched instead of starting at Order received.</span></span>
                </label>
                {alreadySent && (
                  <div className="space-y-3">
                    <label className="block"><span className="mb-1 block font-semibold text-slate-700">Sent on</span>
                      <input type="date" value={sentDate} onChange={(e) => setSentDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      <span className="ml-2 text-[11px] text-slate-500">{formatDualDate(sentDate).split(' (')[0]}</span>
                    </label>
                    <CameraCapture folder="dispatches" label="Photo of the signed challan" sublabel="Optional." maxFiles={1} existingUrls={photo ? [photo] : []} onRemoveExisting={() => setPhoto('')} onUpload={(results) => setPhoto(results[0]?.url || '')} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
                <span className="text-xs text-slate-500">{filled.length} {filled.length === 1 ? 'product' : 'products'}, {totalUnits.toLocaleString()} units{seesMoney && totalValue ? `, NPR ${totalValue.toLocaleString()}` : ''}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button type="button" onClick={review} disabled={!filled.length || !dest} className="btn btn-primary disabled:opacity-50">Review</button>
                </div>
              </div>
            </div>
          </div></Portal>
        )}

        <ConfirmModal
          isOpen={showConfirm}
          title={`${alreadySent ? 'Log dispatch' : 'Create dispatch order'} for ${dest?.label || 'store'}?`}
          variant="info"
          confirmLabel={alreadySent ? 'Log as dispatched' : 'Create order'}
          cancelLabel="Back to edit"
          details={[
            ...filled.map((l) => ({ label: productName(l.productId, 'Product'), value: `${lineUnits(l)} units${l.cartons ? ` (${l.cartons} × ${lineCarton(l)}${l.units ? ` + ${l.units}` : ''})` : ''}` })),
            { label: 'Total', value: `${totalUnits.toLocaleString()} units${seesMoney && totalValue ? `, NPR ${totalValue.toLocaleString()}` : ''}` },
            { label: 'Payment terms', value: dest?.terms || 'None on file' },
          ]}
          consequences={alreadySent ? ['It is logged as dispatched today and the payment clock starts'] : ['It starts at Order received, ready to pack']}
          onConfirm={save}
          onCancel={() => { setShowConfirm(false); setShowForm(true); }}
        />

        {/* Move to the next step */}
        {moving && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="move-title">
            <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 text-xs shadow-2xl">
              <div>
                <h3 id="move-title" className="text-base font-bold text-slate-900">{STEP_ACTION[moving.to].label}: {moving.dispatch.dispatchNumber || 'order'}</h3>
                <p className="mt-0.5 text-slate-500">{destinationName(moving.dispatch)} · {dispatchUnits(moving.dispatch).toLocaleString()} units</p>
              </div>
              {(moving.to === 'DISPATCHED' || moving.to === 'DELIVERED') && (
                <label className="block"><span className="mb-1 block font-semibold text-slate-700">{moving.to === 'DISPATCHED' ? 'Sent on' : 'Delivered on'}</span>
                  <input type="date" value={moveDate} max={getTodayAd()} onChange={(e) => setMoveDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <span className="ml-2 text-[11px] text-slate-500">{adToBs(`${moveDate}T12:00:00`).formatted}</span>
                </label>
              )}
              {moving.to === 'DISPATCHED' && moving.dispatch.paymentTerms && !/cash|cod/i.test(moving.dispatch.paymentTerms) && <p className="rounded-lg bg-slate-50 p-2 text-slate-600">Payment is due {moving.dispatch.paymentTerms.toLowerCase()} after this date.</p>}
              {(moving.to === 'DISPATCHED' || moving.to === 'DELIVERED') && (
                <CameraCapture folder="dispatches" label={moving.to === 'DELIVERED' ? 'Photo of the challan signed by the store' : 'Photo of the challan'} sublabel="Optional." maxFiles={1} existingUrls={movePhoto ? [movePhoto] : []} onRemoveExisting={() => setMovePhoto('')} onUpload={(results) => setMovePhoto(results[0]?.url || '')} />
              )}
              <label className="block"><span className="mb-1 block font-semibold text-slate-700">{moving.to === 'CANCELLED' ? 'Why is it cancelled? *' : 'Note'}</span>
                <input value={moveNote} onChange={(e) => setMoveNote(e.target.value)} placeholder={moving.to === 'CANCELLED' ? 'e.g. Store changed its mind' : moving.to === 'DISPATCHED' ? 'e.g. Van BA 2 KHA 1234, driver Ram' : 'Optional'} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMoving(null)} className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50">Back</button>
                <button type="button" onClick={confirmMove} disabled={isSubmitting} className={`rounded-lg px-4 py-2 font-bold disabled:opacity-50 ${STEP_ACTION[moving.to].style}`}>{STEP_ACTION[moving.to].label}</button>
              </div>
            </div>
          </div></Portal>
        )}

        {lightbox && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="Signed challan">
            <div className="relative max-h-[90vh] max-w-2xl rounded-2xl bg-white p-2" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => setLightbox(null)} aria-label="Close" className="absolute right-4 top-4 z-10 rounded-full bg-slate-900/70 p-1.5 text-white hover:bg-slate-900"><X className="h-5 w-5" /></button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lightbox} alt="Signed challan" className="mx-auto max-h-[80vh] w-auto max-w-full rounded-xl object-contain" />
            </div>
          </div></Portal>
        )}
      </div>
    </PageGuard>
  );
}
