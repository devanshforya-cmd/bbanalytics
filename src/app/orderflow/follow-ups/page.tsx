'use client';

import PagedList from '@/components/common/PagedList';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Phone, PhoneCall, Search, Settings2 } from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import InfoTip from '@/components/common/InfoTip';
import DownloadButton from '@/components/common/DownloadButton';
import EmptyState from '@/components/common/EmptyState';
import LogCustomerCallModal from '@/components/customer-calls/LogCustomerCallModal';
import { db } from '@/lib/db/db-service';
import { addDays, buildFollowUps, callSummary, type FollowUpItem, type FollowUpStatus } from '@/lib/follow-ups';
import { getTodayAd } from '@/lib/nepali-calendar';
import { displayDocumentId, matchesDocumentId } from '@/lib/document-ids';
import { canPerform, hasAccess, isSuperAdmin } from '@/lib/permissions';

type View = 'TODAY' | 'COMING' | 'NOT_REACHED' | 'DONE';
const VIEWS: { key: View; label: string; statuses: FollowUpStatus[] }[] = [
  { key: 'TODAY', label: 'To call today', statuses: ['DUE'] },
  { key: 'COMING', label: 'Coming up', statuses: ['UPCOMING'] },
  { key: 'NOT_REACHED', label: 'Not reached', statuses: ['NOT_REACHED'] },
  { key: 'DONE', label: 'Done', statuses: ['DONE'] },
];

