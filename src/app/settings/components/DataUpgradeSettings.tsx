'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, DatabaseZap, RefreshCw } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import ConfirmModal from '@/components/common/ConfirmModal';
import { toast } from '@/components/common/Toast';

interface Plan { marketingOrders: number; ordersWithoutShortId: number; fieldOrdersWithoutShortId: number; dispatchesWithoutNumber: number; influencersWithoutNiches: number; contentToConvert: number; pending: number }
const LABELS: [keyof Plan, string, string][] = [
  ['marketingOrders', 'Marketing sends stored as orders', 'Moved into Marketing Sends and removed from orders'],
  ['ordersWithoutShortId', 'Orders without a short ID', 'Numbered in order of creation; the old ID is kept and stays searchable'],
  ['fieldOrdersWithoutShortId', 'Field orders without an SO number', 'Numbered SO-0001 onwards'],
  ['dispatchesWithoutNumber', 'Dispatches without a DP number', 'Numbered DP-0001 onwards'],
  ['influencersWithoutNiches', 'Influencers with a single category', 'Category becomes a niche; more can then be added'],
  ['contentToConvert', 'Content with a single link', 'Becomes one piece with a list of platform links'],
];

/** One-time, repeatable upgrade of records saved before the November 2026 release. Super Admin only. */
export default function DataUpgradeSettings() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/admin/data-upgrade', { cache: 'no-store', credentials: 'same-origin' });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(body?.error || 'The upgrade status could not be loaded.');
      setPlan(body.plan);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'The upgrade status could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const run = async () => {
    if (running) return; // One click, one run.
    setConfirm(false); setRunning(true); setFailures([]);
    try {
      const response = await fetch('/api/admin/data-upgrade', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(body?.error || 'The upgrade did not finish. Nothing was half-saved; run it again.');
      setPlan(body.after); setFailures(body.failures || []);
      await db.syncWithSupabase();
      if (body.after.pending === 0) toast.success('Data upgrade complete', 'Every earlier record now uses the new format.');
      else toast.warning('Upgrade finished with items left', `${body.after.pending} record(s) could not be upgraded. See the list below, then run it again.`);
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : 'The upgrade did not finish.'); }
    finally { setRunning(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><DatabaseZap className="h-4 w-4 text-blue-600" /> Data upgrade</h2>
        <p className="text-xs text-slate-500">Brings records saved before the November 2026 release into the new format. New records never need this. It is safe to run more than once.</p>
      </div>
      {loading ? <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white" role="status" aria-label="Checking records"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
        : error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800"><p className="font-bold">{error}</p><button type="button" onClick={() => void load()} className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-bold">Try again</button></div>
        : plan && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs">
            {plan.pending === 0 ? (
              <p className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Everything is up to date. Nothing to upgrade.</p>
            ) : (
              <p className="border-b border-slate-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">{plan.pending} record{plan.pending === 1 ? '' : 's'} still use the earlier format. Run the upgrade before the team starts the day, so existing orders get their short IDs in order of creation.</p>
            )}
            <ul className="divide-y divide-slate-100">
              {LABELS.map(([key, label, effect]) => (
                <li key={key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                  <span><span className="block font-semibold text-slate-800">{label}</span><span className="text-[11px] text-slate-500">{effect}</span></span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${plan[key] ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-700'}`}>{plan[key]}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              <button type="button" onClick={() => void load()} disabled={running} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Check again</button>
              <button type="button" onClick={() => setConfirm(true)} disabled={running || plan.pending === 0} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300">{running ? 'Upgrading… keep this page open' : 'Run data upgrade'}</button>
            </div>
          </div>
        )}
      {failures.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="font-bold">These records were left unchanged:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{failures.map((line, index) => <li key={index}>{line}</li>)}</ul>
        </div>
      )}
      <ConfirmModal isOpen={confirm} variant="info" title="Run the data upgrade?" confirmLabel="Run upgrade" onCancel={() => setConfirm(false)} onConfirm={() => void run()}
        message="Best done while nobody is entering orders. It can be run again at any time."
        consequences={['Earlier marketing sends leave the orders list and appear in Marketing Sends.', 'Existing orders receive short IDs, oldest first. The old ID stays searchable.', 'Daily Orders, dashboard and export totals drop by the number of marketing sends moved, because those were never sales.']} />
    </div>
  );
}
