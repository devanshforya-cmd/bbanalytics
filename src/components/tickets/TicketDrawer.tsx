'use client';

import NumberInput from '@/components/common/NumberInput';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PackageCheck, Truck, CheckCircle2, RotateCcw, XCircle, Lock, Send, MessageSquarePlus } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import type { ReturnEntry } from '@/lib/types';
import { getTodayAd } from '@/lib/nepali-calendar';
import { displayDocumentId } from '@/lib/document-ids';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import SlideOverPanel from '@/components/common/SlideOverPanel';
import DualDateField from '@/components/common/DualDateField';
import { toast } from '@/components/common/Toast';
import { OrderStatusBadge } from '@/components/orders/OrderStatusControl';
import { TicketStageBadge, TicketTypeBadge } from './TicketBadges';
import {
  awaitingGoods, canClose, CONDITION_LABEL, expectsGoodsBack, FAULT_LABEL, isTracked, LINE_KIND_LABEL, OPEN_STAGES, RESOLUTION_LABEL, resolutionsFor,
  ticketAgeDays, ticketLinesOf, ticketRef, ticketStageOf, ticketTypeOf, type GoodsCondition, type TicketFault, type TicketResolutionType,
} from '@/lib/order-tickets';

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
type Panel = null | 'pickup' | 'receive' | 'resolve' | 'reject' | 'note';

interface Props { ticketId: string; onClose: () => void; onExchange?: (entry: ReturnEntry) => void }

