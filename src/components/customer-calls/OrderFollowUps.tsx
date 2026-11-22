'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PhoneCall } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { buildFollowUps, callSummary, orderNeedsFollowUp, type FollowUpItem } from '@/lib/follow-ups';
import { getTodayAd } from '@/lib/nepali-calendar';
import { canPerform, hasAccess, isSuperAdmin } from '@/lib/permissions';
import type { Order } from '@/lib/types';
import LogCustomerCallModal from './LogCustomerCallModal';

const STATUS: Record<FollowUpItem['status'], string> = {
  DUE: 'Due', UPCOMING: 'Planned', QUEUED: 'Later', WAITING_DELIVERY: 'After delivery', DONE: 'Done', NOT_REACHED: 'Not reached', STOPPED: 'Stopped',
};

/** The follow-up calls for one order, and every call made about it. */
export default function OrderFollowUps({ order }: { order: Order }) {
  const user = db.getCurrentUser();
  const [version, setVersion] = useState(0);
  const [logging, setLogging] = useState<FollowUpItem | 'OTHER' | null>(null);
  useEffect(() => { const bump = () => setVersion((v) => v + 1); window.addEventListener('bb-db-updated', bump); return () => window.removeEventListener('bb-db-updated', bump); }, []);
  const visible = isSuperAdmin(user) || hasAccess(user, 'p.follow_ups') || hasAccess(user, 'p.customer_calls');
  const canLog = isSuperAdmin(user) || canPerform(user, 'p.follow_ups', 'CREATE') || canPerform(user, 'p.customer_calls', 'CREATE');
  // Re-read whenever the workspace changes (version).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const calls = useMemo(() => db.getCustomerCalls().filter((call) => call.orderId === order.id), [order.id, version]);
  // Re-read whenever the workspace changes (version).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => db.getFollowUpPlan(), [version]);
  // Re-read whenever the workspace changes (version).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => buildFollowUps([order], db.getCustomerCalls(), plan, getTodayAd()), [order, plan, version]);
  if (!visible) return null;
  const open = items.find((item) => item.status === 'DUE' || item.status === 'UPCOMING');

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs" aria-labelledby="order-follow-ups">
      <div className="flex items-center justify-between gap-2">
        <h2 id="order-follow-ups" className="flex items-center gap-2 text-sm font-bold text-slate-900"><PhoneCall className="h-4 w-4 text-teal-600" aria-hidden="true" /> Customer calls</h2>
        {canLog && <button type="button" onClick={() => setLogging(open || 'OTHER')} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700">{open ? `Log ${open.step.label.toLowerCase()} call` : 'Log a call'}</button>}
      </div>
      {orderNeedsFollowUp(order, plan) ? (
        <ol className="mt-3 space-y-1.5 text-xs">
          {items.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-2">
              <span className="text-slate-700">{item.stepNumber}. {item.step.label}{item.dueAd && !['DONE', 'NOT_REACHED', 'STOPPED'].includes(item.status) ? ` · ${item.dueAd}` : ''}</span>
              <span className={`rounded-full px-2 py-0.5 font-semibold ${item.status === 'DONE' ? 'bg-emerald-50 text-emerald-700' : item.status === 'DUE' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{STATUS[item.status]}</span>
            </li>
          ))}
        </ol>
      ) : <p className="mt-2 text-xs text-slate-500">No follow-up calls are planned for this order.</p>}
      {calls.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs">
          {calls.map((call) => (
            <li key={call.id}>
              <p className="font-semibold text-slate-800">{call.followUpStepLabel || call.purpose}: {callSummary(call)}</p>
              <p className="text-slate-500">{call.officerName} · {call.dateAd}{call.notes ? ` · ${call.notes}` : ''}</p>
            </li>
          ))}
        </ul>
      )}
      {hasAccess(user, 'p.customer_calls') && calls.length > 0 && <Link href={`/orderflow/customer-calls`} className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:underline">Open the call log</Link>}
      {logging && (
        <LogCustomerCallModal order={order} onClose={() => setLogging(null)}
          followUp={logging === 'OTHER' ? undefined : { step: logging.step, stepNumber: logging.stepNumber, stepCount: logging.stepCount, tries: logging.tries }} />
      )}
    </section>
  );
}
