'use client';

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import PagedList from '@/components/common/PagedList';
import { displayDocumentId } from '@/lib/document-ids';
import { getTodayAd } from '@/lib/nepali-calendar';
import type { ReturnEntry } from '@/lib/types';
import { TicketStageBadge, TicketTypeBadge } from './TicketBadges';
import {
  awaitingGoods, expectsGoodsBack, isTracked, OPEN_STAGES, TICKET_TYPE_LABEL, ticketAgeDays, ticketLinesOf, ticketRef, ticketStageOf, ticketTypeOf, type TicketType,
} from '@/lib/order-tickets';

type Tab = 'ACTION' | 'WAITING' | 'RESOLVED' | 'CLOSED' | 'REJECTED' | 'ALL';
const TABS: { key: Tab; label: string; test: (entry: ReturnEntry) => boolean }[] = [
  { key: 'ACTION', label: 'Needs action', test: (entry) => OPEN_STAGES.includes(ticketStageOf(entry)) },
  { key: 'WAITING', label: 'Waiting for goods', test: awaitingGoods },
  { key: 'RESOLVED', label: 'Resolved', test: (entry) => ticketStageOf(entry) === 'RESOLVED' },
  { key: 'CLOSED', label: 'Closed', test: (entry) => ticketStageOf(entry) === 'CLOSED' },
  { key: 'REJECTED', label: 'Rejected', test: (entry) => ticketStageOf(entry) === 'REJECTED' },
  { key: 'ALL', label: 'All', test: () => true },
];

/** Every order issue as a ticket list: stage tabs, type filter, and how long each has been open. */
export default function TicketList({ tickets, onOpen }: { tickets: ReturnEntry[]; onOpen: (entry: ReturnEntry) => void }) {
  const [tab, setTab] = useState<Tab>('ACTION');
  const [type, setType] = useState<TicketType | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const today = getTodayAd();
  const counts = useMemo(() => Object.fromEntries(TABS.map((entry) => [entry.key, tickets.filter(entry.test).length])), [tickets]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = TABS.find((entry) => entry.key === tab)!.test;
    return tickets.filter((entry) => test(entry) && (type === 'ALL' || ticketTypeOf(entry) === type) && (!q || [ticketRef(entry), entry.customerName, entry.customerPhone, entry.orderNumber || '', entry.productName, entry.packedBy || '', entry.courier || '', entry.pickupTrackingNo || '']
      .some((value) => value.toLowerCase().includes(q))))
      // Oldest open work first; finished tickets newest first.
      .sort((a, b) => tab === 'ACTION' || tab === 'WAITING' ? a.dateAd.localeCompare(b.dateAd) : b.dateAd.localeCompare(a.dateAd));
  }, [tickets, tab, type, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Ticket stage">
        {TABS.map((entry) => (
          <button key={entry.key} type="button" role="tab" aria-selected={tab === entry.key} onClick={() => setTab(entry.key)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition ${tab === entry.key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'}`}>
            {entry.label} <span className={`ml-1 tabular-nums ${tab === entry.key ? 'text-blue-100' : 'text-slate-400'}`}>{counts[entry.key]}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px]">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ticket, customer, order, product, packer, tracking…" aria-label="Search tickets" className="w-full bg-transparent text-xs outline-none" />
        </label>
        <select aria-label="Ticket type" value={type} onChange={(event) => setType(event.target.value as TicketType | 'ALL')} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
          <option value="ALL">All types</option>
          {(Object.keys(TICKET_TYPE_LABEL) as TicketType[]).map((key) => <option key={key} value={key}>{TICKET_TYPE_LABEL[key]}</option>)}
        </select>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-xs shadow-sm">
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[880px] text-left">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500">
              <tr><th className="px-4 py-3">Ticket</th><th className="px-4 py-3">Type · stage</th><th className="px-4 py-3">Customer · order</th><th className="px-4 py-3">Products</th><th className="px-4 py-3">Goods back</th><th className="px-4 py-3 text-right">Age</th><th className="px-4 py-3">Assigned</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-slate-500">No tickets here.</td></tr> : (
                <PagedList items={rows} label="tickets" asRow columns={7} render={(page) => page.map((entry) => {
                  const stage = ticketStageOf(entry), lines = ticketLinesOf(entry), age = ticketAgeDays(entry, today);
                  const open = OPEN_STAGES.includes(stage);
                  return (
                    <tr key={entry.id} onClick={() => onOpen(entry)} onKeyDown={(event) => { if (event.key === 'Enter') onOpen(entry); }} tabIndex={0} className="cursor-pointer hover:bg-slate-50/80 focus:bg-blue-50/50 focus:outline-none">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{ticketRef(entry)}</td>
                      <td className="px-4 py-3"><div className="flex flex-col items-start gap-1"><TicketTypeBadge type={ticketTypeOf(entry)} /><TicketStageBadge stage={stage} /></div></td>
                      <td className="px-4 py-3"><div className="font-bold text-slate-900">{entry.customerName}</div><div className="font-mono text-[11px] text-slate-500">{entry.orderNumber ? displayDocumentId(entry.orderNumber) : entry.customerPhone}</div></td>
                      <td className="max-w-[240px] px-4 py-3 text-slate-700">{lines.slice(0, 3).map((line, index) => <div key={index} className="truncate"><span className="font-mono tabular-nums">{line.quantity}×</span> {line.productName}{line.kind === 'MISSING' ? ' (missing)' : line.kind === 'SENT_WRONG' ? ' (sent by mistake)' : line.kind === 'SHOULD_HAVE_SENT' ? ' (should have gone)' : ''}</div>)}{lines.length > 3 && <div className="text-[11px] text-slate-500">+{lines.length - 3} more</div>}</td>
                      <td className="px-4 py-3 text-[11px]">{!expectsGoodsBack(entry) ? <span className="text-slate-500">Not expected</span> : entry.receivedDateAd ? <span className="font-semibold text-teal-700">Received {entry.receivedDateAd}</span> : !isTracked(entry) ? <span className="text-slate-400">Not tracked</span> : <span className="font-semibold text-amber-700">Not yet{entry.courier ? ` · ${entry.courier}` : ''}</span>}</td>
                      <td className={`px-4 py-3 text-right font-mono tabular-nums ${open && age > 7 ? 'font-bold text-rose-700' : open && age > 3 ? 'text-amber-700' : 'text-slate-600'}`}>{age}d</td>
                      <td className="px-4 py-3 text-slate-600">{entry.assignedTo || '—'}</td>
                    </tr>
                  );
                })} />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