/** One ticket: what happened, where the goods are, how it was settled, and every step taken. */
export default function TicketDrawer({ ticketId, onClose, onExchange }: Props) {
  const { formatDate } = useCalendarPreference();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener('bb-db-updated', refresh);
    return () => window.removeEventListener('bb-db-updated', refresh);
  }, []);
  void version;
  const entry = db.getOrderIssue(ticketId);
  const [panel, setPanel] = useState<Panel>(null);
  const [courier, setCourier] = useState(entry?.courier || '');
  const [tracking, setTracking] = useState(entry?.pickupTrackingNo || '');
  const [pickupAd, setPickupAd] = useState(entry?.pickupDateAd || getTodayAd());
  const [receivedAd, setReceivedAd] = useState(getTodayAd());
  const [received, setReceived] = useState<Record<number, { qty: number; condition: GoodsCondition }>>({});
  const [resolution, setResolution] = useState<TicketResolutionType | ''>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState(entry?.assignedTo || '');
  const [packedBy, setPackedBy] = useState(entry?.packedBy || '');
  const [fault, setFault] = useState<TicketFault | ''>(entry?.fault || '');

  if (!entry) return (
    <SlideOverPanel isOpen onClose={onClose} title="Ticket not found"><p className="p-5 text-xs text-slate-600">This ticket was removed or you no longer have access to its brand.</p></SlideOverPanel>
  );

  const type = ticketTypeOf(entry), stage = ticketStageOf(entry), lines = ticketLinesOf(entry);
  const canEdit = db.canWorkTickets('EDIT');
  const waiting = awaitingGoods(entry), open = OPEN_STAGES.includes(stage);
  const order = entry.orderId ? db.getOrderById(entry.orderId) : undefined;
  const replacement = entry.exchangeOrderId ? db.getOrderById(entry.exchangeOrderId) : undefined;
  const resend = entry.resendOrderId ? db.getOrderById(entry.resendOrderId) : undefined;
  const staff = db.getUsers().filter((user) => user.active !== false).map((user) => user.fullName).sort();
  const close = canClose(entry);
  const run = (action: () => void, done: string) => {
    try { action(); toast.success(done); setPanel(null); setNote(''); setVersion((value) => value + 1); }
    catch (problem) { toast.error(problem instanceof Error ? problem.message : 'That did not save.'); }
  };
  const resendItems = () => {
    const pick = lines.filter((line) => line.kind === 'MISSING' || line.kind === 'SHOULD_HAVE_SENT');
    const source = pick.length ? pick : lines.filter((line) => line.kind === 'BACK');
    return source.filter((line) => line.productId).map((line) => ({ productId: line.productId, productName: line.productName, brandCode: line.brandCode, quantity: line.quantity }));
  };
  const backLines = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.kind === 'BACK' || line.kind === 'SENT_WRONG');

  const facts: [string, React.ReactNode][] = [
    ['Order', order ? <Link key="o" href={`/orderflow/orders/${order.id}`} className="font-mono font-bold text-blue-700 hover:underline">{displayDocumentId(order.orderNumber)}</Link> : (entry.orderNumber ? displayDocumentId(entry.orderNumber) : '—')],
    ['Customer', <Link key="c" href={`/customers/${encodeURIComponent(entry.customerPhone)}`} className="font-bold text-blue-700 hover:underline">{entry.customerName}</Link>],
    ['Opened', `${formatDate(entry.dateAd, entry.dateBs)} · ${ticketAgeDays(entry, getTodayAd())} days ago`],
    ['Reason', entry.reasonCategory],
    ['Fault', entry.fault ? FAULT_LABEL[entry.fault] : '—'],
    ...(entry.packedBy || type === 'SHORT_SHIPPED' || type === 'WRONG_ITEM' ? [['Packed by', entry.packedBy || 'Not recorded'] as [string, React.ReactNode]] : []),
    ['Assigned to', entry.assignedTo || 'No one'],
    ['Goods back', !expectsGoodsBack(entry) ? 'Not expected' : entry.receivedDateAd ? `Received ${formatDate(entry.receivedDateAd)}${entry.receivedBy ? ` by ${entry.receivedBy}` : ''}` : isTracked(entry) ? 'Not received yet' : 'Not tracked (logged before tickets)'],
    ...(entry.courier || entry.pickupTrackingNo ? [['Return courier', `${entry.courier || '—'}${entry.pickupTrackingNo ? ` · ${entry.pickupTrackingNo}` : ''}${entry.pickupDateAd ? ` · pickup ${formatDate(entry.pickupDateAd)}` : ''}`] as [string, React.ReactNode]] : []),
    ['Resolution', entry.resolution ? `${RESOLUTION_LABEL[entry.resolution.type]}${entry.resolution.amount ? ` · NPR ${entry.resolution.amount.toLocaleString()}` : ''}` : entry.orderStatus !== 'Pending' ? entry.orderStatus : 'Not decided'],
  ];

  return (
    <SlideOverPanel isOpen onClose={onClose} width="lg" title={`${ticketRef(entry)} · ${entry.customerName}`} subtitle={`${entry.productName}${entry.orderNumber ? ` · ${displayDocumentId(entry.orderNumber)}` : ''}`}>
      <div className="space-y-5 p-5 text-xs">
        <div className="flex flex-wrap items-center gap-2"><TicketTypeBadge type={type} /><TicketStageBadge stage={stage} />
          {waiting && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">Waiting for goods</span>}
        </div>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
          {facts.map(([term, detail]) => (<div key={term} className="min-w-0"><dt className="text-[11px] font-bold text-slate-500">{term}</dt><dd className="truncate text-slate-900">{detail}</dd></div>))}
        </dl>

        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-500">Products</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[420px] text-left">
              <thead className="bg-slate-50 text-[11px] text-slate-500"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">What</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2">Condition</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, index) => (
                  <tr key={index}>
                    <td className="px-3 py-2 font-semibold text-slate-900">{line.productName}{line.comboName && <span className="block text-[11px] font-normal text-slate-500">from {line.comboName}</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{LINE_KIND_LABEL[line.kind]}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{line.quantity}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{line.kind === 'BACK' || line.kind === 'SENT_WRONG' ? (line.receivedQty ?? '—') : ''}</td>
                    <td className="px-3 py-2 text-slate-600">{line.condition ? CONDITION_LABEL[line.condition] : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {(replacement || resend) && (
          <section className="space-y-1.5">
            {[replacement && ['Exchange order', replacement] as const, resend && ['Resend order', resend] as const].filter(Boolean).map((row) => { const [label, linked] = row as readonly [string, NonNullable<typeof resend>]; return (
              <Link key={label} href={`/orderflow/orders/${linked.id}`} className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/60 px-3 py-2 hover:bg-purple-50">
                <span><span className="text-[11px] font-bold text-purple-800">{label}</span> <span className="font-mono font-bold text-slate-900">{displayDocumentId(linked.orderNumber)}</span></span>
                <OrderStatusBadge status={linked.status} />
              </Link>
            ); })}
          </section>
        )}

        {canEdit && (
          <section className="space-y-2">
            <p className="text-[11px] font-bold text-slate-500">Next step</p>
            <div className="flex flex-wrap gap-2">
              {waiting && !entry.pickupDateAd && stage !== 'IN_TRANSIT' && <button type="button" onClick={() => setPanel(panel === 'pickup' ? null : 'pickup')} className="btn btn-secondary"><Truck className="h-4 w-4" />Arrange pickup</button>}
              {waiting && stage !== 'IN_TRANSIT' && <button type="button" onClick={() => run(() => db.arrangeTicketPickup(entry.id, { inTransit: true }), 'Marked on the way back')} className="btn btn-secondary"><Truck className="h-4 w-4" />On the way back</button>}
              {waiting && <button type="button" onClick={() => { setPanel(panel === 'receive' ? null : 'receive'); setReceived(Object.fromEntries(backLines.map(({ line, index }) => [index, { qty: line.quantity, condition: 'GOOD' as GoodsCondition }]))); }} className="btn btn-primary"><PackageCheck className="h-4 w-4" />Mark received in-house</button>}
              {open && <button type="button" onClick={() => setPanel(panel === 'resolve' ? null : 'resolve')} className="btn btn-primary"><CheckCircle2 className="h-4 w-4" />Resolve</button>}
              {(type === 'SHORT_SHIPPED' || type === 'WRONG_ITEM' || type === 'RTO') && !resend && order && stage !== 'REJECTED' && stage !== 'CLOSED' && (
                <button type="button" onClick={() => run(() => db.createResendOrder(entry.id, { items: resendItems() }), 'Resend order created at NPR 0')} className="btn btn-secondary"><Send className="h-4 w-4" />Create resend order</button>
              )}
              {(type === 'RETURN' || type === 'EXCHANGE') && !replacement && onExchange && stage !== 'REJECTED' && <button type="button" onClick={() => onExchange(entry)} className="btn btn-secondary"><RotateCcw className="h-4 w-4" />Exchange order</button>}
              {stage === 'RESOLVED' && <button type="button" disabled={!close.ok} title={close.reason} onClick={() => run(() => db.moveTicket(entry.id, 'CLOSED'), 'Ticket closed')} className="btn btn-secondary disabled:opacity-50"><Lock className="h-4 w-4" />Close</button>}
              {open && <button type="button" onClick={() => setPanel(panel === 'reject' ? null : 'reject')} className="btn btn-quiet"><XCircle className="h-4 w-4" />Reject</button>}
              {(stage === 'RESOLVED' || stage === 'CLOSED' || stage === 'REJECTED') && <button type="button" onClick={() => run(() => db.moveTicket(entry.id, 'OPEN'), 'Ticket reopened')} className="btn btn-quiet"><RotateCcw className="h-4 w-4" />Reopen</button>}
              <button type="button" onClick={() => setPanel(panel === 'note' ? null : 'note')} className="btn btn-quiet"><MessageSquarePlus className="h-4 w-4" />Details and note</button>
            </div>
            {stage === 'RESOLVED' && !close.ok && <p className="text-[11px] text-amber-700">{close.reason}</p>}

            {panel === 'pickup' && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                <div><label htmlFor="t-courier" className="mb-1 block font-bold text-slate-700">Courier</label><input id="t-courier" value={courier} onChange={(event) => setCourier(event.target.value)} placeholder="Pathao, NCM…" className={field} /></div>
                <div><label htmlFor="t-track" className="mb-1 block font-bold text-slate-700">Tracking number</label><input id="t-track" value={tracking} onChange={(event) => setTracking(event.target.value)} className={field} /></div>
                <DualDateField id="t-pickup" label="Pickup date" valueAd={pickupAd} onChange={(ad) => ad && setPickupAd(ad)} />
                <div className="sm:col-span-3 flex justify-end"><button type="button" onClick={() => run(() => db.arrangeTicketPickup(entry.id, { courier, trackingNo: tracking, dateAd: pickupAd }), 'Pickup arranged')} className="btn btn-primary">Save pickup</button></div>
              </div>
            )}

            {panel === 'receive' && (
              <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
                <p className="font-bold text-teal-900">Check the parcel in</p>
                {backLines.map(({ line, index }) => { const row = received[index] || { qty: line.quantity, condition: 'GOOD' as GoodsCondition }; return (
                  <div key={index} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_90px_170px]">
                    <span className="font-semibold text-slate-900">{line.productName}<span className="block text-[11px] font-normal text-slate-500">{line.quantity} expected</span></span>
                    <NumberInput aria-label={`Units of ${line.productName} received`} type="number" min={0} max={line.quantity} value={row.qty} onChange={(event) => setReceived((current) => ({ ...current, [index]: { ...row, qty: Math.max(0, Math.min(line.quantity, Math.round(Number(event.target.value)) || 0)) } }))} className={field} />
                    <select aria-label={`Condition of ${line.productName}`} value={row.condition} onChange={(event) => setReceived((current) => ({ ...current, [index]: { ...row, condition: event.target.value as GoodsCondition } }))} className={field}>
                      {(Object.keys(CONDITION_LABEL) as GoodsCondition[]).map((key) => <option key={key} value={key}>{CONDITION_LABEL[key]}</option>)}
                    </select>
                  </div>
                ); })}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DualDateField id="t-received" label="Received on" required valueAd={receivedAd} maxAd={getTodayAd()} minAd={entry.dateAd} onChange={(ad) => ad && setReceivedAd(ad)} />
                  <div><label htmlFor="t-rnote" className="mb-1 block font-bold text-slate-700">Note</label><input id="t-rnote" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Seal broken, box dented…" className={field} /></div>
                </div>
                <div className="flex justify-end"><button type="button" onClick={() => run(() => db.receiveTicketGoods(entry.id, { dateAd: receivedAd, note, lines: backLines.map(({ index, line }) => ({ index, receivedQty: received[index]?.qty ?? line.quantity, condition: received[index]?.condition || 'GOOD' })) }), 'Goods received in-house')} className="btn btn-primary">Save receipt</button></div>
              </div>
            )}

            {panel === 'resolve' && (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Resolution">
                  {resolutionsFor(type).map((option) => (
                    <button key={option} type="button" role="radio" aria-checked={resolution === option} onClick={() => setResolution(option)} className={`rounded-xl border px-3 py-1.5 font-bold ${resolution === option ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'}`}>{RESOLUTION_LABEL[option]}</button>
                  ))}
                </div>
                {resolution === 'EXCHANGE' && !replacement && <p className="text-[11px] text-purple-800">Use Exchange order to create or link the replacement. The ticket is resolved when it is linked.</p>}
                {resolution === 'RESEND' && !resend && <p className="text-[11px] text-slate-600">Create the resend order too, so the parcel goes out with dispatch.</p>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(resolution === 'REFUND' || resolution === 'STORE_CREDIT') && <div><label htmlFor="t-amount" className="mb-1 block font-bold text-slate-700">Amount (NPR){resolution === 'REFUND' && <span className="text-rose-600"> *</span>}</label><NumberInput id="t-amount" type="number" min={0} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={field} /></div>}
                  <div className={resolution === 'REFUND' || resolution === 'STORE_CREDIT' ? '' : 'sm:col-span-2'}><label htmlFor="t-note" className="mb-1 block font-bold text-slate-700">Note</label><input id="t-note" value={note} onChange={(event) => setNote(event.target.value)} className={field} /></div>
                </div>
                <div className="flex justify-end"><button type="button" disabled={!resolution || (resolution === 'EXCHANGE' && !replacement)} onClick={() => resolution && run(() => db.resolveTicket(entry.id, { type: resolution, ...(amount !== '' ? { amount: Number(amount) } : {}), note }), 'Ticket resolved')} className="btn btn-primary disabled:opacity-50">Save resolution</button></div>
              </div>
            )}

            {panel === 'reject' && (
              <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                <label htmlFor="t-reject" className="block font-bold text-slate-700">Why is it rejected? <span className="text-rose-600">*</span></label>
                <input id="t-reject" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Outside the return window, product used…" className={field} />
                <div className="flex justify-end"><button type="button" onClick={() => run(() => db.moveTicket(entry.id, 'REJECTED', note), 'Ticket rejected')} className="btn btn-primary">Reject ticket</button></div>
              </div>
            )}

            {panel === 'note' && (
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                <div><label htmlFor="t-assign" className="mb-1 block font-bold text-slate-700">Assigned to</label>
                  <select id="t-assign" value={assignee} onChange={(event) => setAssignee(event.target.value)} className={field}><option value="">No one</option>{staff.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
                <div><label htmlFor="t-packed" className="mb-1 block font-bold text-slate-700">Packed by</label><input id="t-packed" list="t-packers" value={packedBy} onChange={(event) => setPackedBy(event.target.value)} className={field} /><datalist id="t-packers">{staff.map((name) => <option key={name} value={name} />)}</datalist></div>
                <div><label htmlFor="t-fault" className="mb-1 block font-bold text-slate-700">Fault</label>
                  <select id="t-fault" value={fault} onChange={(event) => setFault(event.target.value as TicketFault)} className={field}><option value="">Not set</option>{(Object.keys(FAULT_LABEL) as TicketFault[]).map((key) => <option key={key} value={key}>{FAULT_LABEL[key]}</option>)}</select></div>
                <div className="sm:col-span-3"><label htmlFor="t-nnote" className="mb-1 block font-bold text-slate-700">Note for the timeline</label><input id="t-nnote" value={note} onChange={(event) => setNote(event.target.value)} className={field} /></div>
                <div className="sm:col-span-3 flex justify-end"><button type="button" onClick={() => run(() => db.updateTicketDetails(entry.id, { assignedTo: assignee, packedBy, ...(fault ? { fault } : {}), note }), 'Ticket updated')} className="btn btn-primary">Save</button></div>
              </div>
            )}
          </section>
        )}

        <section>
          <p className="mb-2 text-[11px] font-bold text-slate-500">Timeline</p>
          {entry.timeline?.length ? (
            <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
              {[...entry.timeline].reverse().map((event, index) => (
                <li key={index} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500" aria-hidden="true" />
                  <p className="text-slate-900">{event.note}</p>
                  <p className="text-[11px] text-slate-500">{new Date(event.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {event.by}{event.stage ? ` · ${event.stage.replace('_', ' ').toLowerCase()}` : ''}</p>
                </li>
              ))}
            </ol>
          ) : <p className="text-slate-500">Logged {formatDate(entry.dateAd, entry.dateBs)}. Steps are recorded here from the next change.</p>}
        </section>
      </div>
    </SlideOverPanel>
  );
}