const niceDate = (ad: string) => new Date(`${ad}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function useWorkspace() {
  const [version, setVersion] = useState(0);
  useEffect(() => { const bump = () => setVersion((v) => v + 1); window.addEventListener('bb-db-updated', bump); return () => window.removeEventListener('bb-db-updated', bump); }, []);
  return version;
}

function dueLabel(item: FollowUpItem) {
  if (item.status === 'DONE') return item.lastCall ? `Done ${item.lastCall.dateAd}` : 'Done';
  if (item.status === 'NOT_REACHED') return `Not reached after ${item.tries} tries`;
  if (!item.dueAd) return '';
  if (item.overdueDays > 0) return `${item.overdueDays} day${item.overdueDays === 1 ? '' : 's'} overdue`;
  if (item.overdueDays === 0) return 'Due today';
  if (item.overdueDays === -1) return 'Tomorrow';
  return niceDate(item.dueAd);
}

export default function FollowUpsPage() {
  const version = useWorkspace();
  const user = db.getCurrentUser();
  const canLog = isSuperAdmin(user) || canPerform(user, 'p.follow_ups', 'CREATE');
  const canSettings = isSuperAdmin(user) || hasAccess(user, 'p.settings_follow_ups');
  const today = getTodayAd();
  const [view, setView] = useState<View>('TODAY');
  const [query, setQuery] = useState('');
  const [stepId, setStepId] = useState('ALL');
  const [logging, setLogging] = useState<FollowUpItem | null>(null);

  // Re-read whenever the workspace changes (version).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => db.getFollowUpPlan(), [version]);
  // Re-read whenever the workspace changes (version).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const calls = useMemo(() => db.getCustomerCalls(), [version]);
  // Re-read whenever the workspace changes (version).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => buildFollowUps(db.getOrders(), calls, plan, today), [plan, calls, today, version]);

  const weekAgo = addDays(today, -7);
  const counts = Object.fromEntries(VIEWS.map((entry) => [entry.key, items.filter((item) => entry.statuses.includes(item.status) && (entry.key !== 'DONE' || (item.lastCall?.dateAd || '') >= weekAgo)).length])) as Record<View, number>;
  const overdue = items.filter((item) => item.status === 'DUE' && item.overdueDays > 0).length;
  const recentFollowUps = calls.filter((call) => call.followUpStepId && call.dateAd >= weekAgo);
  const reachRate = recentFollowUps.length ? Math.round((recentFollowUps.filter((call) => ['HAPPY', 'REORDER', 'ISSUE', 'SPOKE', 'CALL_BACK', 'DO_NOT_CALL'].includes(call.outcome)).length / recentFollowUps.length) * 100) : null;

  const statuses = VIEWS.find((entry) => entry.key === view)!.statuses;
  const shown = items
    .filter((item) => statuses.includes(item.status))
    .filter((item) => view !== 'DONE' || (item.lastCall?.dateAd || '') >= weekAgo)
    .filter((item) => stepId === 'ALL' || item.step.id === stepId)
    .filter((item) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return item.order.customerName.toLowerCase().includes(q) || item.order.customerPhone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§') || matchesDocumentId(q, item.order.orderNumber, item.order.legacyOrderNumber);
    })
    .sort((a, b) => view === 'DONE' ? (b.lastCall?.createdAt || '').localeCompare(a.lastCall?.createdAt || '') : (a.dueAd || '').localeCompare(b.dueAd || '') || a.order.orderDateAd.localeCompare(b.order.orderDateAd));

  return (
    <PageGuard feature="p.follow_ups">
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Follow-up calls
              <InfoTip label="About this page">Calls due to online customers after they order, worked out from the follow-up plan in Settings. Log each call here; every call also goes to the customer call log.</InfoTip>
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {plan.enabled && plan.steps.length ? `${plan.steps.length} call${plan.steps.length === 1 ? '' : 's'} per order: ${plan.steps.map((step) => `${step.label} (day ${step.daysAfter}${step.from === 'DELIVERY' ? ' after delivery' : ''})`).join(', ')}` : 'Follow-up calls are off.'}
            </p>
          </div>
          <div className="flex gap-2">
            {canSettings && <Link href="/settings?tab=follow-ups" className="btn btn-secondary"><Settings2 className="h-4 w-4" /> Change the plan</Link>}
            <DownloadButton datasets={['customer_calls']} records={{ customerCalls: calls.filter((call) => call.followUpStepId) } as any} />
          </div>
        </div>

        {(!plan.enabled || !plan.steps.length) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Follow-up calls are turned off, so none are planned.{canSettings ? <> <Link href="/settings?tab=follow-ups" className="font-semibold underline">Turn them on in Settings</Link>.</> : ' Ask an admin to turn them on.'}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'To call today', value: counts.TODAY, note: overdue ? `${overdue} overdue` : 'None overdue', alert: overdue > 0 },
            { label: 'Coming up', value: counts.COMING, note: 'Not yet due' },
            { label: 'Done this week', value: counts.DONE, note: 'Last 7 days' },
            { label: 'Reached', value: reachRate === null ? '—' : `${reachRate}%`, note: `${recentFollowUps.length} follow-up calls this week` },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-500">{card.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
              <p className={`text-[11px] ${card.alert ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{card.note}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Follow-ups" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {VIEWS.map((entry) => (
              <button key={entry.key} role="tab" aria-selected={view === entry.key} type="button" onClick={() => setView(entry.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === entry.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                {entry.label} ({counts[entry.key]})
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="fu-step">Which call</label>
          <select id="fu-step" value={stepId} onChange={(e) => setStepId(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
            <option value="ALL">Every call</option>
            {plan.steps.map((step) => <option key={step.id} value={step.id}>{step.label}</option>)}
          </select>
          <div className="flex min-w-[14rem] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
            <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <label className="sr-only" htmlFor="fu-search">Search</label>
            <input id="fu-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Customer, phone or order number" className="w-full py-2 text-xs outline-none" />
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState type="generic" icon={PhoneCall}
            title={view === 'TODAY' ? 'No calls due today' : view === 'COMING' ? 'Nothing coming up' : view === 'NOT_REACHED' ? 'Everyone was reached' : 'No follow-ups done this week'}
            description={view === 'TODAY' ? 'New orders get their first call on the day the plan sets.' : 'Calls appear here as orders come in.'} />
        ) : (
          <ul className="space-y-2.5">
            {<PagedList items={shown} label="calls due" render={(pageRows) => pageRows.map((item) => {
              const late = item.status === 'DUE' && item.overdueDays > 0;
              return (
                <li key={item.key} className={`rounded-xl border bg-white p-4 text-xs ${late ? 'border-rose-200' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-900">{item.order.customerName}</h2>
                        <a href={`tel:${item.order.customerPhone}`} className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden="true" />{item.order.customerPhone}</a>
                      </div>
                      <p className="mt-1 text-slate-600">
                        <Link href={`/orderflow/orders/${encodeURIComponent(item.order.id)}`} className="font-semibold text-slate-800 hover:underline">{displayDocumentId(item.order.orderNumber)}</Link>
                        {' '}· ordered {item.order.orderDateAd} · {item.order.brandCode} · {item.order.items.slice(0, 2).map((line) => `${line.quantity}× ${line.productName}`).join(', ')}{item.order.items.length > 2 ? ` and ${item.order.items.length - 2} more` : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 font-semibold text-teal-800">Call {item.stepNumber} of {item.stepCount}: {item.step.label}</span>
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${late ? 'bg-rose-50 text-rose-700' : item.status === 'DONE' ? 'bg-emerald-50 text-emerald-700' : item.status === 'NOT_REACHED' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}`}>{dueLabel(item)}</span>
                        {item.tries > 0 && item.status !== 'NOT_REACHED' && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">Tried {item.tries}×</span>}
                        {item.lastCall && <span className="text-slate-500">Last: {callSummary(item.lastCall)} ({item.lastCall.officerName}, {item.lastCall.dateAd})</span>}
                      </div>
                      {item.step.script && item.status !== 'DONE' && <p className="mt-2 text-slate-500">Ask: {item.step.script}</p>}
                      {item.lastCall?.notes && <p className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-600">{item.lastCall.notes}</p>}
                    </div>
                    {canLog && ['DUE', 'UPCOMING'].includes(item.status) && (
                      <button type="button" onClick={() => setLogging(item)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">
                        <PhoneCall className="h-4 w-4" aria-hidden="true" /> Log call
                      </button>
                    )}
                  </div>
                </li>
              );
            })} />}
          </ul>
        )}
      </div>
      {logging && (
        <LogCustomerCallModal order={logging.order} followUp={{ step: logging.step, stepNumber: logging.stepNumber, stepCount: logging.stepCount, tries: logging.tries }}
          onClose={() => setLogging(null)} />
      )}
    </PageGuard>
  );
}
