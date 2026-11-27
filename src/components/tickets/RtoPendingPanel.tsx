'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, MessageSquareText, PackageCheck, Truck, X } from 'lucide-react';
import Portal from '@/components/common/Portal';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';
import { rtoRows, ticketLinesOf, type GoodsCondition, type RtoRow } from '@/lib/order-tickets';
import { displayDocumentId } from '@/lib/document-ids';
import { formatDualDate, getTodayAd } from '@/lib/nepali-calendar';

/** A parcel coming back that has not arrived after this many days is overdue: ask the courier. */
const OVERDUE_DAYS = 7;
const bs = (ad?: string) => (ad ? formatDualDate(ad).split(' (')[0] : '');

function chaseMessage(row: RtoRow) {
  return `Hello, this is Brand Bucket. Order ${displayDocumentId(row.orderNumber)} for ${row.customerName}${row.district ? `, ${row.district}` : ''} was sent back to us${row.rtoDateAd ? ` on ${row.rtoDateAd}` : ''}${row.daysWaiting ? ` (${row.daysWaiting} days ago)` : ''}, but it has not reached our warehouse. Where is the parcel now, and when will it arrive?`;
}

/**
 * Parcels on their way back to us (RTO). Pending until someone marks them back at the warehouse;
 * anything waiting a week or more is overdue, with the message to send the courier.
 */
