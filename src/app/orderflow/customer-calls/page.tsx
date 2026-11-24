'use client';

import PagedList from '@/components/common/PagedList';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Phone, PhoneCall, Plus, Search } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import InfoTip from '@/components/common/InfoTip';
import DownloadButton from '@/components/common/DownloadButton';
import EmptyState from '@/components/common/EmptyState';
import LogCustomerCallModal from '@/components/customer-calls/LogCustomerCallModal';
import { db } from '@/lib/db/db-service';
import { addDays, CALL_OUTCOMES, CALL_PURPOSES, outcomeInfo, phoneKey } from '@/lib/follow-ups';
import { getTodayAd } from '@/lib/nepali-calendar';
import { displayDocumentId, matchesDocumentId } from '@/lib/document-ids';
import { canPerform, isSuperAdmin } from '@/lib/permissions';

const TONE: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-800', warn: 'bg-amber-50 text-amber-800', bad: 'bg-rose-50 text-rose-700', neutral: 'bg-slate-100 text-slate-700',
};

/** Every call to an online customer. Store calls stay on the Call tracker. */
export default function CustomerCallsPage() {
  const [version, setVersion] = useState(0);
  useEffect(() => { const bump = () => setVersion((v) => v + 1); window.addEventListener('bb-db-updated', bump); return () => window.removeEventListener('bb-db-updated', bump); }, []);
  const user = db.getCurrentUser();
  const canLog = isSuperAdmin(user) || canPerform(user, 'p.customer_calls', 'CREATE');
  const today = getTodayAd();
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState('ALL');
  const [purpose, setPurpose] = useState('ALL');
  const [caller, setCaller] = useState('ALL');
  const [fromAd, setFromAd] = useState(addDays(today, -30));
  const [toAd, setToAd] = useState(today);
  const [logging, setLogging] = useState(false);

  // Re-read whenever the workspace changes (version).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const calls = useMemo(() => db.getCustomerCalls(), [version]);
  // Re-read whenever the workspace changes (version).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const orders = useMemo(() => new Map(db.getOrders('ALL' as any).map((order) => [order.id, order])), [version]);
  const callers = useMemo(() => [...new Map(calls.map((call) => [call.officerId, call.officerName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [calls]);

  const shown = calls.filter((call) => (!fromAd || call.dateAd >= fromAd) && (!toAd || call.dateAd <= toAd)
    && (outcome === 'ALL' || call.outcome === outcome)
    && (purpose === 'ALL' || call.purpose === purpose)
    && (caller === 'ALL' || call.officerId === caller)
    && (() => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const digits = phoneKey(q);
      return call.customerName.toLowerCase().includes(q) || (digits.length >= 3 && phoneKey(call.customerPhone).includes(digits))
        || matchesDocumentId(q, call.orderNumber) || (call.notes || '').toLowerCase().includes(q);
    })());

  const todayCalls = calls.filter((call) => call.dateAd === today);
  const reached = shown.filter((call) => outcomeInfo(call.outcome)?.reached).length;

  return (
    <PageGuard feature="p.customer_calls">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Customer call log
              <InfoTip label="About this page">Every call to online customers: planned follow-ups and any other call. Calls to stores are kept separately on the Call tracker.</InfoTip>
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">Online customers only. <Link href="/orderflow/follow-ups" className="font-semibold text-blue-700 hover:underline">See follow-up calls due</Link></p>
          </div>
          <div className="flex gap-2">
            <DownloadButton datasets={['customer_calls']} records={{ customerCalls: shown }} />
            {canLog && (
              <button type="button" onClick={() => setLogging(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">
                <Plus className="h-4 w-4" aria-hidden="true" /> Log a call
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Calls today', value: todayCalls.length },
            { label: 'Calls shown', value: shown.length },
            { label: 'Reached', value: shown.length ? `${Math.round((reached / shown.length) * 100)}%` : '—' },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-500">{card.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <div className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3">
            <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <label className="sr-only" htmlFor="cc-search">Search</label>
            <input id="cc-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Customer, phone, order or notes" className="w-full py-2 outline-none" />
          </div>
          <label className="font-semibold text-slate-600">From<input type="date" value={fromAd} onChange={(e) => setFromAd(e.target.value)} className="ml-1 rounded-lg border border-slate-200 px-2 py-1.5 font-normal" /></label>
          <label className="font-semibold text-slate-600">To<input type="date" value={toAd} onChange={(e) => setToAd(e.target.value)} className="ml-1 rounded-lg border border-slate-200 px-2 py-1.5 font-normal" /></label>
          <label className="sr-only" htmlFor="cc-outcome">Outcome</label>
          <select id="cc-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2">
            <option value="ALL">Any outcome</option>
            {CALL_OUTCOMES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="cc-purpose">About</label>
          <select id="cc-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2">
            <option value="ALL">Any reason</option>
            {CALL_PURPOSES.map((entry) => <option key={entry}>{entry}</option>)}
          </select>
          <label className="sr-only" htmlFor="cc-caller">Called by</label>
          <select id="cc-caller" value={caller} onChange={(e) => setCaller(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2">
            <option value="ALL">Anyone</option>
            {callers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>

        {shown.length === 0 ? (
          <EmptyState type="generic" icon={PhoneCall} title={calls.length ? 'No calls match' : 'No customer calls yet'}
            description={calls.length ? 'Change the dates or filters.' : 'Calls logged here or from Follow-up calls show up in this list.'} />
        ) : (
          <ul className="space-y-2">
            {<PagedList items={shown} label="calls" render={(pageRows) => pageRows.map((call) => {
              const info = outcomeInfo(call.outcome);
              const order = call.orderId ? orders.get(call.orderId) : undefined;
              return (
                <li key={call.id} className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{call.customerName}</span>
                        {call.customerPhone && <a href={`tel:${call.customerPhone}`} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{call.customerPhone}</a>}
                      </div>
                      <p className="mt-0.5 text-slate-600">
                        {call.followUpStepLabel ? `Follow-up: ${call.followUpStepLabel}` : call.purpose}
                        {call.orderNumber && <> · {order ? <Link href={`/orderflow/orders/${encodeURIComponent(order.id)}`} className="font-semibold text-slate-800 hover:underline">{displayDocumentId(call.orderNumber)}</Link> : displayDocumentId(call.orderNumber)}</>}
                        {call.brandCode && ` · ${call.brandCode}`}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 font-semibold ${TONE[info?.tone || 'neutral']}`}>
                      {info?.label || call.outcome}{call.outcome === 'CALL_BACK' && call.callbackDateAd ? `: ${call.callbackDateAd}` : ''}
                    </span>
                  </div>
                  {call.notes && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-700">{call.notes}</p>}
                  <p className="mt-2 text-[11px] text-slate-500">{call.officerName} · {call.dateBs || call.dateAd} ({call.dateAd}){call.createdAt ? `, ${new Date(call.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' })}` : ''}{call.durationMinutes ? ` · ${call.durationMinutes} min` : ''}</p>
                </li>
              );
            })} />}
          </ul>
        )}
      </div>
      {logging && <LogCustomerCallModal onClose={() => setLogging(false)} />}
    </PageGuard>
  );
}
