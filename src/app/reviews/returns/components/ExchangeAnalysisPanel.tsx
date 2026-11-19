'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, Repeat } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import type { ReturnEntry } from '@/lib/types';
import { exchangeAnalysis } from '@/lib/exchange';

const Tile = ({ label, value, hint, tone = 'slate' }: { label: string; value: string; hint?: string; tone?: 'slate' | 'purple' | 'amber' | 'emerald' | 'rose' }) => {
  const tones = { slate: 'text-slate-900', purple: 'text-purple-700', amber: 'text-amber-700', emerald: 'text-emerald-700', rose: 'text-rose-700' };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-black tabular-nums ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
};

/** Exchange and refund analysis for the returns currently in view (filters apply). */
export default function ExchangeAnalysisPanel({ returns }: { returns: ReturnEntry[] }) {
  const [open, setOpen] = useState(false);
  const a = useMemo(() => exchangeAnalysis(returns, db.getOrders('ALL')), [returns]);
  if (!a.returns) return null;
  const days = (value: number | null) => value === null ? '—' : `${value} day${value === 1 ? '' : 's'}`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-xs" aria-labelledby="exchange-analysis">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between px-5 py-3 text-left">
        <span id="exchange-analysis" className="flex items-center gap-2 text-sm font-bold text-slate-900"><Repeat className="h-4 w-4 text-purple-600" /> Returns, exchanges and refunds</span>
        <span className="flex items-center gap-2 text-[11px] text-slate-500"><span className="hidden sm:inline">Exchange rate {a.exchangeRate}% · refund rate {a.refundRate}% · {a.units} unit{a.units === 1 ? '' : 's'}</span> <span className="font-semibold text-blue-700">{open ? 'Hide' : 'Show analysis'}</span> <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} /></span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-200 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Tile label="Exchange rate" value={`${a.exchangeRate}%`} hint="of decided returns" tone="purple" />
            <Tile label="Refund rate" value={`${a.refundRate}%`} hint="of decided returns" />
            <Tile label="Undecided" value={String(a.pendingCount)} hint="resolution pending" tone={a.pendingCount ? 'amber' : 'slate'} />
            <Tile label="Not linked" value={String(a.unlinked + a.awaitingReturn)} hint={`${a.unlinked} exchange${a.unlinked === 1 ? '' : 's'} without an order · ${a.awaitingReturn} exchange order${a.awaitingReturn === 1 ? '' : 's'} without a return`} tone={a.unlinked + a.awaitingReturn ? 'amber' : 'slate'} />
            <Tile label="Replacements delivered" value={`${a.replacementsDelivered}/${a.linked}`} hint={`${a.replacementsInTransit} on the way · ${a.replacementsFailed} failed`} tone="emerald" />
            <Tile label="Difference collected" value={`NPR ${a.differenceCollected.toLocaleString()}`} hint="on replacement orders" />
            <Tile label="Order → return" value={days(a.medianDaysOrderToReturn)} hint="median" />
            <Tile label="Return → replaced" value={days(a.medianDaysReturnToReplacementDelivered)} hint="median, delivered" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-1">
              <h3 className="mb-2 text-xs font-bold text-slate-800">How each reason was resolved</h3>
              <ul className="space-y-2">
                {a.reasonMatrix.map((row) => (
                  <li key={row.reason}>
                    <div className="flex justify-between text-[11px]"><span className="font-semibold text-slate-700">{row.reason}</span><span className="tabular-nums text-slate-500">{row.total}</span></div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${row.exchanged} exchanged, ${row.refunded} refunded, ${row.other} other`}>
                      <span className="bg-purple-500" style={{ width: `${(row.exchanged / row.total) * 100}%` }} />
                      <span className="bg-sky-400" style={{ width: `${(row.refunded / row.total) * 100}%` }} />
                      <span className="bg-slate-300" style={{ width: `${(row.other / row.total) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-500" /> Exchanged</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> Refunded</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" /> Pending / returned / rejected</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-xs font-bold text-slate-800">What came back → what we sent</h3>
              {a.swaps.length ? (
                <ul className="space-y-1.5 text-[11px]">
                  {a.swaps.map((swap) => (
                    <li key={`${swap.from}${swap.to}`} className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-slate-700"><span className="font-semibold">{swap.from}</span> <span className="text-slate-500">→</span> {swap.from === swap.to ? <span className="text-slate-500">same product</span> : swap.to}</span>
                      <span className="shrink-0 font-bold tabular-nums text-slate-900">{swap.count}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[11px] text-slate-500">Linked exchanges appear here once a replacement order is attached.</p>}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-xs font-bold text-slate-800">Most returned products</h3>
              <table className="w-full text-[11px]">
                <thead><tr className="text-left text-slate-500"><th className="pb-1 font-semibold">Product</th><th className="pb-1 text-right font-semibold">Units</th><th className="pb-1 text-right font-semibold">Exchanged</th></tr></thead>
                <tbody>
                  {a.topReturnedProducts.map((row) => (
                    <tr key={row.product} className="border-t border-slate-100"><td className="max-w-[160px] truncate py-1 text-slate-700">{row.product}</td><td className="py-1 text-right font-bold tabular-nums">{row.units}</td><td className="py-1 text-right tabular-nums text-purple-700">{row.exchangeShare}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
