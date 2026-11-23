'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db/db-service';
import { ButtonRing } from '@/components/common/ProgressRing';

type Counts = { byCollection: Record<string, number>; staff: number; total: number };

const LABELS: Record<string, string> = {
  distributors: 'Chains and distributors', branches: 'Chain branches', retailers: 'Retail stores', visits: 'Store visits', beatItems: 'Beat plan stops',
  recurringSchedules: 'Visit schedules', secondaryOrders: 'Store orders', stockCounts: 'Stock counts', shelfPhotos: 'Shelf photos', facingAudits: 'Shelf share checks',
  callLogs: 'Store calls', customerCalls: 'Customer calls', cheques: 'Cheques', dispatches: 'Dispatches', documents: 'Store documents', tasks: 'Tasks', staffLiveLocations: 'Live locations',
  promotions: 'Trade promotions', reviewCategories: 'Issue categories', feedbackEntries: 'Reviews and complaints', influencers: 'Influencers',
  marketingSends: 'Marketing sends', influencerContent: 'Influencer content', campaigns: 'Offer campaigns (not live)',
};

async function call(method: 'GET' | 'POST' | 'DELETE') {
  const response = await fetch('/api/sample-data', { method, credentials: 'same-origin', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Test data tools could not be reached. Check your connection and try again.');
  return payload.data;
}

/** Load or remove the staging test data. Super Admins only. */
export default function TestDataSettings() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState<'load' | 'remove' | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(async () => {
    try { setCounts(await call('GET')); } catch (error) { setMessage({ tone: 'error', text: (error as Error).message }); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (kind: 'load' | 'remove') => {
    setBusy(kind); setMessage(null); setConfirming(false);
    try {
      const result = await call(kind === 'load' ? 'POST' : 'DELETE');
      await db.syncWithSupabase();
      await refresh();
      setMessage({ tone: 'ok', text: kind === 'load'
        ? `Loaded ${result.total.toLocaleString()} test records, the test brands and 5 test staff.`
        : `Removed ${Number(result.removed?.records || 0).toLocaleString()} test records, ${result.removed?.brands || 0} test brands and ${result.removed?.staff || 0} test staff. Your real data is unchanged.` });
    } catch (error) {
      setMessage({ tone: 'error', text: (error as Error).message });
    } finally { setBusy(null); }
  };

  const loaded = (counts?.total || 0) > 0;
  const rows = Object.entries(counts?.byCollection || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-black/[0.06] space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Test data</h2>
        <p className="text-sm text-slate-600 max-w-2xl">
          Fills the app with a realistic history so every page can be tried out: Renee and Pee Safe as test brands (Pee Safe with FURR,
          Comfort and Domina), products with short names, online customers and orders across channels and couriers, failed deliveries,
          returns, follow-up and customer calls, star-rated reviews, plus stores, field officers, visits, store orders, stock counts,
          cheques, dispatches, documents and influencers.
        </p>
        <p className="text-sm text-slate-600 max-w-2xl">
          Test orders count in the dashboards next to real ones while loaded. Every test record is tagged, and
          <strong> Remove test data</strong> deletes exactly those records, the test brands and the test staff, nothing else. Test staff cannot sign in. Sample offer campaigns are drafts or already ended, so they never change prices on real orders.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" onClick={() => run('load')} disabled={!!busy}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {busy === 'load' && <ButtonRing estimateMs={12000} />}
            {loaded ? 'Reload test data' : 'Load test data'}
          </button>
          {loaded && !confirming && (
            <button type="button" onClick={() => setConfirming(true)} disabled={!!busy}
              className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
              Remove test data
            </button>
          )}
          {confirming && (
            <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-900">
              Remove {counts?.total.toLocaleString()} test records, the test brands and the test staff?
              <button type="button" onClick={() => run('remove')} className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-3 py-1 font-semibold text-white hover:bg-rose-700">
                {busy === 'remove' && <ButtonRing estimateMs={5000} />}Remove
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 font-semibold text-rose-800 hover:bg-rose-100">Keep</button>
            </span>
          )}
        </div>
        {loaded && <p className="text-xs text-slate-500">Reloading replaces the current test records with a fresh set dated up to today. Changes you made to test records are lost; real records stay.</p>}
        {message && <p role="status" className={`text-sm font-medium ${message.tone === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>{message.text}</p>}
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-xs ring-1 ring-black/[0.06]">
        <h3 className="text-sm font-semibold text-slate-900">What&apos;s loaded now</h3>
        {!counts ? <p className="mt-2 text-sm text-slate-500">Checking…</p> : !loaded ? (
          <p className="mt-2 text-sm text-slate-500">No test data. Everything you see in the app is real.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
            <div className="flex justify-between text-sm"><span className="text-slate-600">Test field officers</span><span className="font-mono font-semibold text-slate-900">{counts.staff}</span></div>
            {rows.map(([collection, count]) => (
              <div key={collection} className="flex justify-between text-sm">
                <span className="text-slate-600">{LABELS[collection] || collection}</span>
                <span className="font-mono font-semibold text-slate-900">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
