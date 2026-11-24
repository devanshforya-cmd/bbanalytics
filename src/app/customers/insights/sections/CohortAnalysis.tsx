'use client';

import PagedList from '@/components/common/PagedList';
import React from 'react';
import Link from 'next/link';
import { Clock, ChevronRight } from 'lucide-react';
import { Customer } from '@/lib/types';

export interface OverdueItem {
  customer: Customer;
  cycle: number;
  daysSince: number;
  overdueBy: number;
}

export interface TimingPatternsData {
  /** Real average days between orders per segment; null when nobody in it has ordered twice. */
  segmentCycles: {
    VIP: number | null;
    LOYAL: number | null;
    REGULAR: number | null;
    AT_RISK: number | null;
  };
  overdueList: OverdueItem[];
  samples?: number;
}

export interface CohortRow {
  month: string;
  size: number;
  m1: string;
  m2: string;
  m3: string;
  activePct: string;
}

interface CohortAnalysisProps {
  timingPatterns: TimingPatternsData;
  cohortData: CohortRow[];
}

export default function CohortAnalysis({
  timingPatterns,
  cohortData,
}: CohortAnalysisProps) {
  return (
    <div className="space-y-8">
      {/* Purchase Timing Patterns */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Purchase timing patterns & overdue order detection
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Benchmark purchase intervals per tier and identify customers exceeding their expected re-order cycle.
            </p>
          </div>
        </div>

        {/* Segment Benchmarks */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'VIP segment', cycle: timingPatterns.segmentCycles.VIP, bg: 'bg-amber-50 text-amber-900 border-amber-200' },
            { label: 'Loyal regulars', cycle: timingPatterns.segmentCycles.LOYAL, bg: 'bg-blue-50 text-blue-900 border-blue-200' },
            { label: 'Regular customers', cycle: timingPatterns.segmentCycles.REGULAR, bg: 'bg-slate-50 text-slate-900 border-slate-200' },
            { label: 'At-risk candidates', cycle: timingPatterns.segmentCycles.AT_RISK, bg: 'bg-rose-50 text-rose-900 border-rose-200' },
          ].map((b) => (
            <div key={b.label} className={`rounded-xl border p-3 ${b.bg} text-center space-y-1`}>
              <div className="text-[11px] font-bold ">{b.label}</div>
              <div className="text-2xl font-black">{b.cycle === null ? '—' : `${b.cycle} days`}</div>
              <div className="text-[11px] opacity-75">{b.cycle === null ? 'Nobody here has ordered twice yet' : 'Average gap between orders'}</div>
            </div>
          ))}
        </div>

        {/* Overdue Order Alert Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              Overdue re-order detection (&gt;7 days beyond standard cycle)
            </h3>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              {timingPatterns.overdueList.length} Accounts Overdue
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200" tabIndex={0}>
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Segment</th>
                  <th className="py-3 px-3 text-center">Avg cycle</th>
                  <th className="py-3 px-3 text-center">Days inactive</th>
                  <th className="py-3 px-3 text-center">Overdue by</th>
                  <th className="py-3 px-3 text-right">Trigger action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {<PagedList items={timingPatterns.overdueList} label="customers" pageSize={10} asRow render={(pageRows) => pageRows.map((item) => (
                  <tr key={item.customer.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3">
                      <Link
                        href={`/customers/${encodeURIComponent(item.customer.phone)}`}
                        className="font-bold text-slate-900 hover:text-blue-600"
                      >
                        {item.customer.name}
                      </Link>
                      <div className="text-[11px] text-slate-500">{item.customer.phone}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="rounded bg-slate-100 text-slate-700 font-bold px-2 py-0.5 text-[11px]">
                        {item.customer.segment}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-medium text-slate-600">{item.cycle} days</td>
                    <td className="py-3 px-3 text-center font-bold text-slate-800">{item.daysSince} days</td>
                    <td className="py-3 px-3 text-center">
                      <span className="rounded bg-rose-100 text-rose-800 font-black px-2 py-0.5 text-[11px]">
                        +{item.overdueBy} days
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        href={`/customers/${encodeURIComponent(item.customer.phone)}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold text-[11px] hover:bg-slate-800 transition"
                      >
                        Nudge Re-Order <ChevronRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))} />}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Cohort Analysis */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Multi-month retention cohort analysis
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Heatmap matrix showing monthly retention rates across 30, 60, and 90-day intervals post-acquisition.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200" tabIndex={0}>
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-3">Acquisition cohort</th>
                <th className="py-3 px-3 text-center">Cohort size</th>
                <th className="py-3 px-3 text-center">Month 1 retention</th>
                <th className="py-3 px-3 text-center">Month 2 retention</th>
                <th className="py-3 px-3 text-center">Month 3 retention</th>
                <th className="py-3 px-3 text-right">Active today (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cohortData.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-xs text-slate-500">No first orders in the last 6 months yet. Cohorts appear as orders come in.</td></tr>
              )}
              {cohortData.map((row) => (
                <tr key={row.month} className="hover:bg-slate-50 transition">
                  <td className="py-3 px-3 font-bold text-slate-900">{row.month}</td>
                  <td className="py-3 px-3 text-center font-bold text-slate-700">{row.size} users</td>
                  <td className="py-3 px-3 text-center">
                    {row.m1 !== '—' ? (
                      <span className="rounded bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 text-[11px] border border-emerald-200">
                        {row.m1}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {row.m2 !== '—' ? (
                      <span className="rounded bg-emerald-50 text-emerald-800 font-semibold px-2 py-0.5 text-[11px] border border-emerald-100">
                        {row.m2}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {row.m3 !== '—' ? (
                      <span className="rounded bg-amber-50 text-amber-800 font-semibold px-2 py-0.5 text-[11px] border border-amber-100">
                        {row.m3}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-black text-slate-900">{row.activePct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
