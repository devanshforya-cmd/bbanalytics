'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight, ArrowUpRight } from 'lucide-react';
import { Customer } from '@/lib/types';

export interface ChurnItem {
  customer: Customer;
  daysInactive: number;
  prevFrequency: number;
  lastExpType: string;
  lastExpText: string;
  recommendedAction: string;
}

interface ChurnPredictionProps {
  churnAnalysis: ChurnItem[];
}

export default function ChurnPrediction({ churnAnalysis }: ChurnPredictionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-100 text-rose-700 text-xs font-black">
              2a
            </span>
            <h2 className="text-base font-bold text-slate-900">
              Churn Prediction Board (60+ Days Inactive)
            </h2>
            <span className="rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5">
              {churnAnalysis.length} Profiles
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Identifies buyers whose order gap exceeds 60 days, evaluated by previous order velocity and last recorded interaction.
          </p>
        </div>
        <span className="text-[11px] font-bold text-slate-400">Sorted by Karma (High Value Risk First)</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th className="py-3 px-3">Customer</th>
              <th className="py-3 px-3">Last Order Date</th>
              <th className="py-3 px-3 text-center">Days Inactive</th>
              <th className="py-3 px-3">Prev. Frequency</th>
              <th className="py-3 px-3 text-center">Karma Score</th>
              <th className="py-3 px-3">Last Experience</th>
              <th className="py-3 px-3">Recommended Action</th>
              <th className="py-3 px-3 text-right">Quick Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {churnAnalysis.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400">
                  No customers currently exceeding 60-day inactivity limit.
                </td>
              </tr>
            ) : (
              churnAnalysis.map((item) => (
                <tr key={item.customer.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-3">
                    <Link
                      href={`/customers/${encodeURIComponent(item.customer.phone)}`}
                      className="font-bold text-slate-900 hover:text-blue-600 flex items-center gap-1.5 group"
                    >
                      <span>{item.customer.name}</span>
                      <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition text-blue-600" />
                    </Link>
                    <div className="text-[10px] text-slate-400">{item.customer.phone}</div>
                  </td>
                  <td className="py-3 px-3 text-slate-600 font-medium">
                    {item.customer.lastOrderDate || '2026-06-12'}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="rounded-md bg-rose-100 text-rose-800 font-black px-2 py-0.5 text-[11px]">
                      {item.daysInactive} days
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-600 font-medium">
                    Every ~{item.prevFrequency} days
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        item.customer.karmaScore >= 80
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.customer.karmaScore >= 60
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {item.customer.karmaScore}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        item.lastExpType === 'RETURN'
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : item.lastExpType === 'FAILURE'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.lastExpText}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-medium text-slate-700">
                    {item.recommendedAction}
                  </td>
                  <td className="py-3 px-3 text-right">
                    <Link
                      href={`/customers/${encodeURIComponent(item.customer.phone)}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold text-[10px] hover:bg-slate-800 transition"
                    >
                      Engage <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