export default function RtoPendingPanel() {
  const [version, setVersion] = useState(0);
  useEffect(() => { const refresh = () => setVersion((n) => n + 1); window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);
  const today = getTodayAd();
  const rows = useMemo(() => { void version; return rtoRows(db.getDeliveryFailures('ALL'), db.getOrderIssues('ALL'), db.getOrders('ALL'), today); }, [version, today]);
  const [tab, setTab] = useState<'PENDING' | 'BACK'>('PENDING');
  const [chasing, setChasing] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [receiving, setReceiving] = useState<RtoRow | null>(null);
  const [receivedOn, setReceivedOn] = useState(today);
  const [condition, setCondition] = useState<GoodsCondition>('GOOD');
  const [note, setNote] = useState('');

  const pending = rows.filter((row) => !row.back).sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0));
  const back = rows.filter((row) => row.back);
  const overdue = pending.filter((row) => (row.daysWaiting ?? 0) >= OVERDUE_DAYS);
  const pendingValue = pending.reduce((sum, row) => sum + row.value, 0);
  const avgBack = back.filter((row) => row.daysToReturn !== null);
  const avgDays = avgBack.length ? Math.round((avgBack.reduce((sum, row) => sum + (row.daysToReturn || 0), 0) / avgBack.length) * 10) / 10 : null;
  const shown = tab === 'PENDING' ? pending : back.slice(0, 50);

  const copy = async (row: RtoRow) => {
    try { await navigator.clipboard.writeText(chaseMessage(row)); toast.success('Message copied. Paste it to the courier.'); }
    catch { toast.error('Could not copy. Select the message and copy it.'); }
  };
  const saveChase = (row: RtoRow) => {
    try { db.chaseRto(row.failureId, reply); setReply(''); setChasing(null); setVersion((n) => n + 1); toast.success('Saved what the courier said.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Not saved.'); }
  };
  const markBack = () => {
    if (!receiving?.ticketId) return;
    try {
      const ticket = db.getOrderIssues('ALL').find((entry) => entry.id === receiving.ticketId);
      if (!ticket) throw new Error('This RTO ticket was not found. Refresh and try again.');
      const lines = ticketLinesOf(ticket).map((line, index) => ({ index, receivedQty: line.quantity, condition }));
      db.receiveTicketGoods(ticket.id, { dateAd: receivedOn, lines, note: note.trim() || undefined });
      toast.success(`${displayDocumentId(receiving.orderNumber)} is back at the warehouse.`);
      setReceiving(null); setNote(''); setCondition('GOOD'); setVersion((n) => n + 1);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Not saved.'); }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="rto-title">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="rto-title" className="flex items-center gap-2 text-sm font-bold text-slate-900"><Truck className="h-4 w-4 text-amber-600" />Parcels coming back (RTO)</h2>
          <p className="mt-0.5 text-xs text-slate-500">Pending until marked back at the warehouse. Waiting {OVERDUE_DAYS}+ days: ask the courier where it is.</p>
        </div>
        <div role="tablist" aria-label="RTO parcels" className="flex gap-1 self-start rounded-xl bg-slate-100 p-1 text-xs">
          {([['PENDING', `RTO pending (${pending.length})`], ['BACK', `Back (${back.length})`]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`rounded-lg px-3 py-1.5 font-bold ${tab === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 p-5 pb-0 lg:grid-cols-4">
        {[
          { label: 'Not back yet', value: pending.length, tone: 'text-amber-700' },
          { label: `Waiting ${OVERDUE_DAYS}+ days`, value: overdue.length, tone: overdue.length ? 'text-rose-700' : 'text-slate-900' },
          { label: 'Value still out', value: `Rs. ${Math.round(pendingValue).toLocaleString()}`, tone: 'text-slate-900' },
          { label: 'Days to come back (average)', value: avgDays ?? '–', tone: 'text-slate-900' },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
            <dt className="text-[11px] font-semibold text-slate-500">{tile.label}</dt>
            <dd className={`text-lg font-black tabular-nums ${tile.tone}`}>{tile.value}</dd>
          </div>
        ))}
      </dl>

      <div className="p-5">
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-600">
            {tab === 'PENDING' ? 'No parcels on their way back. Use RTO on a failed delivery when the courier returns it.' : 'No RTO parcels marked back yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {shown.map((row) => {
              const late = !row.back && (row.daysWaiting ?? 0) >= OVERDUE_DAYS;
              return (
                <li key={row.failureId} className="p-3 sm:p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/orderflow/orders/${row.orderId}`} className="font-mono text-sm font-bold text-blue-700 hover:underline">{displayDocumentId(row.orderNumber)}</Link>
                        {row.back
                          ? <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-bold text-teal-800">Back {bs(row.receivedDateAd)}</span>
                          : <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${late ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'}`}>{row.daysWaiting === null ? 'RTO pending' : `Waiting ${row.daysWaiting} ${row.daysWaiting === 1 ? 'day' : 'days'}`}</span>}
                        <span className="text-slate-500">{row.courier}</span>
                      </div>
                      <p className="mt-1 text-slate-700"><strong>{row.customerName}</strong>{row.district ? ` · ${row.district}` : ''} · {row.units} {row.units === 1 ? 'item' : 'items'}{row.value ? ` · Rs. ${row.value.toLocaleString()}` : ''}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Failed {bs(row.failedDateAd)} ({row.reason}){row.rtoDateAd ? ` · RTO since ${bs(row.rtoDateAd)}` : ''}{row.back && row.daysToReturn !== null ? ` · took ${row.daysToReturn} days` : ''}
                      </p>
                      {row.lastChasedAd && <p className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-700"><MessageSquareText className="mr-1 inline h-3 w-3 text-slate-400" />Courier asked {bs(row.lastChasedAd)}{row.chases > 1 ? ` (${row.chases} times)` : ''}: “{row.lastChaseNote}”</p>}
                    </div>
                    {!row.back && (
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button type="button" onClick={() => { setChasing(chasing === row.failureId ? null : row.failureId); setReply(''); }} aria-expanded={chasing === row.failureId}
                          className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${late ? 'border-rose-300 text-rose-800 hover:bg-rose-50' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}><MessageSquareText className="h-3.5 w-3.5" />Ask courier</button>
                        {row.ticketId
                          ? <button type="button" onClick={() => { setReceiving(row); setReceivedOn(today); }} className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"><PackageCheck className="h-3.5 w-3.5" />Mark back</button>
                          : <Link href="/reviews/returns" className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open returns</Link>}
                      </div>
                    )}
                    {row.back && row.ticketId && <Link href={`/reviews/returns?ticket=${encodeURIComponent(row.ticketId)}`} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline">Open ticket</Link>}
                  </div>
                  {chasing === row.failureId && (
                    <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                      <p className="font-semibold text-slate-700">Message for {row.courier}</p>
                      <p className="rounded-lg bg-white p-2.5 text-slate-800">{chaseMessage(row)}</p>
                      <button type="button" onClick={() => copy(row)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-50"><Copy className="h-3.5 w-3.5" />Copy message</button>
                      <label className="block pt-1">
                        <span className="mb-1 block font-semibold text-slate-700">What did the courier say?</span>
                        <div className="flex gap-2">
                          <input value={reply} maxLength={300} onChange={(e) => setReply(e.target.value)} placeholder="e.g. At Pokhara hub, back by Friday"
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveChase(row); } }}
                            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500" />
                          <button type="button" onClick={() => saveChase(row)} disabled={!reply.trim()} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Save</button>
                        </div>
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {receiving && (
        <Portal><div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="rto-back-title">
          <div className="w-full max-w-md space-y-4 rounded-t-2xl bg-white p-5 text-xs shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="rto-back-title" className="text-base font-bold text-slate-900">Parcel back at the warehouse</h3>
                <p className="text-slate-500">{displayDocumentId(receiving.orderNumber)} · {receiving.customerName} · {receiving.units} {receiving.units === 1 ? 'item' : 'items'}</p>
              </div>
              <button type="button" onClick={() => setReceiving(null)} aria-label="Close" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <label className="block"><span className="mb-1 block font-semibold text-slate-700">Arrived on</span>
              <input type="date" value={receivedOn} max={today} min={receiving.rtoDateAd} onChange={(e) => setReceivedOn(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <span className="ml-2 text-slate-500">{bs(receivedOn)}</span>
            </label>
            <fieldset>
              <legend className="mb-1 font-semibold text-slate-700">Condition of everything in it</legend>
              <div className="flex flex-wrap gap-1.5">
                {([['GOOD', 'Good, can be sold'], ['DAMAGED', 'Damaged'], ['UNSELLABLE', 'Cannot be sold']] as const).map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={condition === key} onClick={() => setCondition(key)}
                    className={`rounded-lg border px-3 py-1.5 font-semibold ${condition === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>{label}</button>
                ))}
              </div>
            </fieldset>
            <label className="block"><span className="mb-1 block font-semibold text-slate-700">Note</span>
              <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <p className="text-[11px] text-slate-500">Items missing or in mixed condition? <Link href={`/reviews/returns?ticket=${encodeURIComponent(receiving.ticketId || '')}`} className="font-semibold text-blue-700 underline">Check them in one by one on the ticket</Link>.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReceiving(null)} className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={markBack} className="rounded-lg bg-teal-600 px-5 py-2 font-semibold text-white hover:bg-teal-700">Mark back</button>
            </div>
          </div>
        </div></Portal>
      )}
    </section>
  );
}
